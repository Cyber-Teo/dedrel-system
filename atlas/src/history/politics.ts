// Слой «Политика по годам»: заливка ячеек цветом государства на год, штриховка derived (редкая) / speculative (частая),
// серая заливка «нет сведений», подписи государств в центроиде их ячеек.
import { LngLatBounds, Marker, type GeoJSONSource, type Map } from 'maplibre-gl'
import './history.css'
import { pxToLngLat, type Px } from '../geo/pixel'
import { bbox, convertGeometry, flatCoords, setFeatures, type Coords } from '../lib/coords'
import { loadCellsFc, type CellsFc } from '../geo/cells'
import { loadData } from '../data/load'
import { W as MAP_W, H as MAP_H } from '../geo/pixel'
import { labelCell, ownerAt, YEAR_END } from './owners'
import type { OwnersFileT } from '../data/schema'

const NIL = '#6a6760'
type CellF = CellsFc['features'][number]

/** Штриховка-узор: диагональные линии с шагом step; рисуется поверх заливки. */
/** Штриховка «сменили хозяина» (режим сравнения двух лет): диагональ чёрная с белой окантовкой поверх цвета владельца. */
function hatchCmp() {
  const n = 16,
    cv = document.createElement('canvas')
  cv.width = cv.height = n
  const g = cv.getContext('2d')!
  const diag = (w: number, c: string) => {
    g.strokeStyle = c
    g.lineWidth = w
    for (let k = -n; k <= n; k += n) {
      g.beginPath()
      g.moveTo(k - 2, n + 2)
      g.lineTo(k + n + 2, -2)
      g.stroke()
    }
  }
  diag(5, 'rgba(255,255,255,.95)')
  diag(2, 'rgba(20,14,8,.95)')
  return { width: n, height: n, data: new Uint8Array(g.getImageData(0, 0, n, n).data.buffer) }
}
function hatch(step: number, alpha: number) {
  const n = step * 4,
    cv = document.createElement('canvas')
  cv.width = cv.height = n
  const g = cv.getContext('2d')!
  g.strokeStyle = `rgba(35,25,15,${alpha})`
  g.lineWidth = step > 8 ? 1.6 : 1.4
  for (let k = -n; k <= n * 2; k += step) {
    g.beginPath()
    g.moveTo(k, n)
    g.lineTo(k + n, 0)
    g.stroke()
  }
  return { width: n, height: n, data: new Uint8Array(g.getImageData(0, 0, n, n).data.buffer) }
}

/** px столицы по id государства: подпись не ложится на значок столицы. */
const caps = new globalThis.Map<string, Px>()
/** отступ подписи от нарисованной рамки карты, px карты */
const FRAME = 150
const adj = new globalThis.Map<string, Set<string>>(),
  markers = new globalThis.Map<string, Marker>()
let cells: CellF[] = [],
  owners: OwnersFileT,
  ready: Promise<void> | null = null

