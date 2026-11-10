// Сборка объектов тематических слоёв из data/*.yaml. Чистая функция: работает и в браузере (строки из ?raw), и в Node (validate, отчёт).

import { warn } from '../lib/log'

export type Conf = 'canon' | 'derived' | 'speculative'
export type LayerDef = {
  id: string
  group: string
  name: string
  control: string
  priority: string
  status: 'ready' | 'planned'
  data: string | null
  icon?: string
  color?: string
  source_note?: string
  volume?: string
}
export type Obj = {
  key: string
  layer: string
  id: string
  name: string
  cat: string
  x?: number
  y?: number
  approx: boolean
  why?: string // x,y — пиксели карты; approx — положение по предку/значку
  from?: number | null
  to?: number | null
  soft?: boolean // soft — окно ±N лет вокруг [from,to]; иначе порог
  text?: string
  meta: [string, string][]
  sources: string[]
  via?: string[]
  confidence: Conf
  radius_km?: number
}
/** Ключи входных данных, из которых собирается реестр слоёв (по ним выводятся Parsed и Raw в buildRaw.ts). */
export const LAYER_KEYS = [
  'layers',
  'places',
  'orgs',
  'people',
  'military',
  'fortressDates',
  'religion',
  'hazards',
  'magic',
  'resources',
  'guildHq',
  'peopleLoc',
  'anchors',
] as const
export type LayerKey = (typeof LAYER_KEYS)[number]

/** Данные из YAML: форму проверяют схемы data/schema.ts (команда validate), здесь поля читаются по месту. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>
/** Разобранные входные данные (YAML → объекты; в браузере это предсобранный JSON). Строки разбирает buildRaw.ts для Node. */
export type Parsed = Record<LayerKey, Row> & { states?: Row; miniatures?: Row }
export type Mini = {
  id: string
  name: string
  icon: string
  x: number
  y: number
  dx?: number
  dy?: number
  from: number | null
  to: number | null
  text: string
  sources: string[]
  via?: string[]
  confidence: Conf
  approx: boolean
  why?: string
}
export type Built = {
  minis: Mini[]
  groups: { id: string; name: string }[]
  layers: LayerDef[]
  objs: Map<string, Obj[]>
  missing: Map<string, { id: string; name: string; why: string }[]>
}

type Pl = {
  id: string
  name: string
  kind: string
  x?: number
  y?: number
  parent?: string
  hint?: string
  facts?: string
  sources: string[]
  confidence: Conf
}
const L = <T = Row>(v: Row | undefined) => (v ?? []) as T[]

const countryName = (places: Map<string, Pl>, sources: string[], states?: Map<string, string>) => {
  const c = sources.map((s) => /^countries\/([^/]+)/.exec(s)?.[1]).find(Boolean)
  return (
    (c && (places.get(`countries/${c}/index`)?.name ?? states?.get(`countries/${c}/index`))) ||
    (c ? c : 'вне государств')
  )
}

/** Население места из текста вики («~1 млн жителей», «≈300 тыс.», «~8000 жителей»); undefined — в источнике не названо. */
export function parsePop(text?: string): number | undefined {
  const m = /[~≈>]?\s*(\d+(?:[.,]\d+)?)\s*(млн|тыс)?\.?\s*(?:жител|чел|\||$|[,;)])/.exec(text ?? '')
  if (!m || (!/[~≈>]/.test(m[0]) && !m[2])) return undefined
  const v = parseFloat(m[1].replace(',', '.')) * (m[2] === 'млн' ? 1e6 : m[2] === 'тыс' ? 1e3 : 1)
  return v >= 500 ? v : undefined
}
/** Население мест по ключу объекта (places-ranked:<id>); заполняет build(). */
export const POP = new globalThis.Map<string, number>()

