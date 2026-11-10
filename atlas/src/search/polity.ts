// Досье государства и история владения ячейки: чистая логика над owners.yaml.
import { norm } from './rank'
import type { Run } from '../history/owners'

export type Runs = Record<string, Run[]>
export type Span = { polity: string | null; conf: Run[2]; from: number; to: number | null; sources: string[] }

/** Лента владения ячейки: подряд идущие записи с тем же владельцем и достоверностью сливаются; to=null — до последнего кадра. */
export function cellHistory(runs: Run[]): Span[] {
  const rs = [...runs].sort((a, b) => a[0] - b[0]),
    out: Span[] = []
  for (const [y, polity, conf, sources] of rs) {
    const last = out[out.length - 1]
    if (last && last.polity === polity && last.conf === conf) {
      last.sources = [...new Set([...last.sources, ...sources])]
      continue
    }
    if (last) last.to = y
    out.push({ polity, conf, from: y, to: null, sources: [...sources] })
  }
  return out
}

/** Годы жизни по owners: первый кадр владения; конец — самая поздняя смена владельца, null — владеет в последнем кадре. */
export function lifespan(cells: Runs, id: string): { first: number; last: number | null; cells: number } | null {
  let first = Infinity,
    last = -Infinity,
    ongoing = false,
    n = 0
  for (const runs of Object.values(cells)) {
    let had = false
    for (const s of cellHistory(runs))
      if (s.polity === id) {
        had = true
        first = Math.min(first, s.from)
        if (s.to === null) ongoing = true
        else last = Math.max(last, s.to)
      }
    if (had) n++
  }
  return n ? { first, last: ongoing ? null : last, cells: n } : null
}

/** Предшественник и преемник по смене владельцев опорной ячейки (null-владельцы пропускаются). */
export function neighbours(runs: Run[], id: string): { prev: string | null; next: string | null } {
  const h = cellHistory(runs).filter((s) => s.polity)
  const i = h.findIndex((s) => s.polity === id)
  if (i < 0) return { prev: null, next: null }
  let j = h.length - 1
  while (h[j].polity !== id) j--
  return { prev: h[i - 1]?.polity ?? null, next: h[j + 1]?.polity ?? null }
}

const stem = (s: string) => norm(s.replace(/\(.*?\)/g, ''))
/** Одно ли это государство в разных реестрах (имена в хронике и в owners пишутся по-разному). */
export function samePolity(a: string, b: string): boolean {
  const x = stem(a),
    y = stem(b)
  if (!x || !y) return false
  return x === y || (Math.min(x.length, y.length) >= 6 && (x.includes(y) || y.includes(x)))
}

export const CONF_RU = { canon: 'факт', derived: 'вывод', speculative: 'гипотеза' } as const
export const confRu = (c: Run[2]) => (c ? CONF_RU[c] : 'нет сведений')

/** Отрезки жизни государства по всем ячейкам: [с года, по год включительно] в целых годах. */
export function polityYears(cells: Runs, id: string, yearEnd = 1006): [number, number][] {
  const out: [number, number][] = []
  for (const runs of Object.values(cells))
    for (const s of cellHistory(runs))
      if (s.polity === id)
        out.push([Math.floor(s.from), s.to === null ? yearEnd : Math.max(Math.floor(s.from), Math.ceil(s.to) - 1)])
  return out
}
/** Ближайший к year год, когда у государства есть ячейки; null — ячеек нет вовсе. */
export function nearestYearWith(cells: Runs, id: string, year: number): number | null {
  let best: number | null = null
  for (const [a, b] of polityYears(cells, id)) {
    const y = Math.min(Math.max(year, a), b)
    if (best === null || Math.abs(y - year) < Math.abs(best - year)) best = y
  }
  return best
}

const GEN_MONTH: Record<string, string> = {
  январь: 'января',
  февраль: 'февраля',
  март: 'марта',
  апрель: 'апреля',
  май: 'мая',
  июнь: 'июня',
  июль: 'июля',
  август: 'августа',
  сентябрь: 'сентября',
  октябрь: 'октября',
  ноябрь: 'ноября',
  декабрь: 'декабря',
  осень: 'осени',
  зима: 'зимы',
  весна: 'весны',
  лето: 'лета',
}
const genitive = (t: string) => t.replace(/^(\p{L}+)/u, (w) => GEN_MONTH[w.toLowerCase()] ?? w)
/** Срок правителя простым текстом: «с 325», «до 394», «985 — по наши дни», «(852 г. — единственное упоминание)». Знаков «?» и «наст.» не выводит. */
export function rulerSpan(from: string, to: string): string {
  const f = from.trim(),
    t = to.trim()
  const unk = (v: string) => !v || /^[?—–-]+(\s*\(.*\))?$/.test(v)
  const now = /^наст\.?$/i.test(t)
  const note = /^[?—–-]+\s*\((.*)\)$/.exec(f)?.[1]
  if (unk(f)) {
    if (note && /^\d{1,4}$/.test(note.trim())) return `(${note.trim()} г. — единственное упоминание)`
    if (now) return 'до наших дней'
    return unk(t) ? 'даты не указаны' : `до ${genitive(t)}`
  }
  if (now) return `${f} — по наши дни`
  return unk(t) ? `с ${f}` : `${f}–${t}`
}
