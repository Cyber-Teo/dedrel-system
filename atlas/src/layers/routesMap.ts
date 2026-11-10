// Потоки на карте: торговые пути, караваны, работорговля (линии со стрелками направления) и походы армий (по году ползунка, бегущий пунктир, подпись года).
import { Marker, type GeoJSONSource, type Map } from 'maplibre-gl'
import { convertGeometry, setFeatures, type Feat } from '../lib/coords'
import type { ExpressionSpecification } from 'maplibre-gl'
import routesGeoUrl from '../../data/geo/routes.geojson?url'
import { loadGeo } from '../data/load'
import { yearLabel } from '../events'
import { routes, placeCountry } from './registry'
import { polities } from '../history/polities'
import { initModels, setMinis, setModelsVisible, updateModels } from './models'
import { installEventIcons } from './eventsMap'

export const ROUTE_LAYERS: Record<string, string[]> = {
  'trade-routes': ['trade_land', 'trade_river', 'trade_sea', 'caravan'],
  slavery: ['slave'],
  campaigns: ['campaign'],
  'world-miniatures': ['miniatures'],
}
export const KIND_META: Record<string, { name: string; color: string }> = {
  trade_land: { name: 'сухопутные', color: '#e0a23a' },
  trade_river: { name: 'речные', color: '#5fc3d9' },
  trade_sea: { name: 'морские', color: '#8fb4f0' },
  caravan: { name: 'караваны', color: '#f0c860' },
  slave: { name: 'работорговля', color: '#d878a0' },
  campaign: { name: 'походы армий', color: '#e24a36' },
  miniatures: { name: 'миниатюры мира', color: '#7a1f1a' },
}
const DASH = [
  [0, 4, 3],
  [0.5, 4, 2.5],
  [1, 4, 2],
  [1.5, 4, 1.5],
  [2, 4, 1],
  [2.5, 4, 0.5],
  [3, 4, 0],
  [0, 0.5, 3, 3.5],
  [0, 1, 3, 3],
  [0, 1.5, 3, 2.5],
  [0, 2, 3, 2],
  [0, 2.5, 3, 1.5],
  [0, 3, 3, 1],
  [0, 3.5, 3, 0.5],
]

function arrow(color: string) {
  const n = 24,
    cv = document.createElement('canvas')
  cv.width = cv.height = n
  const g = cv.getContext('2d')!
  g.fillStyle = color
  g.strokeStyle = '#f3ead4'
  g.lineWidth = 2
  g.beginPath()
  g.moveTo(5, 5)
  g.lineTo(19, 12)
  g.lineTo(5, 19)
  g.lineTo(9, 12)
  g.closePath()
  g.stroke()
  g.fill()
  return { width: n, height: n, data: new Uint8Array(g.getImageData(0, 0, n, n).data.buffer) }
}
const kindColor = [
  'match',
  ['get', 'kind'],
  ...Object.entries(KIND_META).flatMap(([k, v]) => [k, v.color]),
  '#555',
] as unknown as ExpressionSpecification // «match» переменной длины

const polityColor = new globalThis.Map(polities.map((p) => [p.id, p.color]))
const flagOf = (routeId: string) => {
  const r = routes.find((x) => x.id === routeId),
    c = r && placeCountry(r.from as string)
  return (c && polityColor.get(`countries/${c}/index`)) || '#8c1c13'
}
type RouteProps = { id: string; kind: string; name: string; show: number; year_from: number; year_to: number }
let geo: Feat<RouteProps>[] | null = null,
  ready: Promise<void> | null = null
const labels = new globalThis.Map<string, Marker>()
let timer = 0,
  step = 0

