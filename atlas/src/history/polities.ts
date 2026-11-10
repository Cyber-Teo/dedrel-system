// Государства для ленты и диаграммы Ганта: годы жизни и площадь по owners.yaml, правители по chronicle.yaml.
import { loadData } from '../data/load'
import type { OwnersFileT } from '../data/schema'
import { loadCellsFc } from '../geo/cells'
import { diffOwners, ownerAt, YEAR_END, type Shift } from './owners'
import { YEAR_MAX } from '../events'

export type Span = [number, number]
export type Ruler = { name: string; from: number; to: number }
export type Polity = {
  id: string
  name: string
  color: string
  spans: Span[]
  start: number
  end: number
  open: boolean
  rulers: Ruler[]
}

const [owners, chronicle] = await Promise.all([
  loadData<OwnersFileT>('history/owners'),
  loadData<{ dynasties_and_rulers: Raw[] }>('chronicle'),
])
const clean = (s: string) =>
  s
    .replace(/\s*\(.*?\)/g, '')
    .trim()
    .toLowerCase()

/** Первое целое в строке («≈−71», «135–140», «июль 1005»); «наст.» — YEAR_MAX; «?» — null. */
export function yearOf(s: string): number | null {
  if (/наст/.test(s)) return YEAR_MAX
  const m = s.replace(/−/g, '-').match(/-?\d+/)
  return m ? Number(m[0]) : null
}

type Raw = { polity: string; ruler: string; from: string; to: string }
const rawRulers = chronicle.dynasties_and_rulers

// интервалы жизни: по каждой ячейке отрезки [год записи, год следующей) с владельцем-государством
function spansByPolity(): Map<string, Span[]> {
  const out = new Map<string, Span[]>()
  for (const runs of Object.values(owners.cells)) {
    const rs = [...runs].sort((a, b) => a[0] - b[0])
    rs.forEach((r, i) => {
      if (!r[1]) return
      const to = i + 1 < rs.length ? rs[i + 1][0] : YEAR_MAX
      if (to <= r[0]) return
      out.set(r[1], [...(out.get(r[1]) ?? []), [r[0], to]])
    })
  }
  for (const [k, v] of out) {
    v.sort((a, b) => a[0] - b[0])
    const m: Span[] = []
    for (const s of v) {
      const l = m[m.length - 1]
      if (l && s[0] <= l[1]) l[1] = Math.max(l[1], s[1])
      else m.push([s[0], s[1]])
    }
    out.set(k, m)
  }
  return out
}

function rulersFor(name: string): Ruler[] {
  const key = clean(name)
  const rows = rawRulers.filter((r) => r.polity.split(' / ').some((p) => clean(p) === key) || clean(r.polity) === key)
  const out: Ruler[] = []
  rows.forEach((r, i) => {
    const from = yearOf(r.from) ?? out[out.length - 1]?.to ?? null
    if (from === null) return
    const next = rows
      .slice(i + 1)
      .map((n) => yearOf(n.from))
      .find((y) => y !== null)
    out.push({ name: r.ruler.replace(/\s*\(.*$/, '').trim(), from, to: yearOf(r.to) ?? next ?? YEAR_MAX })
  })
  return out
}

const spans = spansByPolity()
export const polities: Polity[] = Object.entries(owners.polities)
  .map(([id, p]) => {
    const sp = spans.get(id) ?? []
    return {
      id,
      name: p.name,
      color: p.color,
      spans: sp,
      start: sp.length ? sp[0][0] : YEAR_MAX,
      end: sp.length ? sp[sp.length - 1][1] : YEAR_MAX,
      open: sp.length > 0 && sp[sp.length - 1][1] >= YEAR_MAX,
      rulers: rulersFor(p.name),
    }
  })
  .filter((p) => p.spans.length)

export const aliveAt = (p: Polity, y: number) => p.spans.some((s) => y >= s[0] && y < s[1] + (s[1] >= YEAR_MAX ? 1 : 0))
export const rulerAt = (p: Polity, y: number) => p.rulers.find((r) => y >= r.from && y < r.to) ?? null

type CellInfo = { area: number; centroid: [number, number] }
let cellsP: Promise<Map<string, CellInfo>> | null = null
export const loadCells = () =>
  (cellsP ??= loadCellsFc().then(
    (fc) =>
      new Map<string, CellInfo>(
        fc.features.map((f): [string, CellInfo] => [
          f.properties.id,
          { area: f.properties.area_km2, centroid: f.properties.centroid },
        ]),
      ),
  ))

/** Площадь (км²) и ячейки каждого государства в году по owners. */
export function areasAt(
  cells: Map<string, CellInfo>,
  year: number,
  frac = YEAR_END,
): Map<string, { area: number; ids: string[] }> {
  const out = new Map<string, { area: number; ids: string[] }>()
  for (const [cid, runs] of Object.entries(owners.cells)) {
    const o = ownerAt(runs, year + frac).polity,
      c = cells.get(cid)
    if (!o || !c) continue
    const e = out.get(o) ?? { area: 0, ids: [] }
    e.area += c.area
    e.ids.push(cid)
    out.set(o, e)
  }
  return out
}

/** Участки без владельца в году (нет сведений или владелец — не государство из списка). */
export function unownedAt(
  cells: Map<string, CellInfo>,
  year: number,
  frac = YEAR_END,
): { area: number; ids: string[] } {
  const out = { area: 0, ids: [] as string[] }
  for (const [cid, runs] of Object.entries(owners.cells)) {
    const o = ownerAt(runs, year + frac).polity,
      c = cells.get(cid)
    if (!c || (o && polities.some((p) => p.id === o))) continue
    out.area += c.area
    out.ids.push(cid)
  }
  return out
}
/** Переходы между годами: «перешло от A к B» (имена — из owners.polities). */
export const shiftsBetween = (cells: Map<string, CellInfo>, y0: number, y1: number): Shift[] =>
  diffOwners(
    owners.cells,
    y0,
    y1,
    (id) => (id && owners.polities[id]?.name) || '«без владельца»',
    (cid) => cells.get(cid)?.area ?? 0,
  )

/** Клетки года с владельцем по достоверности: факт / вывод / гипотеза (сумма = число закрашенных клеток). */
export function confidenceCounts(
  year: number,
  frac = YEAR_END,
): { canon: number; derived: number; speculative: number; total: number } {
  const out = { canon: 0, derived: 0, speculative: 0, total: 0 }
  for (const runs of Object.values(owners.cells)) {
    const o = ownerAt(runs, year + frac)
    if (!o.polity || !o.confidence) continue
    out[o.confidence]++
    out.total++
  }
  return out
}
