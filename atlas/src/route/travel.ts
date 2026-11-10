// Чистые правила передвижения: скорости (вики, services_prices) и коэффициенты местности
// (docs/plan/layers.md, «Правила правдоподобия»). Без зависимостей от карты и данных.
import { type Px } from '../geo/pixel'
import { distKm, KM_PER_PX } from '../lib/geo'
import { CART_OFFROAD, MODES, SHIP_KM_DAY, UPSTREAM, type Cat, type Mode } from './constants'
export * from './constants'

export const CAT_NAME: Record<Cat, string> = {
  paved: 'тракт',
  gravel: 'грунтовка',
  direction: 'дорога',
  off: 'бездорожье',
  sea: 'море',
  river: 'река',
  air: 'по воздуху',
}
/** Строка итога по типам: тракт и «дорога» (направление) вместе в «дороги» не сливаем — слияние делает вызывающий */
export const LAND_SPEED = (m: Mode) => (m === 'ship' ? MODES.foot.kmDay : MODES[m].kmDay)

export type EdgeLike = { cat: Cat; km: number; f: number; up?: boolean }

/** Время прохода одного ребра в сутках для способа mode; Infinity — не проходит */
export function edgeDays(e: EdgeLike, mode: Mode): number {
  switch (e.cat) {
    case 'paved':
    case 'gravel':
    case 'direction':
    case 'off': {
      if (mode === 'griffon' || mode === 'ship') return Infinity
      const f = e.cat === 'off' && mode === 'cart' ? e.f * CART_OFFROAD : e.f
      return e.km / (LAND_SPEED(mode) * f)
    }
    case 'sea':
      return mode === 'griffon' ? Infinity : e.km / SHIP_KM_DAY
    case 'river':
      return mode === 'ship' ? e.km / (SHIP_KM_DAY * (e.up ? UPSTREAM : 1)) : Infinity
    case 'air':
      return e.km / MODES.griffon.kmDay
  }
}
/** Скорость на ребре, на которой считалось время (для часов) */
export const legHpd = (cat: Cat, mode: Mode) =>
  cat === 'sea' || cat === 'river' ? MODES.ship.hpd : MODES[mode === 'ship' ? 'foot' : mode].hpd

const ru = (n: number, d = 1) => n.toFixed(d).replace('.', ',')
export const fmtKm = (km: number) => `${ru(km)} км`
/** Часов в пути в день: на суше — по способу, на воде — круглосуточно. hpds — уникальные значения по участкам плана (суша первой) */
export function fmtTravel(days: number, hpds: number[]): string {
  const d = ru(Math.round(days * 10) / 10)
  const h = [...new Set(hpds.map(Math.round))].sort((a, b) => a - b)
  if (h.length <= 1) return `≈${d} сут (${h[0] ?? MODES.horse.hpd} ч в пути в день)`
  return `≈${d} сут (на суше ${h[0]} ч, на воде ${h[h.length - 1]} ч в пути в день)`
}

/** Винительный падеж названия местности для «Через …»: «Ничья пустыня» → «Ничью пустыню», «Лес Ужасов» без изменений */
export function accusative(name: string): string {
  const w = name.split(' ')
  for (let i = 0; i < w.length; i++) {
    const x = w[i],
      low = x.toLowerCase()
    if (/(ая|яя|ья)$/.test(low) && i < w.length - 1) {
      w[i] = x.slice(0, -2) + (low.endsWith('ая') ? 'ую' : low.endsWith('яя') ? 'юю' : 'ью')
      continue
    }
    if (/(ова|ева|ина)$/.test(low) && i < w.length - 1) {
      w[i] = x.slice(0, -1) + 'у'
      continue
    }
    if (/[ая]$/.test(low) && x.length > 2) w[i] = x.slice(0, -1) + (low.endsWith('а') ? 'у' : 'ю')
    break
  }
  return w.join(' ')
}

/** Подпись места без служебных пометок: «Виларин (город)» → «Виларин» */
export const placeLabel = (name: string) => name.replace(/\s*\((город|маркер карты|местность)\)\s*$/, '').trim()
/** Виды мест, из которых выбирают начало и конец маршрута */
export const ROUTE_KINDS = new Set(['capital', 'city', 'port', 'fortress', 'village'])