async function init(map: Map) {
  const fc = await loadGeo<{ features: unknown[] }>(routesGeoUrl)
  const meta = new globalThis.Map(routes.map((r) => [r.id, r]))
  type RouteSrc = { properties: RouteProps; geometry: { type: 'LineString'; coordinates: [number, number][] } }
  const src = fc.features as RouteSrc[]
  const pxLines = src.map((f) => ({
    id: f.properties.id,
    kind: f.properties.kind,
    px: f.geometry.coordinates,
  }))
  geo = src.map((f) => ({
    type: 'Feature',
    properties: { ...f.properties, name: meta.get(f.properties.id)?.name ?? '', show: 0 },
    geometry: convertGeometry(f.geometry),
  }))
  for (const [k, v] of Object.entries(KIND_META)) map.addImage(`route-arrow-${k}`, arrow(v.color))
  map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  const before = map.getLayer('events-pts') ? 'events-pts' : undefined
  const vis = { visibility: 'none' as const }
  map.addLayer(
    {
      id: 'routes-halo',
      type: 'line',
      source: 'routes',
      filter: ['==', ['get', 'show'], 1],
      layout: { ...vis, 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#2b1a0e',
        'line-opacity': 0.62,
        'line-width': ['interpolate', ['linear'], ['zoom'], 1, 5.5, 4, 7.5],
      },
    },
    before,
  )
  map.addLayer(
    {
      id: 'routes-solid',
      type: 'line',
      source: 'routes',
      filter: [
        'all',
        ['==', ['get', 'show'], 1],
        ['!=', ['get', 'geom'], 'straight'],
        ['!=', ['get', 'kind'], 'campaign'],
      ],
      layout: { ...vis, 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': kindColor, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 2.4, 4, 3.4] },
    },
    before,
  )
  map.addLayer(
    {
      id: 'routes-straight',
      type: 'line',
      source: 'routes',
      filter: [
        'all',
        ['==', ['get', 'show'], 1],
        ['==', ['get', 'geom'], 'straight'],
        ['!=', ['get', 'kind'], 'campaign'],
      ],
      layout: { ...vis, 'line-cap': 'butt' },
      paint: {
        'line-color': kindColor,
        'line-width': ['interpolate', ['linear'], ['zoom'], 1, 2.2, 4, 3.2],
        'line-dasharray': [2, 2],
      },
    },
    before,
  )
  map.addLayer(
    {
      id: 'routes-camp',
      type: 'line',
      source: 'routes',
      filter: ['all', ['==', ['get', 'show'], 1], ['==', ['get', 'kind'], 'campaign']],
      layout: { ...vis, 'line-join': 'round' },
      paint: { 'line-color': KIND_META.campaign.color, 'line-width': 3.4, 'line-dasharray': DASH[0] },
    },
    before,
  )
  map.addLayer(
    {
      id: 'routes-arrows',
      type: 'symbol',
      source: 'routes',
      filter: ['==', ['get', 'show'], 1],
      layout: {
        ...vis,
        'symbol-placement': 'line',
        'symbol-spacing': 110,
        'icon-image': ['concat', 'route-arrow-', ['get', 'kind']],
        'icon-size': 0.6,
        'icon-allow-overlap': true,
        'icon-rotation-alignment': 'map',
      },
    },
    before,
  )
  initModels(map, pxLines, before)
  // подпись стрелки морского пути (src/graph/seaRoute.ts) на стартовом масштабе ложится на растр: показываем с z≥1.5 (стиль — icons.css)
  const seaLbl = () => document.body.classList.toggle('sea-lbl-on', map.getZoom() >= 1.5)
  map.on('zoom', seaLbl)
  seaLbl()
  installEventIcons(map)
}

const midpoint = (c: [number, number][]) => c[Math.floor(c.length / 2)]
export const routeLayerIds = ['routes-solid', 'routes-straight', 'routes-camp']

/** kinds — включённые виды, hidden — выключенные в легенде («route|вид»). Походы видны, если год ползунка в [с−win; по+win]. */
export async function applyRoutes(map: Map, kinds: string[], hidden: Set<string>, year: number, win: number) {
  ready ??= init(map)
  await ready
  const shown = (p: RouteProps) =>
    kinds.includes(p.kind) &&
    !hidden.has(`route|${p.kind}`) &&
    (p.kind !== 'campaign' || (year >= p.year_from - win && year <= p.year_to + win))
  const feats = geo!.map((f) => ({ ...f, properties: { ...f.properties, show: shown(f.properties) ? 1 : 0 } }))
  setFeatures(map.getSource('routes') as GeoJSONSource, feats)
  const v = kinds.length ? 'visible' : 'none'
  setModelsVisible(map, kinds.length > 0)
  const mini = kinds.includes('miniatures')
  setMinis(map, mini, year)
  updateModels(map, {
    year,
    win,
    flag: flagOf,
    shown: new Set(
      feats
        .filter((f) => f.properties.show && f.properties.kind !== 'campaign' && f.properties.kind !== 'slave')
        .map((f) => f.properties.id as string),
    ),
    campaigns: feats
      .filter((f) => f.properties.show && f.properties.kind === 'campaign')
      .map((f) => ({
        id: f.properties.id as string,
        from: f.properties.year_from as number,
        to: f.properties.year_to as number,
        kind: 'campaign',
      })),
  })
  for (const id of ['routes-halo', 'routes-solid', 'routes-straight', 'routes-camp', 'routes-arrows'])
    map.setLayoutProperty(id, 'visibility', v)
  // подписи годов у видимых походов
  const want = new Set(
    feats.filter((f) => f.properties.show && f.properties.kind === 'campaign').map((f) => f.properties.id as string),
  )
  for (const [id, m] of labels)
    if (!want.has(id)) {
      m.remove()
      labels.delete(id)
    }
  for (const f of feats)
    if (want.has(f.properties.id) && !labels.has(f.properties.id)) {
      const el = document.createElement('div')
      el.className = 'route-year'
      const a = f.properties.year_from,
        b = f.properties.year_to
      el.textContent = a === b ? yearLabel(a) : `${yearLabel(a)}–${b}`
      labels.set(
        f.properties.id,
        new Marker({ element: el }).setLngLat(midpoint(f.geometry.coordinates as [number, number][])).addTo(map),
      )
    }
  // бегущий пунктир
  cancelAnimationFrame(timer)
  if (want.size) {
    let last = 0,
      t0 = 0
    const tick = (t: number) => {
      if (!t0) t0 = t
      if (t - t0 > 3000) {
        timer = 0
        return
      } // пунктир бежит 3 с после включения/смены года и замирает: постоянная перерисовка карты грузила ЦП
      if (document.hidden) {
        timer = 0
        return
      } // вкладка скрыта — пунктир стоит; вернётся по visibilitychange
      if (t - last > 450) {
        last = t
        step = (step + 1) % DASH.length
        map.setPaintProperty('routes-camp', 'line-dasharray', DASH[step])
      }
      timer = requestAnimationFrame(tick)
    }
    timer = requestAnimationFrame(tick)
  }
}
