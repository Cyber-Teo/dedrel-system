// Данные поиска и досье: места, люди, организации, государства, события в одном индексе.
import { loadData } from '../data/load'
import { loadCellsFc } from '../geo/cells'
import type { OwnersFileT } from '../data/schema'
import { events, yearLabel, YEAR_MAX, YEAR_MIN, type Ev } from '../events'
import { samePolity, lifespan, neighbours, type Runs } from './polity'
import { polities as rawPolities, type Polity } from '../history/polities'
import { firstYear, yearsText } from './card'
import { cleanNote } from './clean'
import { norm, type Entry } from './rank'
import { KIND_RU, orgKindRu } from './kinds'
export { KIND_RU } from './kinds'

export type Place = {
  id: string
  name: string
  kind?: string
  parent_text?: string
  hint?: string
  facts?: string
  slug?: string
  x?: number
  y?: number
  aliases?: string[]
  confidence?: string
  sources?: string[]
}
export type Person = {
  id: string
  name: string
  role?: string
  affiliation?: string
  years?: string
  based_in?: string
  notable?: string
  slug?: string
  aliases?: string[]
}
export type Org = {
  id: string
  name: string
  slug?: string
  kind?: string
  hq?: string
  leader?: string
  presence?: string
  influence?: string
  aliases?: string[]
}
type Link = { ref: string; place: string }
export type CellP = {
  id: string
  name: string
  region_name: string
  centroid: [number, number]
  area_km2: number
  place?: string
}

const arr = <T>(n: string) => loadData<T[] | null>(n).then((v) => v ?? [])
const [placesAll0, people0, orgs0, peopleLoc0, guildHq0, capitals0, ownersFile0, chronicle0, wikiTitles0] =
  await Promise.all([
    arr<Place>('places'),
    arr<Person>('people'),
    arr<Org>('orgs'),
    arr<Link>('people-loc'),
    arr<Link>('guild-hq'),
    arr<{ place: string; state: string }>('capitals'),
    loadData<OwnersFileT>('history/owners'),
    loadData<{ dynasties_and_rulers: Ruler[] }>('chronicle'),
    loadData<{ titles: Record<string, string>; gov: Record<string, string> }>('wiki-titles'),
  ])
export const placesAll = placesAll0
export const people = people0
export const orgs = orgs0
export const placeBy = new Map(placesAll.map((p) => [p.id, p]))
export const personBy = new Map(people.map((p) => [p.id, p]))
export const orgBy = new Map(orgs.map((o) => [o.id, o]))
const personPlace = new Map(peopleLoc0.map((l) => [l.ref, l.place]))
const orgPlace = new Map(guildHq0.map((l) => [l.ref, l.place]))
export const placeOfPerson = (id: string) => placeBy.get(personPlace.get(id) ?? '')
export const placeOfOrg = (id: string) => placeBy.get(orgPlace.get(id) ?? '')

export const ownersFile = ownersFile0
export const cellRuns = ownersFile.cells as Runs
export const polities = ownersFile.polities
const capitalOf = new Map(capitals0.map((c) => [c.state, c.place]))

type Ruler = { polity: string; ruler: string; from: string; to: string; source?: string }
const rulers: Ruler[] = chronicle0.dynasties_and_rulers

/** Дубли в данных: скрытая запись → основная. В выдаче поиска показывается только основная, её карточка дополняется текстом скрытой. */
export const DUP_OF: Record<string, string> = {
  'geo:illior_gorod': 'countries/illior_empire/cities/city_illior',
  'geo:danir': 'geo:danir_gorod',
  'geo:moroznoe_boloto': 'geography/frosty_marsh',
  'geo:vilarin_gorod': 'geo:vilarin', // «Виларин · столица» без точки; координата — у «Виларин · город»
}
export const mergedInto = (id: string) =>
  Object.entries(DUP_OF)
    .filter(([, k]) => k === id)
    .map(([h]) => placeBy.get(h)!)
    .filter(Boolean)