const N = (s: string) => s.replace(/[−–—]/g, '-')
/** Годы жизни/правления из строки people.years → окно видимости (to исключающее). null — разобрать нельзя: объект виден только в 1005–1006. */
export function parseYears(years?: string | null): { from: number | null; to: number | null; soft?: boolean } | null {
  if (!years) return null
  const t = N(years)
  if (/^\s*(\?|None|неизвестно|древность|средних лет|старше)/i.test(t)) return null
  let m = /(\d+)-е гг/.exec(t)
  if (m) return { from: +m[1], to: +m[1] + 10, soft: true }
  const death = /ум\.\s*(-?\d+)/.exec(t)
  const dead = death ? +death[1] : null
  m = /(?:^|\D)(-?\d+)(?:\/\d+)?\s*-\s*(-?\d+)?/.exec(t.replace(/^\s*(?:р\.|род\.)\s*≈?/, ''))
  if (m)
    return {
      from: +m[1],
      to: /и далее/.test(t) ? null : dead !== null ? dead + 1 : m[2] !== undefined ? +m[2] + 1 : null,
    }
  m = /род\.\s*≈?\s*(-?\d+)/.exec(t)
  if (m) return { from: +m[1], to: dead !== null ? dead + 1 : null }
  // «до N / ум. N / пал в N»: рождение неизвестно — окно (N−60; N], иначе умерший виден во все века до смерти
  if (/^(пал[аи]?|до\s|ум\.)/.test(t.trim())) {
    m = /(-?\d+)/.exec(t)
    if (m) return { from: +m[1] - 60, to: +m[1] + 1 }
  }
  m = /(\d+)\s*(?:лет|года|год)\s*в\s*(\d+)/.exec(t)
  if (m) return { from: +m[2] - +m[1], to: null }
  m = /(?:^|\s)с\s*≈?\s*(-?\d+)/.exec(t) ?? /(-?\d+)\s*-\s*$/.exec(t)
  if (m) return { from: +m[1], to: null }
  m = /(-?\d+)/.exec(t)
  if (m) return { from: +m[1], to: +m[1] + 1, soft: true }
  return null
}

/** Составная угроза → отдельные типы. */
export const splitThreat = (t: string): string[] =>
  t
    .split(/,\s*|\s+и\s+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => (x === 'банды' ? 'бандиты' : x))

export const roleCat = (r = '') => {
  const t = r.toLowerCase()
  if (/бог|божеств|демон|дракон/.test(t)) return 'божества и демоны'
  if (/император|королев|король|раджа|правител|махараджа|князь|претенд|наследни/.test(t)) return 'правители'
  if (/префект|мэр|судья|квестор|политик/.test(t)) return 'власть и суд'
  if (/легат|воин|полководец|гладиатор|капитан|командир|страж/.test(t)) return 'военные'
  if (/ректор|маг|архимаг|профессор|декан|жрец|жриц|патриарх|священ/.test(t)) return 'маги и духовенство'
  if (/гильд|дуумвир|основатель|владел|хозяйк|таверн|торгов/.test(t)) return 'гильдии и торговля'
  if (/дом|сенатор|аристократ|знать|родоначальн|депутат|барон|землевлад/.test(t)) return 'знать и сенат'
  return 'прочие'
}
export const guildCat = (k = '') => {
  const t = k.toLowerCase()
  if (/наёмн|наемн/.test(t)) return 'наёмнические'
  if (/торгов/.test(t)) return 'торговые'
  if (/ремесл|кораблестро/.test(t)) return 'ремесленные'
  if (/маг/.test(t)) return 'магические'
  return 'прочие гильдии'
}

