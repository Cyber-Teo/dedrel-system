// Подсветка шага сценария на карте: линии и точки (GeoJSON) + подписи (DOM-маркеры, в PNG дорисовываются отдельно).
import { Marker, type GeoJSONSource, type Map } from 'maplibre-gl'
import { places, lngLatOf } from '../events'
import { lngLatToPx, pxToLngLat, type LngLat } from '../geo/pixel'
import { readHistoryLayers } from '../layers/layerHash'
import { highlightPolity } from '../history/politics'
import type { StepT } from './schema'
import { emit } from '../lib/bus'

export type Overlay = {
  places: { name: string; ll: LngLat; region?: boolean }[]
  lines: { label: string; pts: LngLat[] }[]
}
let current: Overlay = { places: [], lines: [] }
let markers: Marker[] = []
let relayout: () => void = () => {}
export const getOverlay = () => current

const ensure = (map: Map) => {
  if (map.getSource('scen')) return
  map.addSource('scen', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({
    id: 'scen-line',
    type: 'line',
    source: 'scen',
    filter: ['==', ['geometry-type'], 'LineString'],
    paint: { 'line-color': '#8c1c13', 'line-width': 4, 'line-dasharray': [2, 1.5], 'line-opacity': 0.9 },
  })
  map.addLayer({
    id: 'scen-region',
    type: 'circle',
    source: 'scen',
    filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'region'], true]],
    paint: {
      'circle-radius': 34,
      'circle-color': '#c0152b',
      'circle-opacity': 0.12,
      'circle-stroke-color': '#8c1c13',
      'circle-stroke-width': 2,
      'circle-stroke-opacity': 0.8,
    },
  })
  map.addLayer({
    id: 'scen-ring',
    type: 'circle',
    source: 'scen',
    filter: ['all', ['==', ['geometry-type'], 'Point'], ['!=', ['get', 'region'], true]],
    paint: {
      'circle-radius': 17,
      'circle-color': '#c0152b',
      'circle-opacity': 0.1,
      'circle-stroke-color': '#c0152b',
      'circle-stroke-width': 2.5,
      'circle-stroke-opacity': 0.9,
    },
  })
  map.addLayer({
    id: 'scen-pts',
    type: 'circle',
    source: 'scen',
    filter: ['all', ['==', ['geometry-type'], 'Point'], ['!=', ['get', 'region'], true]],
    paint: {
      'circle-radius': 9,
      'circle-color': '#c0152b',
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 2.5,
      'circle-opacity': 0.95,
    },
  })
}
const label = (txt: string, cls: string) => {
  const el = document.createElement('div')
  el.className = cls
  const i = document.createElement('span')
  i.className = 'scen-in'
  i.textContent = txt
  el.appendChild(i)
  return el
}

export function resolve(step: StepT): Overlay {
  const pl = step.highlight.places.flatMap((id) => {
    const p = places.get(id),
      ll = lngLatOf(p)
    // область (регион, пустыня и т. п.) — контур без подписи; город — точка с подписью без уточнения в скобках
    const pp = p as { kind?: string; symbol?: string } | undefined
    const region =
      ['region', 'desert', 'area'].includes(pp?.kind ?? '') ||
      (pp?.kind === 'other' && (!pp.symbol || pp.symbol === 'none')) // «other» с символом (Микрис — столица-звезда) — точка
    return ll ? [{ name: p!.name.replace(/\s*\(.*?\)/g, ''), ll, region }] : []
  })
  const lines = step.highlight.lines.map((l) => ({
    label: l.label,
    pts: l.via.flatMap((v) => {
      const ll = typeof v === 'string' ? lngLatOf(places.get(v)) : pxToLngLat(v)
      return ll ? [ll] : []
    }),
  }))
  return { places: pl, lines }
}

export function cameraOf(step: StepT): { center: LngLat; zoom: number } {
  const c = step.camera
  const ll = c.px ? pxToLngLat(c.px) : lngLatOf(places.get(c.place!))
  if (!ll) throw new Error(`камера: нет координат у ${c.place}`)
  return { center: ll, zoom: c.zoom }
}

