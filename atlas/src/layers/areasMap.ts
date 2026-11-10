// Отрисовка площадных слоёв на карте: заливка ячеек по значению (религии/языки/валюты) и штриховка гильдий поверх (по слою на гильдию, поэтому перекрытия видны).
import type { GeoJSONSource, Map } from 'maplibre-gl'
import { convertGeometry, setFeatures, type Coords, type Feat, type Position, type SimpleGeometry } from '../lib/coords'
import { loadCellsFc } from '../geo/cells'
import { type AreaLayerKey, type CellProps, recordsFor, resolveCell } from './areaData'
import { areasFile } from './registry'
import { ensureLabel } from './icons'

/** Первое кольцо полигона (у мультиполигона — его первого полигона): по нему ставится подпись зоны. */
const firstRing = (g: SimpleGeometry): Position[] =>
  ((g.type === 'Polygon' ? g.coordinates[0] : (g.coordinates[0] as Coords[] | undefined)?.[0]) as
    Position[] | undefined) ?? []

const FILL: AreaLayerKey[] = ['religion', 'language', 'currency']
const GUILDS = Object.keys(areasFile.values.guild)

/** Узор штриховки гильдии: линии под углом angle, шаг зависит от номера, чтобы соседние гильдии различались. */
function hatch(color: string, angle: number, step: number) {
  const n = step * 4,
    cv = document.createElement('canvas')
  cv.width = cv.height = n
  const g = cv.getContext('2d')!
  g.strokeStyle = color
  g.globalAlpha = 0.8
  g.lineWidth = 1.6
  for (let k = -n; k <= n * 2; k += step) {
    g.beginPath()
    if (angle === 45) {
      g.moveTo(k, n)
      g.lineTo(k + n, 0)
    } else if (angle === 135) {
      g.moveTo(k, 0)
      g.lineTo(k + n, n)
    } else if (angle === 0) {
      g.moveTo(0, k)
      g.lineTo(n, k)
    } else {
      g.moveTo(k, 0)
      g.lineTo(k, n)
    }
    g.stroke()
  }
  return { width: n, height: n, data: new Uint8Array(g.getImageData(0, 0, n, n).data.buffer) }
}