export function build(raw: Parsed): Built {
  const reg = raw.layers as { groups: Built['groups']; layers: LayerDef[] }
  const places = new Map<string, Pl>(L<Pl>(raw.places).map((p) => [p.id, p]))
  const anchors = new Map<string, { anchor: string; via: string }>(
    L<{ place: string; anchor: string; via: string }>(raw.anchors).map((a) => [a.place, a]),
  )
  const orgs = new Map<string, Row>(L(raw.orgs).map((o) => [o.id, o]))
  const people = new Map<string, Row>(L(raw.people).map((o) => [o.id, o]))
  const states = new Map<string, string>(
    raw.states
      ? (raw.states.features as Row[]).map(
          (f) =>
            [
              f.properties.id,
              String(f.properties.name)
                .replace(/\s*\(.*?\)/g, '')
                .trim(),
            ] as [string, string],
        )
      : [],
  )
  const objs = new Map<string, Obj[]>(),
    missing = new Map<string, { id: string; name: string; why: string }[]>()
  for (const l of reg.layers) {
    objs.set(l.id, [])
    missing.set(l.id, [])
  }

  // положение: точное (у места есть x,y), по значку-двойнику (xy_place) или по предку (anchors.yaml)
  const pos = (placeId?: string | null, xyPlace?: string): Pick<Obj, 'x' | 'y' | 'approx' | 'why'> | null => {
    const p = placeId ? places.get(placeId) : undefined
    if (p?.x !== undefined) return { x: p.x, y: p.y, approx: false }
    if (xyPlace) {
      const q = places.get(xyPlace)
      if (q?.x !== undefined) return { x: q.x, y: q.y, approx: true, why: `по значку карты «${q.name}»` }
    }
    const a = placeId ? anchors.get(placeId) : undefined
    const q = a && places.get(a.anchor)
    if (q && q.x !== undefined)
      return {
        x: q.x,
        y: q.y,
        approx: true,
        why: `положение приблизительное: по месту «${q.name}»${p ? ` (${p.name} в его составе)` : ''}`,
      }
    return null
  }
  const put = (
    layer: string,
    o: Omit<Obj, 'layer' | 'key' | 'x' | 'y' | 'approx' | 'why'>,
    where: ReturnType<typeof pos>,
    whyMissing: string,
  ) => {
    if (!where) {
      missing.get(layer)!.push({ id: o.id, name: o.name, why: whyMissing })
      return
    }
    objs.get(layer)!.push({ ...o, ...where, layer, key: `${layer}:${o.id}` })
  }
  const pname = (id?: string | null) => (id && places.get(id)?.name) || undefined
  const noPos = (id?: string | null) =>
    id
      ? places.has(id)
        ? `у места «${pname(id)}» нет координат и привязки`
        : `место «${id}» не найдено`
      : 'место в источнике не указано'

  // --- крепости
  const dates = new Map<string, Row>(L(raw.fortressDates).map((d) => [d.place, d]))
  const fort = new Set<string>()
  for (const p of places.values()) if (p.kind === 'fortress') fort.add(p.id)
  for (const d of dates.values()) if (d.extra) fort.add(d.place)
  for (const id of fort) {
    const p = places.get(id)!,
      d = dates.get(id)
    const hint = [p.hint, p.facts?.split(' | ')[0]].filter(Boolean).join('. ')
    const base = {
      id,
      name: p.name,
      cat: countryName(places, p.sources, states),
      text: hint.slice(0, 420) || undefined,
      from: d?.built ?? null,
      to: d?.ruined ?? null,
      meta: [
        ...(d
          ? [['Год постройки', d.built_text] as [string, string]]
          : [['Год постройки', 'в источнике не указан'] as [string, string]]),
        ...(d?.ruined ? [['Руины с', String(d.ruined)] as [string, string]] : []),
      ],
      sources: [...new Set([...(d?.sources ?? []), ...p.sources])],
      confidence: (d?.confidence === 'derived' ? 'derived' : p.confidence) as Conf,
    }
    put('fortresses', base, pos(id), noPos(id))
    // с года разрушения — отдельный значок руин («руины с 625»)
    if (d?.ruined)
      put(
        'fortresses',
        { ...base, id: `${id}#ruins`, name: `${p.name} (руины)`, cat: 'руины', from: d.ruined, to: null },
        pos(id),
        noPos(id),
      )
  }
  // --- легионы
  for (const m of L(raw.military)) {
    put(
      'legions',
      {
        id: m.id,
        name: `${m.number} легион`,
        cat: `${m.number} легион`,
        text: m.text,
        from: m.from,
        to: m.to,
        soft: true,
        meta: [
          ['Годы', m.from === m.to ? `${m.from}` : `${m.from}–${m.to}`],
          ['Место', pname(m.place) ?? '—'],
        ],
        sources: m.sources,
        confidence: m.confidence,
      },
      pos(m.place),
      noPos(m.place),
    )
  }
  // --- гильдии: штабы
  for (const g of L(raw.guildHq)) {
    const o = orgs.get(g.ref)
    if (!o) continue
    put(
      'guild-hq',
      {
        id: g.ref,
        name: o.name,
        cat: guildCat(o.kind),
        text: [o.influence, o.presence && `Присутствие: ${o.presence}`].filter(Boolean).join('. ') || undefined,
        meta: [
          ['Штаб', o.hq],
          ...(o.leader && o.leader !== '?' ? [['Глава', o.leader] as [string, string]] : []),
          ['Место на карте', `${pname(g.place)}${g.match === 'contains' ? ' (найдено по тексту)' : ''}`],
        ],
        sources: o.sources,
        confidence: g.match === 'contains' && o.confidence === 'canon' ? 'derived' : o.confidence,
      },
      pos(g.place),
      noPos(g.place),
    )
  }
  const unparsed = new Set<string>()
  // --- люди по месту; видимость — по годам жизни/правления (people.years), без годов — только 1005–1006
  for (const g of L(raw.peopleLoc)) {
    const h = people.get(g.ref)
    if (!h) continue
    const y = parseYears(h.years)
    if (h.years && !y) unparsed.add(String(h.years))
    const from = y ? y.from : 1005,
      to = y ? y.to : 1007
    const hist = to !== null && to <= 1006 && !y?.soft
    put(
      'people',
      {
        id: g.ref,
        name: h.name,
        cat: roleCat(h.role),
        text: h.notable,
        from,
        to,
        soft: y?.soft,
        meta: [
          ...(h.role ? [['Роль', h.role] as [string, string]] : []),
          ...(h.affiliation ? [['Связь', h.affiliation] as [string, string]] : []),
          ...(h.years ? [['Годы', h.years] as [string, string]] : []),
          [hist ? 'Место' : 'Живёт', `${h.based_in}${g.match === 'contains' ? ' (место найдено по тексту)' : ''}`],
        ],
        sources: h.sources,
        confidence: g.match === 'contains' && h.confidence === 'canon' ? 'derived' : h.confidence,
      },
      pos(g.place),
      noPos(g.place),
    )
  }
  // --- школы
  for (const p of places.values())
    if (p.kind === 'school')
      put(
        'schools',
        {
          id: p.id,
          name: p.name,
          cat: 'школы и академии',
          text: [p.hint, p.facts?.split(' | ')[0]].filter(Boolean).join('. ').slice(0, 420) || undefined,
          meta: [],
          sources: p.sources,
          confidence: p.confidence,
        },
        pos(p.id),
        noPos(p.id),
      )
  // --- святыни
  for (const r of L(raw.religion))
    put(
      'shrines',
      {
        id: r.id,
        name: r.name,
        cat: r.faith,
        text: r.text,
        from: r.from ?? null,
        to: null,
        meta: [['Вера', r.faith]],
        sources: r.sources,
        confidence: r.confidence,
      },
      pos(r.place, r.xy_place),
      noPos(r.place),
    )
  // --- опасные зоны: составная угроза разбита на отдельные типы (по значку на тип)
  for (const r of L(raw.hazards)) {
    const ts = splitThreat(r.threat)
    ts.forEach((t, i) =>
      put(
        'hazards',
        {
          id: ts.length > 1 ? `${r.id}#${i}` : r.id,
          name: r.name,
          cat: t === 'нежить' && /болот/i.test(r.name) ? 'нежить (болота)' : t,
          text: r.text,
          from: r.from ?? null,
          to: null,
          radius_km: r.radius_km,
          meta: [
            ['Угроза', r.threat],
            ...(r.from ? [['С года', String(r.from)] as [string, string]] : []),
            ['Радиус', r.radius_km ? `${r.radius_km} км` : 'в источнике не указан'],
          ],
          sources: r.sources,
          confidence: r.confidence,
        },
        pos(r.place, r.xy_place),
        noPos(r.place),
      ),
    )
  }
  // --- нежить и аномалии
  for (const r of L(raw.magic)) {
    const layer = r.type === 'undead' ? 'undead' : 'anomalies'
    put(
      layer,
      {
        id: r.id,
        name: r.name,
        cat: layer === 'undead' ? 'нежить и некромантия' : 'аномалии',
        text: r.text,
        from: r.from ?? null,
        to: null,
        radius_km: r.radius_km,
        meta: [
          ...(r.from ? [['С года', String(r.from)] as [string, string]] : []),
          ...(r.radius_km ? [['Радиус', `${r.radius_km} км`] as [string, string]] : []),
        ],
        sources: r.sources,
        confidence: r.confidence,
      },
      pos(r.place, r.xy_place),
      noPos(r.place),
    )
  }
  // --- ресурсы
  for (const r of L(raw.resources))
    put(
      'resources',
      {
        id: r.id,
        name: r.resource,
        cat: r.kind,
        text: r.note,
        meta: [
          ['Где', r.where_text],
          ['Место на карте', pname(r.place) ?? r.place],
        ],
        sources: r.sources,
        confidence: r.confidence,
      },
      pos(r.place),
      noPos(r.place),
    )
  // --- места по рангу: столицы, города, порты, храмы, шахты, руины (значок — по kind)
  const KIND_CAT: Record<string, string> = {
    capital: 'столицы',
    city: 'города',
    village: 'деревни',
    port: 'порты',
    temple: 'храмы',
    mine: 'шахты',
    ruin: 'руины',
  }
  if (objs.has('places-ranked'))
    for (const p of places.values())
      if (KIND_CAT[p.kind]) {
        const pop = parsePop(p.facts)
        if (pop) POP.set(`places-ranked:${p.id}`, pop)
      }
  if (objs.has('places-ranked'))
    for (const p of places.values())
      if (KIND_CAT[p.kind])
        put(
          'places-ranked',
          {
            id: p.id,
            name: p.name,
            cat: KIND_CAT[p.kind],
            text: [p.hint, p.facts?.split(' | ')[0]].filter(Boolean).join('. ').slice(0, 420) || undefined,
            meta: [['Вид', p.kind]],
            sources: p.sources,
            confidence: p.confidence,
          },
          pos(p.id),
          noPos(p.id),
        )
  // --- миниатюры мира: положение берётся у места (или у его предка по anchors.yaml)
  const minis: Mini[] = []
  for (const m of raw.miniatures ? L(raw.miniatures) : []) {
    const w = m.xy ? { x: m.xy[0], y: m.xy[1], approx: true } : pos(m.place)
    if (!w) {
      missing.get('world-miniatures')?.push({ id: m.id, name: m.name, why: noPos(m.place) })
      continue
    }
    minis.push({
      id: m.id,
      name: m.name,
      icon: m.icon,
      x: w.x!,
      y: w.y!,
      dx: m.dx,
      dy: m.dy,
      from: m.from ?? null,
      to: m.to ?? null,
      text: m.text,
      sources: m.sources,
      via: (places.get(m.place)?.sources ?? []).filter((x: string) => !x.startsWith('map:')),
      confidence: m.confidence,
      approx: w.approx,
      ...(m.why ? { why: String(m.why) } : {}),
    })
  }
  if (unparsed.size && import.meta.env?.DEV)
    warn('people.years', `не разобрано ${unparsed.size}: ${[...unparsed].join(' | ')}`)
  return { minis, groups: reg.groups, layers: reg.layers, objs, missing }
}

/** Виден ли объект в год year (win — окно ползунка ±лет, применяется к «мягким» годам). */
export function visibleAt(o: Obj, year: number, win: number): boolean {
  const from = o.from ?? null,
    to = o.to ?? null
  if (o.soft) return year >= (from ?? -1e9) - win && year <= (to ?? 1e9) + win
  return (from === null || year >= from) && (to === null || year < to)
}
