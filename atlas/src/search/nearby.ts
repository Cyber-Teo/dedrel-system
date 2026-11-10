// «В радиусе 100 км» для досье места: ближайшие места, крепости/опасные зоны и штабы гильдий. Чистая логика над данными.
import { loadData } from '../data/load'
import { distKm } from '../lib/geo'
import { MODES } from '../route/travel'
import { norm } from './rank'
import { DUP_OF, orgBy, placeBy, placeTitle, placesAll, polities, type Place } from './data'

export const RADIUS_KM = 100
const PLACE_KINDS = new Set(['city', 'capital', 'fortress', 'village', 'port', 'ruin', 'temple', 'mine', 'school'])
export type Near = { id: string; name: string; kind?: string; km: number; days: number }
export type NearHazard = { name: string; threat: string; km: number; place: string }
export type NearGuild = { name: string; org: string; km: number; place: string }
export type Nearby = { places: Near[]; fortresses: Near[]; hazards: NearHazard[]; guilds: NearGuild[] }

const hazards = (await loadData<{ id: string; name: string; threat?: string; place?: string }[]>('hazards')) ?? []
const guildHq = (await loadData<{ ref: string; place: string }[]>('guild-hq')) ?? []
const polityNames = new Set(
  Object.values(polities).flatMap((p) => [norm(p.name), norm(p.name.replace(/\s*\(.*?\)/g, ''))]),
)

/** Сутки верхом по прямой: км / скорость верхом из route/travel (по тракту — оценка снизу, не маршрут). */
export const horseDays = (km: number) => km / MODES.horse.kmDay
const dist = (a: Place, b: Place) => distKm({ x: a.x!, y: a.y! }, { x: b.x!, y: b.y! })
const has = (p?: Place): p is Place & { x: number; y: number } =>
  !!p && typeof p.x === 'number' && typeof p.y === 'number'

export function nearby(p: Place, radius = RADIUS_KM): Nearby | null {
  if (!has(p)) return null
  const seen = new Set([norm(placeTitle(p))]),
    at = new Set<string>()
  const places: Near[] = []
  for (const q of placesAll) {
    if (q.id === p.id || DUP_OF[q.id] || !has(q) || !PLACE_KINDS.has(q.kind ?? '') || q.name.includes('(маркер карты)'))
      continue
    const key = norm(placeTitle(q))
    if (seen.has(key) || polityNames.has(key)) continue
    const km = dist(p, q)
    if (km > radius) continue
    const xy = `${q.x},${q.y}`
    if (at.has(xy)) continue
    at.add(xy)
    seen.add(key)
    places.push({ id: q.id, name: placeTitle(q), kind: q.kind, km, days: horseDays(km) })
  }
  places.sort((a, b) => a.km - b.km)
  const hz: NearHazard[] = []
  for (const h of hazards) {
    const q = placeBy.get(h.place ?? '')
    if (!has(q)) continue
    const km = dist(p, q)
    if (km <= radius) hz.push({ name: h.name, threat: h.threat ?? '', km, place: q.id })
  }
  const gl: NearGuild[] = []
  for (const g of guildHq) {
    const q = placeBy.get(g.place),
      o = orgBy.get(g.ref)
    if (!has(q) || !o) continue
    const km = dist(p, q)
    if (km <= radius) gl.push({ name: o.name, org: o.id, km, place: q.id })
  }
  return {
    places: places.filter((x) => x.kind !== 'fortress'),
    fortresses: places.filter((x) => x.kind === 'fortress'),
    hazards: hz.sort((a, b) => a.km - b.km),
    guilds: gl.sort((a, b) => a.km - b.km),
  }
}

/** «≈0,6 сут» / «≈2 сут»: сутки верхом с точностью до десятых. */
export const daysText = (d: number) =>
  `≈${d < 0.1 ? '<0,1' : d < 10 ? d.toFixed(1).replace('.', ',').replace(/,0$/, '') : Math.round(d)} сут`
export const kmText = (km: number) => `${Math.max(1, Math.round(km))} км`

/** Хеш для «Маршрут сюда»: route=<откуда>,<куда>,<способ>; «откуда» пусто — выбирает пользователь (тот же формат читает RouteTool: readRouteHash). */
export function routeHash(h: string, toId: string): string {
  const p = new URLSearchParams(h.replace(/^#/, ''))
  p.set('route', `,${toId},horse`)
  return '#' + p.toString().replace(/%2C/g, ',').replace(/%3A/g, ':')
}
