// Связи карточек досье с событиями: хроника места, события с участием человека, связи, сценарий события. Чистая логика над данными.
import { events, yearG, type Ev } from '../events'
import { eventIcon } from '../layers/icons'
import { relations, TYPE_RU, type Rel } from '../graph/data'
import { scenarios } from '../scenarios/scenarios'
import { titleStems } from '../dedupe'
import { mergedInto, personBy, type Person } from './data'
import { norm } from './rank'

/** Тип события по-русски (по ключам данных); «other» и неизвестное — без подписи. */
export const EV_TYPE_RU: Record<string, string> = {
  war: 'Война',
  battle: 'Сражение',
  treaty: 'Договор',
  founding: 'Основание',
  dynasty: 'Смена власти',
  rebellion: 'Восстание',
  coronation: 'Коронация',
  economy: 'Экономика',
  independence: 'Независимость',
  migration: 'Переселение',
  catastrophe: 'Катастрофа',
  religion: 'Религия',
  annexation: 'Присоединение',
  discovery: 'Открытие',
  plague: 'Эпидемия',
  magic: 'Магия',
}
const PLAGUE = /чум[аыуе]|\bмор\b|карантин|эпидеми/i
/** Ключ значка и тип события — как на карте (чума в заголовке важнее типа). */
export const evKind = (e: Pick<Ev, 'title' | 'type'>) => (PLAGUE.test(e.title) ? 'plague' : (e.type ?? 'other'))
export const evTypeText = (e: Pick<Ev, 'title' | 'type'>) => EV_TYPE_RU[evKind(e)] ?? 'Событие'
export const evIconKey = (e: Pick<Ev, 'title' | 'type'>) => eventIcon(evKind(e))

const WEIGHT: Record<string, number> = {
  plague: 5,
  catastrophe: 5,
  war: 4,
  rebellion: 4,
  independence: 4,
  battle: 3,
  founding: 3,
  annexation: 3,
  coronation: 2,
  treaty: 2,
  dynasty: 2,
  religion: 2,
  magic: 2,
  discovery: 2,
  migration: 1,
  economy: 1,
}
const score = (e: Ev) => (WEIGHT[evKind(e)] ?? 0) * 2 + Math.min(e.sources.length, 6)

/** События места (по полю places, включая скрытые дубли записи): все по году и «главные» — по значимости, не больше одного на год. */
export function placeChronicle(placeId: string, top = 5): { all: Ev[]; top: Ev[] } {
  const ids = new Set([placeId, ...mergedInto(placeId).map((d) => d.id)])
  const all = events
    .filter((e) => e.year != null && e.places.some((id) => ids.has(id)))
    .sort((a, b) => a.year! - b.year!)
  const picked: Ev[] = [],
    years = new Set<number>()
  for (const e of [...all].sort((a, b) => score(b) - score(a) || a.year! - b.year!)) {
    if (picked.length >= top) break
    if (years.has(e.year!)) continue
    years.add(e.year!)
    picked.push(e)
  }
  return { all, top: picked.sort((a, b) => a.year! - b.year!) }
}

/** События, где человек назван участником: по id в actors, иначе по точному имени или псевдониму. */
export function personEvents(p: Person): Ev[] {
  const names = new Set([p.name, ...(p.aliases ?? [])].map(norm))
  return events
    .filter(
      (e) =>
        e.year != null && (e.actors ?? []).some((a) => (a as { id?: string }).id === p.id || names.has(norm(a.name))),
    )
    .sort((a, b) => a.year! - b.year!)
}

/** Связи человека из relations.yaml; второй конец — только если он есть среди людей (иначе ссылки не получится). */
export function personRelations(id: string): { other: Person; type: string; note: string; rel: Rel }[] {
  const out: { other: Person; type: string; note: string; rel: Rel }[] = [],
    seen = new Set<string>()
  for (const r of relations) {
    const o = r.a === id ? r.b : r.b === id ? r.a : null,
      other = o ? personBy.get(o) : undefined
    if (!other || other.id === id || seen.has(other.id + r.type)) continue
    seen.add(other.id + r.type)
    out.push({ other, type: TYPE_RU(r.type), note: r.note, rel: r })
  }
  return out
}

/** Сценарий, разбирающий это событие: основа названия сценария («Иллиорская революция (817)») входит в заголовок события, а год — среди лет шагов. */
export function scenarioOf(e: Pick<Ev, 'title' | 'year'>) {
  const t = new Set(titleStems(e.title))
  return scenarios.find((s) => {
    const base = titleStems(s.title.replace(/\s*\([^)]*\)/g, ''))
    return base.length > 0 && base.every((w) => t.has(w)) && s.steps.some((st) => st.date.year === e.year)
  })
}

const MONTH = /^(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)/i
/** «Май 1005 г.»: дата из date_text с годом один раз; нет месяца — просто «1005 г.». */
const monthParts = (e: Pick<Ev, 'year' | 'date_text'>) => {
  const dt = (e.date_text ?? '').trim(),
    y = Math.abs(e.year!)
  return MONTH.test(dt) && new RegExp(`(^|[^\\d])${y}(?!\\d)`).test(dt) ? dt.match(new RegExp(`^(.*?${y})`)) : null
}
/** Дата из date_text содержит месяц — тогда она целиком выводится строкой «Май 1005 г.» и отдельно повторять её не нужно. */
export const monthDated = (e: Pick<Ev, 'year' | 'date_text'>) => !!monthParts(e)
export function dateLine(e: Pick<Ev, 'year' | 'date_text'>): string {
  const dt = (e.date_text ?? '').trim(),
    y = e.year!,
    m = monthParts(e)
  if (!m) return /^(?:около|≈|~)/i.test(dt) ? `≈${yearG(y)}` : yearG(y)
  const s = m[1].replace(/\s*г\.?$/, '').trim()
  return s.charAt(0).toUpperCase() + s.slice(1) + ' г.'
}
/** Префикс «Август 1005:» в заголовке убирается, если дата уже выведена строкой выше. */
export function titleNoDate(title: string, year: number): string {
  const m = /^\s*(?:[А-Яа-яЁё]+\s+)?[-−–]?(\d{1,4})\s*(?:г\.?)?\s*[:—–-]\s+/.exec(title)
  return m && Number(m[1]) === Math.abs(year) ? title.slice(m[0].length).replace(/^./, (c) => c.toUpperCase()) : title
}