// ---------- дневные перегоны, ночлеги, места вдоль пути (чистые функции) ----------

/** Где можно заночевать: города, порты, крепости, деревни, храмы и школы с координатами */
export const LODGING_KINDS = new Set(['capital', 'city', 'port', 'fortress', 'village', 'temple', 'school', 'mine'])
export const LODGING_KM = 15
/** вплотную к пути (на самой дороге) и «рядом с путём» (виден на карте, но в стороне) */
export const CORRIDOR_KM = 10
export const NEAR_KM = 40
export const HAZARD_KM = 30
export type PlaceLike = { id: string; name: string; x: number; y: number; kind?: string }
export type PathLeg = { cat: Cat; days: number; geom: Px[] }
export type DayStop = {
  day: number
  /** км от начала пути в конце дня */ km: number
  /** пикселы карты */ x: number
  y: number
  /** место ночлега и расстояние до него; null — в пути */ avoided?: PlaceLike
  place: PlaceLike | null
  placeKm: number
  /** ближайшее место, если ночлег вне ≤15 км */ near: PlaceLike | null
  nearKm: number
  where: 'place' | 'road' | 'sea' | 'air'
  last: boolean
}
const dpx = (ax: number, ay: number, bx: number, by: number) => distKm({ x: ax, y: ay }, { x: bx, y: by })
/** Дубли мест: близко (<10 км) и похожие имена («Камераска»/«Камераски», «Иллиор»/«Иллиор (город)») */
export const DUP_KM = 10
const sameName = (a: string, b: string) => {
  const x = placeLabel(a).toLowerCase(),
    y = placeLabel(b).toLowerCase()
  if (x === y) return true
  let i = 0
  while (i < x.length && i < y.length && x[i] === y[i]) i++
  return i >= 4 && i >= Math.min(x.length, y.length) - 2
}
const lodgings = (places: Iterable<PlaceLike>) => {
  const out: PlaceLike[] = []
  for (const p of places) {
    if (!LODGING_KINDS.has(p.kind ?? '') || /маркер карты/.test(p.name) || /_marker_karty$/.test(p.id)) continue
    const i = out.findIndex((q) => sameName(q.name, p.name) && dpx(q.x, q.y, p.x, p.y) < DUP_KM)
    if (i < 0) out.push(p)
    else if (p.name === placeLabel(p.name) && out[i].name !== placeLabel(out[i].name)) out[i] = p
  }
  return out
}
/** Зона нежити: место-эпицентр опасности «нежить» или в HAZ_PLACE_KM от неё. Ночлег там невозможен. */
export const HAZ_PLACE_KM = 8
export type HazardZone = { name: string; threat: string; x: number; y: number; placeId?: string }
export const undeadZone =
  (hz: HazardZone[]) =>
  (p: PlaceLike): HazardZone | null =>
    hz.find((h) => /нежит/.test(h.threat) && (h.placeId === p.id || dpx(h.x, h.y, p.x, p.y) <= HAZ_PLACE_KM)) ?? null
/** Ближайшее из places к точке; km — расстояние */
function nearestPlace(ps: PlaceLike[], x: number, y: number): { p: PlaceLike; km: number } | null {
  let best: { p: PlaceLike; km: number } | null = null
  for (const p of ps) {
    const km = dpx(p.x, p.y, x, y)
    if (!best || km < best.km) best = { p, km }
  }
  return best
}