/** Кадр шага: если у шага два и больше мест — вписать их bbox в видимую часть карты (мимо шторки/досье), иначе камера шага со сдвигом на шторку. */
export type Pad = { top: number; bottom: number; left: number; right: number }
/** Рамка рисунка подложки отстоит от края растра на ~72 px (мерено по тайлам z6); за ней бумага. */
const FRAME = 72
/** Центр зажат так, чтобы видимая часть карты не выходила за рамку 7920×5960 px: отступы справа/снизу/слева закрыты панелью, шторкой, легендой (под ними можно), верхний отступ — полоса карты под шапкой (за рамкой она была бы бумагой). Не помещается по оси — центр рамки. */
export function clampCenter(map: Map, center: LngLat, zoom: number, pad: Pad): LngLat {
  const cv = map.getContainer(),
    spp = 2 ** zoom / 16
  const vw = Math.max(0, cv.clientWidth - pad.left - pad.right),
    vh = Math.max(0, cv.clientHeight - pad.top - pad.bottom)
  const [x, y] = lngLatToPx(center)
  const cl = (v: number, lo: number, hi: number, size: number) =>
    lo + hi >= size - 2 * FRAME ? size / 2 : Math.max(FRAME + lo, Math.min(size - FRAME - hi, v))
  return pxToLngLat([cl(x, vw / 2 / spp, vw / 2 / spp, 7920), cl(y, (vh / 2 + pad.top) / spp, vh / 2 / spp, 5960)])
}
export function frameOf(map: Map, step: StepT, pad: Pad): { center: LngLat; zoom: number } {
  const c = cameraOf(step),
    pts = resolve(step).places.map((p) => p.ll)
  if (pts.length < 2) return { ...c, center: clampCenter(map, c.center, c.zoom, pad) }
  // карта лежит в пикселях (7920x5960): зум — по размеру bbox в её пикселях и доступной области (экранных px на px карты = 2^z/16)
  const px = pts.map(lngLatToPx),
    xs = px.map((p) => p[0]),
    ys = px.map((p) => p[1])
  const x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    y0 = Math.min(...ys),
    y1 = Math.max(...ys)
  const cv = map.getContainer(),
    m = 90
  const aw = Math.max(120, cv.clientWidth - pad.left - pad.right - 2 * m),
    ah = Math.max(120, cv.clientHeight - pad.top - pad.bottom - 2 * m)
  const z = Math.min(Math.log2((16 * aw) / Math.max(x1 - x0, 1)), Math.log2((16 * ah) / Math.max(y1 - y0, 1)))
  const zz = Math.max(1, Math.min(6, z))
  return { center: clampCenter(map, pxToLngLat([(x0 + x1) / 2, (y0 + y1) / 2]), zz, pad), zoom: zz }
}

export async function setOverlay(map: Map, step: StepT | null) {
  const run = async () => {
    ensure(map)
    markers.forEach((m) => m.remove())
    markers = []
    current = step ? resolve(step) : { places: [], lines: [] }
    const feats: object[] = [
      ...current.places.map((p) => ({
        type: 'Feature',
        properties: { region: !!p.region },
        geometry: { type: 'Point', coordinates: p.ll },
      })),
      ...current.lines
        .filter((l) => l.pts.length > 1)
        .map((l) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: l.pts } })),
    ]
    ;(map.getSource('scen') as GeoJSONSource).setData({ type: 'FeatureCollection', features: feats } as never)
    const items: { el: HTMLElement; ll: LngLat; anchor: 'top' | 'bottom' }[] = []
    for (const p of current.places)
      if (!p.region) items.push({ el: label(p.name, 'scen-lbl'), ll: p.ll, anchor: 'top' })
    for (const l of current.lines)
      if (l.pts.length > 1) {
        const a = l.pts[0],
          b = l.pts[l.pts.length - 1]
        items.push({
          el: label(l.label, 'scen-lbl scen-line-lbl'),
          ll: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
          anchor: 'bottom',
        })
      }
    for (const it of items)
      markers.push(
        new Marker({ element: it.el, anchor: it.anchor, offset: [0, it.anchor === 'top' ? 12 : -6] })
          .setLngLat(it.ll)
          .addTo(map),
      )
    declutter(map, items)
    map.off('moveend', relayout)
    relayout = () => declutter(map, items)
    map.on('moveend', relayout)
    if (step?.highlight.polities.length) {
      if (!readHistoryLayers(location.hash).politics)
        emit('history', { politics: true, landscape: readHistoryLayers(location.hash).landscape })
      await highlightPolity(map, step.highlight.polities[0])
    } else await highlightPolity(map, null)
  }
  if (!step) {
    markers.forEach((m) => m.remove())
    markers = []
    current = { places: [], lines: [] }
    map.off('moveend', relayout)
  } // подписи снимаем сразу: стиль может перезагружаться (смена подложки), и ожидание load не наступит
  if (map.isStyleLoaded() || map.getSource('scen')) await run()
  else await new Promise<void>((r) => map.once('load', () => run().then(r)))
}

/** Разводит подписи: если рамки пересекаются, сдвигает вертикально (точка остаётся на месте). */
function declutter(map: Map, items: { el: HTMLElement; ll: LngLat; anchor: 'top' | 'bottom' }[]) {
  const placed: { x0: number; y0: number; x1: number; y1: number }[] = []
  for (const it of items) {
    const pt = map.project(it.ll),
      w = Math.max(40, it.el.textContent!.length * 7 + 12),
      h = 20
    let shift = 0
    for (let k = 0; k < 8; k++) {
      const y0 = it.anchor === 'top' ? pt.y + 12 + shift : pt.y - 6 - h - shift
      const box = { x0: pt.x - w / 2, x1: pt.x + w / 2, y0, y1: y0 + h }
      if (!placed.some((q) => box.x0 < q.x1 && box.x1 > q.x0 && box.y0 < q.y1 && box.y1 > q.y0)) {
        placed.push(box)
        break
      }
      shift += h + 2
      if (k === 7) placed.push(box)
    }
    ;(it.el.firstElementChild as HTMLElement).style.top = shift ? `${it.anchor === 'top' ? shift : -shift}px` : ''
  }
}