async function load(map: Map) {
  const q = new URLSearchParams(location.search).get('owners') // ?owners=/файл.yaml — подмена данных для проверки
  owners = q
    ? ((await import('yaml')).parse(await (await fetch(q)).text()) as OwnersFileT)
    : await loadData<OwnersFileT>('history/owners')
  try {
    const [cp, pl] = await Promise.all([
      loadData<{ place: string; state: string }[]>('capitals'),
      loadData<{ id: string; x?: number; y?: number }[]>('places'),
    ])
    const at = new globalThis.Map(pl.map((p) => [p.id, p]))
    for (const c of cp) {
      const p = at.get(c.place)
      if (p && p.x !== undefined && p.y !== undefined) caps.set(c.state, [p.x, p.y])
    }
  } catch {
    /* без столиц подписи просто не обходят значки */
  }
  const fc = await loadCellsFc()
  cells = fc.features
  // соседство ячеек: общие вершины контуров
  const byVert = new globalThis.Map<string, string[]>()
  for (const f of cells) {
    const v = flatCoords(f.geometry.coordinates).map(([x, y]) => `${Math.round(x / 4)},${Math.round(y / 4)}`)
    for (const k of new Set(v)) (byVert.get(k) ?? byVert.set(k, []).get(k)!).push(f.properties.id)
  }
  for (const ids of byVert.values())
    for (const a of ids) for (const b of ids) if (a !== b) (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b)
  const geo = cells.map((f) => ({
    ...f,
    properties: { ...f.properties, color: NIL, pat: '', owner: '', chg: 0 },
    geometry: convertGeometry(f.geometry),
  }))
  const add = () => {
    map.addImage('hatch-derived', hatch(14, 0.3))
    map.addImage('hatch-speculative', hatch(5, 0.45))
    map.addImage('hatch-cmp', hatchCmp())
    map.addSource('pol', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    setFeatures(map.getSource('pol') as GeoJSONSource, geo)
    map.addLayer(
      {
        id: 'pol-fill',
        type: 'fill',
        source: 'pol',
        layout: { visibility: 'none' },
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['==', ['get', 'owner'], ''], 0.62, 0.55] },
      },
      'events-pts',
    )
    map.addLayer(
      {
        id: 'pol-hatch',
        type: 'fill',
        source: 'pol',
        filter: ['!=', ['get', 'pat'], ''],
        layout: { visibility: 'none' },
        paint: { 'fill-pattern': ['get', 'pat'] },
      },
      'events-pts',
    )
    map.addLayer(
      {
        id: 'pol-cmp',
        type: 'fill',
        source: 'pol',
        filter: ['==', ['get', 'chg'], 1],
        layout: { visibility: 'none' },
        paint: { 'fill-pattern': 'hatch-cmp', 'fill-opacity': 0.85 },
      },
      'events-pts',
    )
    map.addLayer(
      {
        id: 'pol-cmp-line',
        type: 'line',
        source: 'pol',
        filter: ['==', ['get', 'chg'], 1],
        layout: { visibility: 'none' },
        paint: { 'line-color': '#140e08', 'line-width': 2, 'line-opacity': 0.9 },
      },
      'events-pts',
    )
    map.addLayer(
      {
        id: 'pol-hl',
        type: 'line',
        source: 'pol',
        filter: ['==', ['get', 'owner'], '\u0000'],
        layout: { visibility: 'none', 'line-join': 'round' },
        paint: { 'line-color': '#8c1c13', 'line-width': 3.2, 'line-opacity': 0.95 },
      },
      'events-pts',
    )
    map.addLayer(
      {
        id: 'pol-line',
        type: 'line',
        source: 'pol',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#3a2c1a', 'line-opacity': 0.22, 'line-width': 0.6 },
      },
      'events-pts',
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
  bindLabelSize(map)
}

/** Подпись на карте: без уточнений в скобках, кроме смысловых («раздроблено», «бывший Арност»). */
export const shortName = (name: string) => labelName(name).replace(/\s*\(бывший.*?\)/, '')
export const labelName = (name: string) => name.replace(/\s*\((?!раздроблено|бывший).*?\)/g, '')

/** Подписи государств, уже напечатанные на растровой подложке (px карты; замер по растру). Векторную подпись рядом с ними не рисуем — иначе двоится. */
export const BAKED: Record<string, [number, number][]> = {
  'Иллиорская империя': [[5851, 2080]],
  'Королевство Гросс': [[5214, 2283]],
  'Королевство Ройо': [[4386, 2903]],
  'Королевство Занра': [[7277, 1894]],
  'Земли Хрэлл': [[4386, 2468]],
  'Республика Дринрог': [[6402, 2706]],
  'Страна Драконов': [[2271, 1431]],
  'Княжество Игни': [[2773, 4033]],
  'Край Оазисов': [[5022, 4414]],
  Этель: [[7270, 2418]],
  'Подковные острова': [[7295, 3983]],
  'Залесское княжество': [[4635, 1296]],
  'Вышневодское княжество': [[7014, 898]],
  'Плато Архидемона': [[3904, 4989]],
  'Побережье работорговцев': [[5290, 5142]],
  'Бастионный союз': [[4961, 2767]],
}
const BAKED_R = 900
/** Растровые подписи подложки читаются только на рисованной подложке в годы около 1005; в muted они приглушены, до 1000 г. — анахроничны: тогда векторную подпись рисуем. */
let ctx = { year: 1005, muted: false }
export const bakedVisible = (year: number, muted: boolean) => !muted && year >= 1000 && year <= 1006
export const isBaked = (name: string, c: [number, number]) =>
  (BAKED[name] ?? []).some(([x, y]) => Math.hypot(x - c[0], y - c[1]) < BAKED_R)

/** Включает/выключает слой и подставляет владельцев на год. Идемпотентно. */
export async function setPolitics(map: Map, on: boolean, year: number, frac = YEAR_END, cmp: number | null = null) {
  ready ??= load(map)
  await ready
  ctx.year = year
  const vis = on ? 'visible' : 'none'
  for (const id of ['pol-fill', 'pol-hatch', 'pol-line']) map.setLayoutProperty(id, 'visibility', vis)
  for (const m of markers.values()) m.getElement().style.display = on ? '' : 'none'
  if (on) placeLabels(map)
  for (const id of ['pol-cmp', 'pol-cmp-line'])
    map.setLayoutProperty(id, 'visibility', on && cmp !== null ? 'visible' : 'none')
  if (!on) {
    map.setLayoutProperty('pol-hl', 'visibility', 'none')
    return
  }
  const byPol = new globalThis.Map<string, { id: string; centroid: [number, number]; area: number }[]>()
  const feats = cells.map((f) => {
    const o = ownerAt(owners.cells[f.properties.id], year + frac)
    const pol = o.polity ? owners.polities[o.polity] : null
    if (o.polity) {
      if (!byPol.has(o.polity)) byPol.set(o.polity, [])
      byPol.get(o.polity)!.push({ id: f.properties.id, centroid: f.properties.centroid, area: f.properties.area_km2 })
    }
    const pat = o.polity && o.confidence !== 'canon' ? 'hatch-' + o.confidence : ''
    const chg = cmp !== null && ownerAt(owners.cells[f.properties.id], cmp + YEAR_END).polity !== o.polity ? 1 : 0
    return {
      ...f,
      properties: {
        ...f.properties,
        color: pol?.color ?? NIL,
        pat,
        owner: o.polity ?? '',
        conf: o.confidence ?? '',
        chg,
      },
      geometry: convertGeometry(f.geometry),
    }
  })
  setFeatures(map.getSource('pol') as GeoJSONSource, feats)
  for (const [pid, m] of markers) if (!byPol.has(pid)) m.getElement().style.visibility = 'hidden'
  // одно название — одна подпись: у нескольких id с одним именем (после labelName) остаётся самый большой
  const best = new globalThis.Map<string, { pid: string; area: number }>()
  for (const [pid, cs] of byPol) {
    const nm = labelName(owners.polities[pid].name),
      a = cs.reduce((t, c) => t + c.area, 0)
    if (!best.has(nm) || best.get(nm)!.area < a) best.set(nm, { pid, area: a })
  }
  for (const [pid, cs] of byPol) {
    if (best.get(labelName(owners.polities[pid].name))!.pid !== pid) {
      markers.get(pid)?.getElement().style.setProperty('visibility', 'hidden')
      continue
    }
    const lc = labelCell(cs, adj)!
    let m = markers.get(pid)
    if (!m) {
      const el = document.createElement('div')
      el.className = 'pol-label'
      m = new Marker({ element: el }).setLngLat([0, 0]).addTo(map)
      markers.set(pid, m)
    }
    const nm = labelName(owners.polities[pid].name),
      el = m.getElement()
    let t = el.firstElementChild as HTMLElement | null
    if (!t) {
      t = document.createElement('span')
      t.className = 'pl-t'
      el.appendChild(t)
    }
    t.textContent = shortName(nm)
    el.style.visibility = 'visible'
    el.dataset.baked = isBaked(nm, lc.centroid) ? '1' : ''
    el.dataset.area = String(byPol.get(pid)!.reduce((a, c) => a + c.area, 0))
    m.setLngLat(pxToLngLat(lc.centroid))
    el.dataset.px = lc.centroid.map(Math.round).join(',')
    el.dataset.pid = pid
  }
  placeLabels(map)
}

/** Раскладка подписей в кадре: рядом с растровой подписью той же страны — прячем (на узком экране растровая слишком мелкая — оставляем),
 *  подпись у края сдвигается внутрь кадра, пересечения решаются в пользу большего государства; что не влезло — скрыто. */
export function placeLabels(map: Map) {
  const cv = map.getCanvas().getBoundingClientRect(),
    pad = 4,
    narrow = innerWidth <= 640
  const els = [...markers.values()]
    .map((m) => m.getElement())
    .filter((e) => e.style.visibility !== 'hidden' && e.style.display !== 'none')
  const op = Number(getComputedStyle(document.documentElement).getPropertyValue('--pol-op') || 1)
  // то, что лежит поверх карты: подпись под ним не читается — её не ставим
  const placed: DOMRect[] = [...document.querySelectorAll('.hist-legend, .al-legend, .tl, .scale, .ls-label')]
    .map((e) => e.getBoundingClientRect())
    .filter((r) => r.width > 0)
  for (const el of els.sort((a, b) => Number(b.dataset.area) - Number(a.dataset.area))) {
    const t = el.firstElementChild as HTMLElement | null
    if (!t) continue
    t.style.transform = ''
    delete el.dataset.hide
    if (op === 0 || (el.dataset.baked && !narrow && bakedVisible(ctx.year, ctx.muted))) {
      el.dataset.hide = '1'
      continue
    }
    let b = t.getBoundingClientRect(),
      dx = 0,
      dy = 0
    // внутренняя рамка кадра: холст ∩ нарисованная рамка карты с отступом
    const fa = map.project(pxToLngLat([FRAME, FRAME])),
      fb = map.project(pxToLngLat([MAP_W - FRAME, MAP_H - FRAME]))
    const fl = Math.max(cv.left + pad, cv.left + fa.x),
      ft = Math.max(cv.top + pad, cv.top + fa.y),
      fr = Math.min(cv.right - pad, cv.left + fb.x),
      fbm = Math.min(cv.bottom - pad, cv.top + fb.y)
    const cx = b.x + b.width / 2,
      cy = b.y + b.height / 2
    if (cx < cv.left || cx > cv.right || cy < cv.top || cy > cv.bottom) {
      el.dataset.hide = '1'
      continue
    } // центр подписи вне кадра
    if (b.left < fl) dx = fl - b.left
    else if (b.right > fr) dx = fr - b.right
    if (b.top < ft) dy = ft - b.top
    else if (b.bottom > fbm) dy = fbm - b.bottom
    // значок столицы своего государства: сдвигаем подпись под него, не выходя из рамки
    const cp = caps.get(el.dataset.pid ?? '')
    if (cp) {
      const q = map.project(pxToLngLat(cp)),
        qx = cv.left + q.x,
        qy = cv.top + q.y
      const nb = { l: b.left + dx, r: b.right + dx, t: b.top + dy, b: b.bottom + dy }
      if (nb.l < qx + 10 && nb.r > qx - 10 && nb.t < qy + 10 && nb.b > qy - 10) {
        const below = qy + 12 - b.top,
          above = qy - 12 - b.bottom
        dy = b.top + below + b.height <= fbm ? below : above
      }
    }
    if (b.width > cv.width - 2 * pad) {
      el.dataset.hide = '1'
      continue
    }
    if (dx || dy) {
      t.style.transform = `translate(${Math.round(dx)}px,${Math.round(dy)}px)`
      b = t.getBoundingClientRect()
    }
    if (
      placed.some((q) => b.left < q.right + 2 && b.right > q.left - 2 && b.top < q.bottom + 1 && b.bottom > q.top - 1)
    ) {
      t.style.transform = ''
      el.dataset.hide = '1'
      continue
    }
    placed.push(b)
  }
}

/** Непрозрачность заливки политики. Рисованная подложка — реже (цвета растра читаются); чем дальше год от 1005 (на нём нарисован растр), тем плотнее заливка, чтобы растровые подписи гасли. */
export const fillOpacity = (base: 'drawn' | 'muted', year: number) => {
  const far = Math.min(1, Math.max(0, (Math.abs(year - 1005) - 60) / 640)) // 0 до ±60 лет, 1 за ±700
  return +((base === 'drawn' ? 0.42 : 0.55) + far * (base === 'drawn' ? 0.4 : 0.27)).toFixed(3)
}
export async function setPolOpacity(map: Map, base: 'drawn' | 'muted', year: number) {
  ready ??= load(map)
  await ready
  ctx = { year, muted: base === 'muted' }
  const k = fillOpacity(base, year)
  if (markers.size) placeLabels(map)
  map.setPaintProperty('pol-fill', 'fill-opacity', ['case', ['==', ['get', 'owner'], ''], Math.min(0.9, k + 0.07), k])
}

/** Размер подписи государства по зуму: растёт до z3 (не больше 28px), на z3–4 не больше 28px и бледнее (.6), с z4 скрыта — растровые подписи подложки крупнеют сами. */
export const labelSize = (z: number) => Math.min(28, Math.max(11, 12 + 4 * (z - 1)))
export const labelOpacity = (z: number) => (z >= 4 ? 0 : z >= 3 ? 0.6 : 1)
function bindLabelSize(map: Map) {
  const f = () => {
    const z = map.getZoom(),
      r = document.documentElement.style
    r.setProperty('--pol-fs', `${labelSize(z).toFixed(1)}px`)
    r.setProperty('--pol-op', String(labelOpacity(z)))
  }
  let raf = 0
  const g = () => {
    if (!raf)
      raf = requestAnimationFrame(() => {
        raf = 0
        if (markers.size) placeLabels(map)
      })
  }
  map.on('zoom', f)
  map.on('zoom', g)
  map.on('move', g)
  map.on('resize', g)
  f()
}

/** Подсветка границ ячеек государства (id или несколько id одного имени; null — снять). Слой должен быть включён. */
export async function highlightPolity(map: Map, pid: string | string[] | null) {
  ready ??= load(map)
  await ready
  const ids = pid === null ? [] : Array.isArray(pid) ? pid : [pid]
  map.setFilter('pol-hl', ['in', ['get', 'owner'], ['literal', ids.length ? ids : ['\u0000']]])
  map.setLayoutProperty('pol-hl', 'visibility', ids.length ? 'visible' : 'none')
}

/** Рамка ячеек государства (на год/долю) для приближения. */
export async function polityBounds(
  map: Map,
  ids: string[],
  year: number,
  frac = YEAR_END,
): Promise<LngLatBounds | null> {
  ready ??= load(map)
  await ready
  const parts: Coords[] = []
  for (const f of cells) {
    const o = ownerAt(owners.cells[f.properties.id], year + frac)
    if (o.polity && ids.includes(o.polity)) parts.push(f.geometry.coordinates)
  }
  const [x0, y0, x1, y1] = bbox(parts)
  if (x0 === Infinity) return null
  return new LngLatBounds(pxToLngLat([x0, y1]), pxToLngLat([x1, y0]))
}