/** Политика включена в адресе (l=politics): религии тогда не перекрашивают государства, а рисуются штриховкой поверх. */
const politicsOn = () => /[#&]l=[^&]*\bpolitics\b/.test(location.hash)
const RELS = Object.keys(areasFile.values.religion)
let last: { on: AreaLayerKey[]; hidden: Set<string> } | null = null,
  lastPol = false,
  pollTimer = 0

export type AreaCtx = { cells: CellProps[]; feats: Feat<CellProps>[] }
let ctx: Promise<AreaCtx> | null = null

export function ensureAreas(map: Map): Promise<AreaCtx> {
  return (ctx ??= (async () => {
    // в типе CellsFc (geo/cells.ts) нет state_1006 и region, хотя в файле они есть
    const fc = (await loadCellsFc()) as unknown as { features: { properties: CellProps; geometry: SimpleGeometry }[] }
    const feats = fc.features.map((f): Feat<CellProps> => ({
      type: 'Feature',
      properties: {
        id: f.properties.id,
        name: f.properties.name,
        state_1006: f.properties.state_1006,
        region: f.properties.region ?? null,
      },
      geometry: convertGeometry(f.geometry),
    }))
    const add = () => {
      GUILDS.forEach((g, i) =>
        map.addImage(
          `hatch-g${i}`,
          hatch(areasFile.values.guild[g].color, areasFile.values.guild[g].angle ?? 45, 6 + (i % 3) * 2),
        ),
      )
      map.addSource('areas', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      const before = map.getLayer('events-pts') ? 'events-pts' : undefined
      RELS.forEach((r, i) =>
        map.addImage(`hatch-r${i}`, hatch(areasFile.values.religion[r].color, i % 2 ? 135 : 45, 5 + (i % 3))),
      )
      for (const k of FILL)
        map.addLayer(
          {
            id: `areas-${k}`,
            type: 'fill',
            source: 'areas',
            filter: ['!=', ['get', `c_${k}`], ''],
            layout: { visibility: 'none' },
            paint: { 'fill-color': ['get', `c_${k}`], 'fill-opacity': 0.5 },
          },
          before,
        )
      map.addLayer(
        {
          id: 'areas-religion-hatch',
          type: 'fill',
          source: 'areas',
          filter: ['!=', ['get', 'pat_religion'], ''],
          layout: { visibility: 'none' },
          paint: { 'fill-pattern': ['get', 'pat_religion'] },
        },
        before,
      )
      map.addLayer(
        {
          id: 'areas-line',
          type: 'line',
          source: 'areas',
          layout: { visibility: 'none' },
          paint: { 'line-color': '#3a2c1a', 'line-opacity': 0.25, 'line-width': 0.6 },
        },
        before,
      )
      GUILDS.forEach((_, i) =>
        map.addLayer(
          {
            id: `areas-g${i}`,
            type: 'fill',
            source: 'areas',
            filter: ['==', ['get', `g${i}`], 1],
            layout: { visibility: 'none' },
            paint: { 'fill-pattern': `hatch-g${i}`, 'fill-opacity': 0.25 },
          },
          before,
        ),
      ) // штриховка приглушена: названия читаются поверх
      map.addSource('areas-gl', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer(
        {
          id: 'areas-gl',
          type: 'symbol',
          source: 'areas-gl',
          layout: { 'icon-image': ['get', 'lbl'], 'icon-allow-overlap': false, visibility: 'none' },
        },
        before,
      )
    }
    add() // слои панели создаются после 'load' карты
    return { cells: feats.map((f) => f.properties), feats }
  })())
}

/** Выставляет видимость слоёв и свойства ячеек. hidden — выключенные в легенде значения вида «слой|значение». */
export async function applyAreas(map: Map, on: AreaLayerKey[], hidden: Set<string>) {
  const c = await ensureAreas(map)
  last = { on, hidden }
  lastPol = politicsOn()
  clearInterval(pollTimer)
  pollTimer = window.setInterval(() => {
    if (last && politicsOn() !== lastPol) applyAreas(map, last.on, last.hidden)
  }, 700)
  const overPolitics = lastPol && on.includes('religion')
  const feats = c.feats.map((f): Feat => {
    const p: Record<string, unknown> = { ...f.properties }
    for (const k of FILL) {
      const r = on.includes(k) ? resolveCell(areasFile, k, f.properties).main : null
      p[`c_${k}`] =
        r && !hidden.has(`${k}|${r.value}`) && !(k === 'religion' && overPolitics)
          ? areasFile.values[k][r.value].color
          : ''
    }
    const rr = overPolitics ? resolveCell(areasFile, 'religion', f.properties).main : null
    p.pat_religion = rr && !hidden.has(`religion|${rr.value}`) ? `hatch-r${RELS.indexOf(rr.value)}` : ''
    const gs = on.includes('guild') ? recordsFor(areasFile, 'guild', f.properties).map((r) => r.value) : []
    GUILDS.forEach((g, i) => (p[`g${i}`] = gs.includes(g) && !hidden.has(`guild|${g}`) ? 1 : 0))
    return { ...f, properties: p }
  })
  setFeatures(map.getSource('areas') as GeoJSONSource, feats)
  // подпись гильдии в центре её зоны
  const gl: Feat[] = []
  if (on.includes('guild'))
    GUILDS.forEach((g, i) => {
      const pts = feats.filter((f) => f.properties[`g${i}`] === 1).flatMap((f) => firstRing(f.geometry))
      if (!pts.length) return
      const id = `tl-${g}`
      ensureLabel(map, id, g)
      gl.push({
        type: 'Feature',
        properties: { lbl: id },
        geometry: {
          type: 'Point',
          coordinates: [pts.reduce((a, q) => a + q[0], 0) / pts.length, pts.reduce((a, q) => a + q[1], 0) / pts.length],
        },
      })
    })
  setFeatures(map.getSource('areas-gl') as GeoJSONSource, gl)
  map.setLayoutProperty('areas-gl', 'visibility', gl.length ? 'visible' : 'none')
  const vis = (v: boolean) => (v ? 'visible' : 'none')
  for (const k of FILL) map.setLayoutProperty(`areas-${k}`, 'visibility', vis(on.includes(k)))
  map.setLayoutProperty('areas-religion-hatch', 'visibility', vis(overPolitics))
  GUILDS.forEach((_, i) => map.setLayoutProperty(`areas-g${i}`, 'visibility', vis(on.includes('guild'))))
  map.setLayoutProperty('areas-line', 'visibility', vis(on.length > 0))
}
export const areaLayerIds = () => [
  'areas-religion',
  'areas-religion-hatch',
  'areas-language',
  'areas-currency',
  ...GUILDS.map((_, i) => `areas-g${i}`),
]