/** Разбить путь на дни: конец d-го дня — точка, где накоплено d суток хода (внутри ребра — пропорционально длине). Последний день кончается в пункте назначения. */
export function splitDays(
  legs: PathLeg[],
  places: Iterable<PlaceLike>,
  skip: string[] = [],
  hz: HazardZone[] = [],
): DayStop[] {
  const total = legs.reduce((s, l) => s + l.days, 0)
  if (!legs.length || !(total > 0) || !isFinite(total)) return []
  const nDays = Math.max(1, Math.ceil(total - 1e-6))
  const zone = undeadZone(hz)
  const all = lodgings(places),
    mid = all.filter((p) => !skip.includes(p.id))
  const safeMid = mid.filter((p) => !zone(p))
  let prevId = ''
  const out: DayStop[] = []
  // подписи расстояний — от самого пути (та же величина, что offKm в «По пути»), а не от точки конца дня
  const pathKm = (p: PlaceLike) => {
    let best = Infinity
    for (const l of legs)
      for (let i = 1; i < l.geom.length; i++) best = Math.min(best, segDist(p.x, p.y, l.geom[i - 1], l.geom[i]).d)
    return isFinite(best) ? best : dpx(p.x, p.y, legs[0].geom[0][0], legs[0].geom[0][1])
  }
  let li = 0,
    acc = 0,
    kmAcc = 0
  const lenOf = (g: Px[]) => g.reduce((s, p, i) => (i ? s + dpx(p[0], p[1], g[i - 1][0], g[i - 1][1]) : 0), 0)
  const at = (g: Px[], frac: number): Px => {
    const L = lenOf(g)
    if (L === 0) return g[0]
    let want = L * frac
    for (let i = 1; i < g.length; i++) {
      const s = dpx(g[i][0], g[i][1], g[i - 1][0], g[i - 1][1])
      if (want <= s || i === g.length - 1) {
        const t = s ? Math.min(1, want / s) : 0
        return [g[i - 1][0] + (g[i][0] - g[i - 1][0]) * t, g[i - 1][1] + (g[i][1] - g[i - 1][1]) * t]
      }
      want -= s
    }
    return g[g.length - 1]
  }
  for (let d = 1; d <= nDays; d++) {
    const last = d === nDays
    const target = last ? total : d
    while (li < legs.length - 1 && acc + legs[li].days < target - 1e-9) {
      acc += legs[li].days
      kmAcc += lenOf(legs[li].geom)
      li++
    }
    const l = legs[li],
      frac = l.days > 0 ? Math.min(1, Math.max(0, (target - acc) / l.days)) : 1
    const [x, y] = at(l.geom, frac)
    const km = kmAcc + lenOf(l.geom) * frac
    const first = nearestPlace(last ? all : mid, x, y)
    // зона нежити: ночлег переносится на ближайшее безопасное место, а если его нет рядом — лагерь у дороги
    let avoided: PlaceLike | undefined
    let near = first
    if (!last && first && first.km <= LODGING_KM && zone(first.p)) {
      avoided = first.p
      near = nearestPlace(safeMid, x, y)
    } else if (!last && first && zone(first.p)) near = nearestPlace(safeMid, x, y)
    let hit = near && (last || near.km <= LODGING_KM) ? near : null
    // одну ночёвку не повторять: то же место, что вчера, — лагерь у дороги
    if (hit && !last && hit.p.id === prevId) {
      hit = null
    }
    prevId = hit?.p.id ?? ''
    out.push({
      day: d,
      km,
      x,
      y,
      avoided,
      place: hit?.p ?? null,
      placeKm: hit ? pathKm(hit.p) : 0,
      near: hit ? null : (near?.p ?? null),
      nearKm: hit ? 0 : near ? pathKm(near.p) : 0,
      where: hit ? 'place' : l.cat === 'sea' || l.cat === 'river' ? 'sea' : l.cat === 'air' ? 'air' : 'road',
      last,
    })
  }
  return out
}

/** Подпись ночлега: «Селимбрия», «у Селимбрии, 4 км» нельзя без склонения — поэтому «Селимбрия (в 4 км)» */
export function stopLabel(s: DayStop): string {
  if (s.place)
    return s.last
      ? placeLabel(s.place.name)
      : s.placeKm < 1
        ? placeLabel(s.place.name)
        : s.placeKm <= CORRIDOR_KM
          ? `${placeLabel(s.place.name)}, на пути (≤${CORRIDOR_KM} км)`
          : `${placeLabel(s.place.name)}, в ${Math.round(s.placeKm)} км от пути`
  const warn = s.avoided ? ` ⚠ ${placeLabel(s.avoided.name)}: руины, нежить — ночлег невозможен.` : ''
  const near =
    warn + (s.near ? ` (ближайшее место: ${placeLabel(s.near.name)}, в ${Math.round(s.nearKm)} км от пути)` : '')
  if (s.where === 'sea') return 'в море, на борту' + near
  if (s.where === 'air') return 'ночёвка в пути, грифон на привале' + near
  return 'в пути, лагерь у дороги' + near
}
/** Метка на карте: «день 1 · ночлег у Селимбрии» */
export function stopPin(s: DayStop): string {
  if (!s.place || s.placeKm >= LODGING_KM) return `день ${s.day} · ночлег в пути`
  return `день ${s.day} · ночлег у ${placeLabel(s.place.name)}`
}

