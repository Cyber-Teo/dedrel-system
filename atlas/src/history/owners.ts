// Владельцы ячеек по годам (data/history/owners.yaml). Чистая логика без карты.
import type { OwnersFileT } from '../data/schema'

export type Run = OwnersFileT['cells'][string][number]
export type Owner = {
  polity: string | null
  confidence: 'canon' | 'derived' | 'speculative' | null
  sources: string[]
  from: number | null
}

/** Владелец на год: последняя запись с годом ≤ year; нет записи — «нет сведений» (polity=null, from=null). */
export function ownerAt(runs: Run[] | undefined, year: number): Owner {
  let hit: Run | undefined
  for (const r of runs ?? []) if (r[0] <= year && (!hit || r[0] >= hit[0])) hit = r
  return hit
    ? { polity: hit[1], confidence: hit[2], sources: hit[3], from: hit[0] }
    : { polity: null, confidence: null, sources: [], from: null }
}

/** Конец года по умолчанию: кадры 1005.x и 1006 — раньше выбранной доли года не скрываются. */
export const YEAR_END = 0.99
/** Владелец на год с долей (frac 0…0.99): кадры 1005.0 / 1005.5 / 1005.85. Без frac — состояние на конец года. */
export const ownersAt = (cells: Record<string, Run[]>, year: number, frac = YEAR_END): Map<string, Owner> =>
  new Map(Object.entries(cells).map(([id, runs]) => [id, ownerAt(runs, year + frac)]))

/** Суффикс подписи дробного кадра года: 1005.5 → « (лето)», 1005.85 → « (с 7 ноября)»; целый год — пусто. */
export function frameSuffix(y: number): string {
  const f = y - Math.floor(y)
  if (f < 0.01) return ''
  return f < 0.7 ? ' (лето)' : ' (с 7 ноября)'
}

type Cell = { id: string; centroid: [number, number]; area: number }
const weighted = (cells: Cell[]): Cell => {
  const A = cells.reduce((s, c) => s + c.area, 0)
  const mx = cells.reduce((s, c) => s + c.centroid[0] * c.area, 0) / A,
    my = cells.reduce((s, c) => s + c.centroid[1] * c.area, 0) / A
  return cells.reduce((b, c) =>
    Math.hypot(c.centroid[0] - mx, c.centroid[1] - my) < Math.hypot(b.centroid[0] - mx, b.centroid[1] - my) ? c : b,
  )
}
/** Связные компоненты ячеек по соседству adj (нет adj — одна компонента). */
export function components(cells: Cell[], adj?: Map<string, Set<string>>): Cell[][] {
  if (!adj) return [cells]
  const byId = new Map(cells.map((c) => [c.id, c])),
    seen = new Set<string>(),
    out: Cell[][] = []
  for (const c of cells) {
    if (seen.has(c.id)) continue
    const comp: Cell[] = [],
      st = [c.id]
    seen.add(c.id)
    while (st.length) {
      const id = st.pop()!
      comp.push(byId.get(id)!)
      for (const n of adj.get(id) ?? [])
        if (byId.has(n) && !seen.has(n)) {
          seen.add(n)
          st.push(n)
        }
    }
    out.push(comp)
  }
  return out
}
/** Ячейка подписи государства: в крупнейшей (по площади) связной части — ближайшая к её взвешенному центру. */
export function labelCell(cells: Cell[], adj?: Map<string, Set<string>>): Cell | null {
  if (!cells.length) return null
  const area = (cs: Cell[]) => cs.reduce((s, c) => s + c.area, 0)
  return weighted(components(cells, adj).reduce((b, c) => (area(c) > area(b) ? c : b)))
}

/** Участки, сменившие владельца между годами y0 и y1 (конец года): группы «от кого → к кому». Нет владельца — «без владельца». */
export type Shift = { from: string; to: string; ids: string[]; area: number }
export function diffOwners(
  cells: Record<string, Run[]>,
  y0: number,
  y1: number,
  name: (id: string | null) => string,
  area: (cid: string) => number = () => 0,
): Shift[] {
  const g = new Map<string, Shift>()
  for (const [cid, runs] of Object.entries(cells)) {
    const a = ownerAt(runs, y0 + YEAR_END).polity,
      b = ownerAt(runs, y1 + YEAR_END).polity
    if (a === b) continue
    const k = `${a}\u0000${b}`,
      e = g.get(k) ?? g.set(k, { from: name(a), to: name(b), ids: [], area: 0 }).get(k)!
    e.ids.push(cid)
    e.area += area(cid)
  }
  return [...g.values()].sort((p, q) => q.ids.length - p.ids.length)
}

/** Переходы для списка: группы по именам «от → к», разные id с одним именем склеиваются; пары «X → X» уходят в счётчик same (статус или название сменились, государство то же). Сортировка по площади, затем по числу участков. */
export function listShifts(shifts: Shift[]): { rows: Shift[]; same: number } {
  const g = new Map<string, Shift>()
  let same = 0
  for (const t of shifts) {
    if (t.from === t.to) {
      same += t.ids.length
      continue
    }
    const k = `${t.from}\u0000${t.to}`,
      e = g.get(k) ?? g.set(k, { from: t.from, to: t.to, ids: [], area: 0 }).get(k)!
    e.ids.push(...t.ids)
    e.area += t.area
  }
  return { rows: [...g.values()].sort((a, b) => b.area - a.area || b.ids.length - a.ids.length), same }
}

/** Второй год сравнения в хеше: cmp=573 (ключ cmp; остальные ключи не трогаем). Нет года 0 — как в шкале. */
export function readCmp(h: string): number | null {
  const v = new URLSearchParams(h.replace(/^#/, '')).get('cmp')
  return v !== null && v !== '' && Number.isFinite(Number(v)) ? Math.round(Number(v)) : null
}
export function withCmp(h: string, cmp: number | null): string {
  const p = new URLSearchParams(h.replace(/^#/, ''))
  if (cmp === null) p.delete('cmp')
  else p.set('cmp', String(cmp))
  return '#' + p.toString().replace(/%2C/g, ',')
}