/** Имя без хвоста «(город)»: тип показывает подпись. */
export const placeTitle = (p: Place) => p.name.replace(/\s*\(город\)$/, '')
/** Подпись типа места: «Столица империи» для столиц государств, иначе тип по-русски. */
const GEN: [RegExp, string][] = [
  [/^Иллиорская империя/, 'империи'],
  [/^Королевство (.+)$/, 'королевства $1'],
  [/^Княжество (.+)$/, 'княжества $1'],
  [/^Республика (.+)$/, 'республики $1'],
]
export function capitalOfName(placeId: string): string | null {
  const st = [...capitalOf.entries()].find(([, pl]) => pl === placeId)?.[0]
  const n = st && polities[st]?.name.replace(/\s*\(.*?\)/g, '')
  if (!n) return null
  for (const [re, to] of GEN) if (re.test(n)) return 'Столица ' + n.replace(re, to)
  return `Столица · ${n}`
}
/** Государство, столицей которого является место (для герба в шапке карточки). */
export const capitalPolity = (placeId: string): string | null =>
  [...capitalOf.entries()].find(([, pl]) => pl === placeId)?.[0] ?? null
export const kindLabel = (p: Place) =>
  (p.kind === 'capital' ? capitalOfName(p.id) : null) ?? (p.kind === 'other' ? 'место' : (KIND_RU[p.kind ?? ''] ?? ''))