export type OnPath = {
  unsafe?: boolean
  place: PlaceLike
  offKm: number
  alongKm: number
  fortress: boolean
  /** ≤10 км от дороги */ onRoad: boolean
}
/** Расстояние от точки до отрезка (км) и положение проекции вдоль отрезка (км от его начала) */
function segDist(px: number, py: number, a: Px, b: Px): { d: number; t: number } {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    L2 = dx * dx + dy * dy
  const t = L2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L2)) : 0
  return { d: dpx(px, py, a[0] + dx * t, a[1] + dy * t), t: t * Math.sqrt(L2) * KM_PER_PX }
}
/** Места в коридоре ±CORRIDOR_KM от ломаной пути, по порядку вдоль пути; начало и конец (ids) не включаются */
export function placesAlong(
  path: Px[],
  places: Iterable<PlaceLike>,
  skip: string[] = [],
  corridor = NEAR_KM,
  hz: HazardZone[] = [],
): OnPath[] {
  const zone = undeadZone(hz)
  const cum: number[] = [0]
  for (let i = 1; i < path.length; i++)
    cum.push(cum[i - 1] + dpx(path[i][0], path[i][1], path[i - 1][0], path[i - 1][1]))
  const out: OnPath[] = []
  for (const p of lodgings(places)) {
    if (skip.includes(p.id)) continue
    let best = Infinity,
      along = 0
    for (let i = 1; i < path.length; i++) {
      const s = segDist(p.x, p.y, path[i - 1], path[i])
      if (s.d < best) {
        best = s.d
        along = cum[i - 1] + s.t
      }
    }
    if (best <= corridor)
      out.push({
        place: p,
        offKm: best,
        alongKm: along,
        fortress: p.kind === 'fortress',
        onRoad: best <= CORRIDOR_KM,
        unsafe: !!zone(p) || undefined,
      })
  }
  return out.sort((a, b) => a.alongKm - b.alongKm)
}
/** Точечные опасности (hazards.yaml с координатой) в радиусе HAZARD_KM от пути */
export function hazardsAlong(
  path: Px[],
  hz: { name: string; threat: string; x: number; y: number }[],
  radius = HAZARD_KM,
) {
  return hz.filter((h) => path.some((p, i) => segDist(h.x, h.y, path[Math.max(0, i - 1)], p).d <= radius))
}

/** Текст «Копировать описание пути» */
export function describeRoute(o: {
  from: string
  to: string
  mode: Mode
  km: number
  days: number
  hpds: number[]
  stops: DayStop[]
  along: OnPath[]
  warnings: string[]
}): string {
  const L = [
    `Маршрут: ${o.from} → ${o.to}, ${MODES[o.mode].name.toLowerCase()}`,
    `${fmtKm(o.km)}, ${fmtTravel(o.days, o.hpds)}`,
  ]
  for (const s of o.stops)
    L.push(`День ${s.day}: ${s.last ? 'прибытие — ' : 'ночлег — '}${stopLabel(s)} (${ru(s.km, 0)} км от начала)`)
  const pl = o.along.map(
    (a) =>
      `${a.unsafe ? '⚠ ' : ''}${placeLabel(a.place.name)}${a.fortress ? ' (крепость)' : ''}, ${a.onRoad ? 'на пути' : `в ${Math.round(a.offKm)} км от пути`}`,
  )
  if (pl.length) L.push(`По пути: ${pl.join(', ')}`)
  if (o.warnings.length) L.push(`Опасности: ${o.warnings.join('; ')}`)
  return L.join('\n')
}
