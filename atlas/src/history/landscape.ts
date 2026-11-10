// Слой «Ландшафт по эпохам»: до года absent_before объект (Внутреннее море, болота) закрыт цветом суши с подписью.
import { Marker, type GeoJSONSource, type Map } from 'maplibre-gl'
import { placeLabels as placePolLabels } from './politics'
import { pxToLngLat } from '../geo/pixel'
import { convertGeometry, flatCoords, setFeatures, type Feat, type SimpleGeometry } from '../lib/coords'
import { loadData, loadGeo } from '../data/load'
import terrainUrl from '../../data/geo/terrain.geojson?url'
import seaUrl from '../../data/geo/inner-sea.geojson?url'
import { loadCellsFc } from '../geo/cells'
import type { LandscapeItemT } from '../data/schema'

// цвет суши по подложке (замер по растру на равнинах)
const LAND: Record<string, string> = { muted: '#767d68', drawn: '#6b7c48' }
let curMode = 'muted'

const markers: { item: LandscapeItemT; m: Marker }[] = []
let items: LandscapeItemT[] = [],
  ready: Promise<void> | null = null

type GeoFc = { features: { properties: { id: string }; geometry: SimpleGeometry }[] }

async function load(map: Map) {
  items = await loadData<LandscapeItemT[]>('history/landscape')
  const geo = new globalThis.Map<string, { geometry: SimpleGeometry }>()
  for (const fc of [
    await loadGeo<GeoFc>(terrainUrl),
    await loadGeo<GeoFc>(seaUrl),
    (await loadCellsFc()) as unknown as GeoFc,
  ])
    for (const f of fc.features) geo.set(f.properties.id, f)
  const feats: Feat[] = []
  for (const it of items)
    for (const gid of it.geometry) {
      const f = geo.get(gid)
      if (!f) continue
      feats.push({
        type: 'Feature',
        properties: { item: it.id, absent_before: it.absent_before },
        geometry: convertGeometry(f.geometry),
      })
    }
  const before = map.getLayer('pol-fill') ? 'pol-fill' : map.getLayer('events-pts') ? 'events-pts' : undefined
  const add = () => {
    map.addSource('ls', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    setFeatures(map.getSource('ls') as GeoJSONSource, feats)
    map.addLayer(
      {
        id: 'ls-fill',
        type: 'fill',
        source: 'ls',
        layout: { visibility: 'none' },
        paint: { 'fill-color': LAND[curMode], 'fill-opacity': 0.97 },
      },
      before,
    )
    map.addLayer(
      {
        id: 'ls-line',
        type: 'line',
        source: 'ls',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#7a6a3a', 'line-width': 1, 'line-dasharray': [3, 2], 'line-opacity': 0.7 },
      },
      before,
    )
  }
  map.isStyleLoaded()
    ? add()
    : await new Promise<void>((r) =>
        map.once('load', () => {
          add()
          r()
        }),
      )
  for (const it of items) {
    const pts = it.geometry.flatMap((g) => (geo.get(g) ? flatCoords(geo.get(g)!.geometry.coordinates) : []))
    if (!pts.length) continue
    const ex = pts.map((p) => p[0]),
      ey = pts.map((p) => p[1])
    const el = document.createElement('div')
    el.textContent = it.label
    el.title = `${it.name}: ${it.note ?? ''}`
    el.className = 'ls-label'
    markers.push({
      item: it,
      m: new Marker({ element: el })
        .setLngLat(pxToLngLat([(Math.min(...ex) + Math.max(...ex)) / 2, (Math.min(...ey) + Math.max(...ey)) / 2]))
        .addTo(map),
    })
  }
}

/** Включает/выключает слой на год: закрыто то, чего к этому году ещё нет (year < absent_before). */
export async function setLandscape(map: Map, on: boolean, year: number, mode = 'muted') {
  curMode = mode
  ready ??= load(map)
  await ready
  map.setPaintProperty('ls-fill', 'fill-color', LAND[mode] ?? LAND.muted)
  for (const id of ['ls-fill', 'ls-line']) {
    map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
    map.setFilter(id, ['>', ['get', 'absent_before'], year])
  }
  curOn = on
  curYear = year
  placeLabels(map)
  if (!bound) {
    bound = true
    map.on('moveend', () => placeLabels(map))
  }
}

let curOn = false,
  curYear = 0,
  bound = false
/** Подписи «ещё нет»: одна подпись — полный текст; две и больше — одна короткая «нет сведений» (полный текст в подсказке); подпись рядом с уже показанной (< 110 px) или вне кадра не рисуется. */
export function placeLabels(map: Map) {
  const act = markers.filter(({ item }) => curOn && curYear < item.absent_before),
    cv = map.getCanvas(),
    W = cv.clientWidth,
    H = cv.clientHeight,
    shown: { x: number; y: number }[] = []
  const r = cv.getBoundingClientRect(),
    hd = document.querySelector('header, #top, .topbar, .top')?.getBoundingClientRect(),
    dk = document.querySelector('#dock, .tl')?.getBoundingClientRect()
  const top = Math.max(8, hd && hd.bottom > r.top ? hd.bottom - r.top + 8 : 8),
    bot = dk && dk.top < r.bottom ? r.bottom - dk.top + 8 : 8
  let one = false // при нескольких подписях рисуем одну «нет сведений»: остальные у неё в подсказке
  for (const { item, m } of markers) {
    const el = m.getElement()
    if (!act.some((a) => a.item === item)) {
      el.style.display = 'none'
      continue
    }
    const many = act.length > 1,
      p = map.project(m.getLngLat())
    el.textContent = many ? 'нет сведений' : item.label
    el.title = many ? act.map((a) => a.item.label).join('\n') : `${item.name}: ${item.note ?? ''}`
    const w = many ? 90 : item.label.length * 7
    // подпись целиком в кадре и не под шапкой/шкалой: якорь у верхнего края (под шапкой) не рисуем
    const inFrame = p.x - w / 2 >= 0 && p.x + w / 2 <= W && p.y - 12 >= top && p.y + 12 <= H - bot
    const clash = shown.some((q) => Math.abs(q.x - p.x) < 110 && Math.abs(q.y - p.y) < 22)
    const ok = inFrame && !clash && !(many && one)
    if (ok) one = true
    el.style.display = ok ? '' : 'none'
    if (ok) shown.push(p)
  }
  placePolLabels(map) // подписи государств уступают место видимым подписям «ещё нет»
}