// «Префектура мертвецов (бывший Арност)» — это же и место «Префектура мертвецов (Арност)»: отдельная строка не нужна
const polityNames = new Set(
  Object.values(polities).flatMap((p) => [
    norm(p.name),
    norm(p.name.replace(/\s*\(.*?\)/g, '')),
    norm(p.name.replace(/\(бывший\s+/, '(')),
  ]),
)
/** Место, которое просто повторяет государство («Королевство Ройо»), в выдаче не нужно: есть запись государства. */
const nameCount = new Map<string, number>()
for (const p of placesAll)
  if (p.kind === 'city' || p.kind === 'capital') nameCount.set(norm(p.name), (nameCount.get(norm(p.name)) ?? 0) + 1)
/** Единственный город/столица с таким именем («Иллиор») не дубль государства: иначе поиск не находит сам город. */
const isPolityDup = (p: Place) =>
  polityNames.has(norm(p.name)) && !((p.kind === 'city' || p.kind === 'capital') && nameCount.get(norm(p.name)) === 1)
const placeNames = new Set(
  placesAll
    .filter((p) => !p.name.includes('(маркер карты)') && p.kind !== 'label' && !DUP_OF[p.id] && !isPolityDup(p))
    .map((p) => norm(placeTitle(p))),
)
/** Записи государств с одним именем («Префектура мертвецов (бывший Арност)» ×2) — одно государство: отрезки жизни сливаются, id — у живой сегодня записи. Список «Государства» и поиск берут годы отсюда. */
export type MPolity = Polity & { ids: string[] }
export const mergedPolities: MPolity[] = (() => {
  const by = new Map<string, MPolity>()
  for (const g of rawPolities) {
    const prev = by.get(g.name)
    if (!prev) {
      by.set(g.name, { ...g, spans: g.spans.map((s) => [...s] as [number, number]), ids: [g.id] })
      continue
    }
    const sp = [...prev.spans, ...g.spans].sort((x, y) => x[0] - y[0]),
      m: [number, number][] = []
    for (const s of sp) {
      const l = m[m.length - 1]
      if (l && s[0] <= l[1]) l[1] = Math.max(l[1], s[1])
      else m.push([s[0], s[1]])
    }
    prev.spans = m
    prev.start = m[0][0]
    prev.end = m[m.length - 1][1]
    prev.ids.push(g.id)
    if (g.open && !prev.open) {
      prev.id = g.id
      prev.rulers = g.rulers
      prev.color = g.color
    }
    prev.open = prev.open || g.open
  }
  return [...by.values()]
})()
/** Годы жизни государства для поиска и досье: те же, что в «Списки → Государства». to=null — по наше время. */
const lifeBy = new Map(
  mergedPolities.flatMap((g) =>
    g.ids.map(
      (id) =>
        [
          id,
          { from: Math.round(g.start), to: g.open ? null : Math.round(g.end) } as { from: number; to: number | null },
        ] as const,
    ),
  ),
)
export function polityLife(id: string): { from: number; to: number | null } | null {
  return lifeBy.get(id) ?? null
}
/** Подпись лет в списке государств: «672 — н. в.»; с разрывом — «151–206, с 573». */
export function listSpan(g: Polity): string {
  const y = (v: number) => (v >= YEAR_MAX ? 'н. в.' : v <= YEAR_MIN ? '…' : yearLabel(Math.round(v)))
  if (g.spans.length < 2) return `${y(g.start)} — ${g.open ? 'н. в.' : y(g.end)}`
  return g.spans
    .map(([a, b], i) => (i === g.spans.length - 1 && b >= YEAR_MAX ? `с ${y(a)}` : `${y(a)}–${y(b)}`))
    .join(', ')
}
/** Диапазон лет для подписи; начало позже конца — диапазона нет (данные противоречат). */
const lifeText = (l: { from: number; to: number | null }) =>
  l.to !== null && l.from > l.to ? '' : `${l.from}–${l.to ?? 'н. в.'}`.replace(/-(\d)/g, '−$1')
/** Имя в выдаче: если есть место с тем же названием, государство различаем годами жизни. */
function polityLabel(id: string, name: string) {
  const y = polityLife(id)
  if (!y || !placeNames.has(norm(name.replace(/\s*\(.*?\)/g, ''))) || !lifeText(y)) return name
  return `${name.replace(/\s*\(.*?\)/g, '')} (${yearLabel(y.from)}–${y.to === null ? 'н. в.' : yearLabel(y.to)})`
}

/** Записи государств с одинаковым отображаемым именем («Префектура мертвецов (бывший Арност)» ×2) сводятся в одну строку: годы объединяются, ведёт запись, живая сегодня. */
function polityEntries(): Entry[] {
  const by = new Map<string, { id: string; name: string; p: { name: string }; from: number; to: number | null }>()
  for (const [id, p] of Object.entries(polities)) {
    const l = polityLife(id),
      name = polityLabel(id, p.name),
      prev = by.get(name)
    if (!prev) {
      by.set(name, { id, name, p, from: l?.from ?? NaN, to: l ? l.to : null })
      continue
    }
    if (l) {
      prev.from = Number.isNaN(prev.from) ? l.from : Math.min(prev.from, l.from)
      prev.to = prev.to === null || l.to === null ? null : Math.max(prev.to, l.to)
    }
    if (l && l.to === null) prev.id = id
  }
  return [...by.values()].map(({ id, name, p, from, to }) => {
    const life = Number.isNaN(from) ? '' : lifeText({ from, to })
    return {
      id,
      group: 'polity' as const,
      name,
      aliases:
        name !== p.name || p.name.includes('(')
          ? [
              p.name.replace(/\s*\(.*?\)/g, ''),
              ...(/\(бывший\s+(.+?)\)/.exec(p.name) ? [/\(бывший\s+(.+?)\)/.exec(p.name)![1]] : []),
            ]
          : [],
      sub: life ? `государство, ${life}` : 'государство',
      icon: 'polity',
    }
  })
}

/** Годы человека для подписи: «император, император с 985» → «император, 985 — н. в.» (слово роли не повторяем, «с N» — до наших дней). */
function personYears(p: Person): string | null {
  let y = yearsText(p.years)
  if (!y) return null
  const role = cleanNote(p.role).text.toLowerCase()
  if (role && y.toLowerCase().startsWith(role + ' ')) y = y.slice(role.length + 1)
  return y.replace(/^с\s+(−?-?\d+)$/, '$1 — н. в.')
}
/** Год начала для порядка внутри рода (Малдред: Гней 210, Маний 214, … Йорик 985). */
function personYear(p: Person): number | undefined {
  const m = /(?:^|\D)([-−])?(\d{1,4})/.exec((p.years ?? '').replace(/≈/g, ''))
  return m ? (m[1] ? -Number(m[2]) : Number(m[2])) : undefined
}

/** Точка места на карте: своя, иначе точка слитого дубля. null — места нет на карте. */
export const placeXY = (p: Place | undefined): { x: number; y: number } | null => {
  const q = [p, ...(p ? mergedInto(p.id) : [])].find((d) => d && typeof d.x === 'number' && typeof d.y === 'number')
  return q ? { x: q.x!, y: q.y! } : null
}

export const index: Entry[] = [
  ...placesAll
    .filter((p) => !p.name.includes('(маркер карты)') && p.kind !== 'label' && !DUP_OF[p.id] && !isPolityDup(p))
    .map((p) => ({
      id: p.id,
      group: 'place' as const,
      name: placeTitle(p),
      aliases: [...(p.aliases ?? []), ...(p.name !== placeTitle(p) ? [p.name] : [])],
      sub: [p.kind === 'capital' ? 'столица' : KIND_RU[p.kind ?? ''], cleanNote(p.parent_text).text]
        .filter(Boolean)
        .join(', '),
      icon: p.kind,
      kind: p.kind,
      conf: p.confidence,
      nomap: !placeXY(p),
    })),
  ...polityEntries(),
  ...people.map((p) => ({
    id: p.id,
    group: 'person' as const,
    name: p.name,
    aliases: p.aliases ?? [],
    sub: [cleanNote(p.role).text, personYears(p)].filter(Boolean).join(', '),
    icon: 'person',
    year: personYear(p),
  })),
  ...orgs.map((o) => ({
    id: o.id,
    group: 'org' as const,
    name: o.name,
    aliases: o.aliases ?? [],
    sub: orgKindRu(o.kind),
    icon: 'org',
    kind: o.kind,
  })),
]
const eventEntry = (e: Ev): Entry => ({
  id: e.id,
  group: 'event',
  name: e.title,
  aliases: [],
  sub: yearLabel(e.year!),
  year: e.year!,
  icon: 'event',
  kind: e.type ?? 'other',
})
/** Переналожить события (в т.ч. мастерские после входа/выхода) на поисковый индекс. */
export function syncEventIndex() {
  for (let i = index.length - 1; i >= 0; i--) if (index[i].group === 'event') index.splice(i, 1)
  index.push(...events.map(eventEntry))
}
syncEventIndex()

let cellsP: Promise<CellP[]> | null = null
export const loadCells = () =>
  (cellsP ??= loadCellsFc().then((fc) => fc.features.map((f) => f.properties as unknown as CellP)))

export const polityWiki = (id: string) => (id.startsWith('countries/') ? id : null)

export function polityDossier(id: string, cells: CellP[]) {
  const name = polities[id].name
  const life = lifespan(cellRuns, id)
  // опорная ячейка: столица, иначе самая большая ячейка государства
  const capPlace = capitalOf.get(id)
  let ref = capPlace ? cells.find((c) => c.place === capPlace) : undefined
  if (ref && !cellRuns[ref.id]?.some((r) => r[1] === id)) ref = undefined
  if (!ref)
    ref = cells.filter((c) => cellRuns[c.id]?.some((r) => r[1] === id)).sort((a, b) => b.area_km2 - a.area_km2)[0]
  const nb = ref ? neighbours(cellRuns[ref.id], id) : { prev: null, next: null }
  const rs = rulers.filter((r) => samePolity(r.polity, name))
  const evs = events.filter(
    (e) =>
      [...(e.territorial_change?.gains ?? []), ...(e.territorial_change?.losses ?? [])].some((x) =>
        samePolity(x.polity, name),
      ) || (e.actors ?? []).some((a) => samePolity(a.name, name)),
  )
  // год основания — самая ранняя дата правителя в хронике («560/562» → 560); нет даты — null
  const ys = rs.map((r) => firstYear(r.from)).filter((y): y is number => y !== null)
  const founded = ys.length ? Math.min(...ys) : null
  return { name, color: polities[id].color, life, ref, ...nb, rulers: rs, events: evs, founded, gov: polityGov(id) }
}

// Названия страниц вики и «Правительство:» стран — из data/wiki-titles.json (scripts/import/build-wiki-titles.mjs).
const wt = wikiTitles0
export const wikiTitle = (slug: string) => wt.titles[slug] ?? null
export const polityGov = (id: string) => wt.gov[id] ?? null
/** Подпись источника для людей: название страницы вики / места / «карта: …»; нераспознанное (сырой slug) — null, не показываем. */
export function sourceLabel(s: string): { label: string; slug?: string } | null {
  if (s.startsWith('map:')) return { label: 'карта: ' + s.slice(4) }
  if (s.startsWith('geo:') || placeBy.has(s)) {
    const p = placeBy.get(s)
    return p ? { label: placeTitle(p), slug: p.slug } : null
  }
  const t = wikiTitle(s) ?? wikiTitle(s + '/index')
  if (t) return { label: t, slug: s }
  const pe = personBy.get(s) ?? personBy.get(s.replace(/^person:/, 'person:'))
  return pe ? { label: pe.name, slug: pe.slug } : null
}
