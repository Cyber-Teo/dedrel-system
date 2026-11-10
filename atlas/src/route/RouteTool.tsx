// Инструменты «Путь» (A→B по дорогам, морю и бездорожью) и «Площадь» (многоугольник, км²).
import {
  Marker,
  type ExpressionSpecification,
  type GeoJSONSource,
  type LngLatLike,
  type Map as MLMap,
} from 'maplibre-gl'
import { createPortal } from 'preact/compat'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { lngLatToPx, pxToLngLat, type Px } from '../geo/pixel'
import { dossierSlot, useDossier } from '../dossier'
import { toolGroup, toolBar } from '../ui/toolGroup'
import { ToolBtn } from '../ui/ToolBtn'
import { activateTool, guardMap } from '../ui/activeTool'
import { loadRouteGraph } from './data'
import { planRoute, shipFallback, type Graph, type Pt } from './graph'
import './route.css'
import { toast } from '../ui/toast'
import type { HazardPt } from './load'
import {
  CAT_NAME,
  CORRIDOR_KM,
  KM2_PER_PX2,
  MODES,
  ROUTE_KINDS,
  describeRoute,
  fmtKm,
  fmtTravel,
  hazardsAlong,
  placeLabel,
  placesAlong,
  splitDays,
  stopLabel,
  stopPin,
  type Cat,
  type Mode,
} from './travel'
import { on } from '../lib/bus'
import { EMPTY_FC, setFeatures, type Feat } from '../lib/coords'
import { distPx } from '../lib/geo'
import { CloseBtn } from '../ui/CloseBtn'

const COLORS: Record<Cat, string> = {
  paved: '#8c1c13',
  gravel: '#b8692b',
  direction: '#a33a1c',
  off: '#4a3a1a',
  sea: '#2b5fa8',
  river: '#3a8fb7',
  air: '#7a3fa0',
}
const DASHED = ['off', 'sea', 'river', 'air']
const ru = (n: number, d = 1) => n.toFixed(d).replace('.', ',')
export const polygonKm2 = (pts: Px[]) => {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i],
      [x2, y2] = pts[(i + 1) % pts.length]
    s += x1 * y2 - x2 * y1
  }
  return (Math.abs(s) / 2) * KM2_PER_PX2
}
const fmtKm2 = (n: number) =>
  Math.round(n)
    .toLocaleString('ru-RU')
    .replace(/\u00a0/g, ' ')

const MODE_IC: Record<Mode, string> = {
  foot: '<path d="M8 3v10l-3.5 3.5V20H19v-3l-6-2.5V3z"/>',
  horse: '<path d="M5 20v-6l3-3 1-6 3 2 4 1 3 4-3 1-2-1-1 3v5"/><path d="M5 14h4"/>',
  cart: '<rect x="3" y="6" width="12" height="8" rx="1"/><circle cx="7" cy="18" r="2"/><circle cx="14" cy="18" r="2"/><path d="M15 9h6"/>',
  ship: '<path d="M3 15h18l-3 5H6z"/><path d="M12 3v12M12 4l6 8h-6"/>',
  griffon: '<path d="M2 13c4-1 7-4 9-9 2 5 4 8 11 9-4 1-7 4-10 7-3-3-6-6-10-7z"/>',
}
const ModeIc = ({ m }: { m: Mode }) => (
  <svg
    class="mic"
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linejoin="round"
    stroke-linecap="round"
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: MODE_IC[m] }}
  />
)

const pin = (txt: string, cls: string) => {
  const el = document.createElement('div')
  el.className = `route-pin ${cls}`
  el.textContent = txt
  return new Marker({ element: el })
}
/** Отступы камеры по реальным панелям: колонка инструментов слева, досье справа (на телефоне — снизу), шапка и док */
function viewPadding(sheet?: HTMLElement | null) {
  const vis = (id: string) => {
    const e = document.getElementById(id)
    if (!e || (!e.offsetParent && getComputedStyle(e).position !== 'fixed')) return null
    const r = e.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none' ? r : null
  }
  const tools = vis('tools'),
    dos = document.body.classList.contains('dossier-open') ? vis('dossier') : null,
    top = vis('top'),
    dock = vis('dock')
  const pad = {
    top: (top?.bottom ?? 0) + 40,
    bottom: (dock ? innerHeight - dock.top : 0) + 40,
    left: tools && tools.right < innerWidth / 2 ? tools.right + 40 : 40,
    right: 40,
  }
  if (dos) {
    if (dos.width > innerWidth * 0.6)
      pad.bottom = Math.max(
        pad.bottom,
        innerHeight -
          dos.top +
          (matchMedia('(max-width: 900px)').matches ? 16 : 16 + 32) /* шкала масштаба над шторкой */,
      )
    else pad.right = innerWidth - dos.left + 40
  }
  if (matchMedia('(max-width: 900px)').matches) {
    const sr = sheet && !sheet.hidden ? sheet.getBoundingClientRect() : null
    if (sr && sr.height > 0) pad.bottom = innerHeight - sr.top + 32
    pad.top = Math.max(70, (top?.bottom ?? 0) + 22)
    pad.right = 64 /* колонка кнопок зума */
    pad.left = 24
  }
  return pad
}

const totalParts = (plan: { km: number; days: number; hpds: number[] }) => {
  const t = fmtTravel(plan.days, plan.hpds),
    m = /^(\S+ \S+)( \(.*\))?$/.exec(t)
  return (
    <>
      <span class="nw">
        <b id="route-km">{fmtKm(plan.km)}</b> · <b id="route-days">{m ? m[1] : t}</b>
      </span>
      {m?.[2] && <span class="meta hrs">{m[2].trim()}</span>}
    </>
  )
}
const mobile = () => matchMedia('(max-width: 900px)').matches
const HOURS_HINT = 'Ходовых часов в сутки: на суше 10 ч (остальное — привал, еда, ночлег), корабль идёт круглосуточно'
/** route=<откуда>,<куда>,<способ> в хеше; запятая внутри id точки (pt:x,y) заменяется на «;» */
export const routeHash = (h: string, r: { a: string; b: string; mode: string } | null) => {
  const p = new URLSearchParams(h.replace(/^#/, ''))
  if (!r && !p.has('route')) return h
  if (r) p.set('route', `${r.a.replace(/,/g, ';')},${r.b.replace(/,/g, ';')},${r.mode}`)
  else p.delete('route')
  return '#' + p.toString()
}
export function readRouteHash(h: string): { a: string; b: string; mode: Mode } | null {
  const v = new URLSearchParams(h.replace(/^#/, '')).get('route')?.split(',')
  if (!v || v.length !== 3 || !(v[2] in MODES) || (!v[0] && !v[1])) return null
  return { a: v[0].replace(/;/g, ','), b: v[1].replace(/;/g, ','), mode: v[2] as Mode }
}
const ptFromId = (g: Graph, id: string): Pt | null => {
  const q = g.pts.get(id)
  if (q) return q
  const m = /^pt:(-?\d+),(-?\d+)$/.exec(id)
  return m ? { id, name: `точка ${m[1]}, ${m[2]}`, x: +m[1], y: +m[2] } : null
}

function ensure(map: MLMap) {
  const go = () => {
    if (map.getSource('route-line')) return
    map.addSource('route-line', { type: 'geojson', data: EMPTY_FC })
    map.addSource('area-poly', { type: 'geojson', data: EMPTY_FC })
    map.addLayer({
      id: 'area-fill',
      type: 'fill',
      source: 'area-poly',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': '#2b5fa8', 'fill-opacity': 0.25 },
    })
    map.addLayer({
      id: 'area-line',
      type: 'line',
      source: 'area-poly',
      paint: { 'line-color': '#1d4380', 'line-width': 2.5 },
    })
    map.addLayer({
      id: 'area-pts',
      type: 'circle',
      source: 'area-poly',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-color': '#1d4380', 'circle-stroke-width': 2 },
    })
    const col = [
      'match',
      ['get', 'cat'],
      ...Object.entries(COLORS).flat(),
      '#000',
    ] as unknown as ExpressionSpecification // «match» переменной длины
    map.addLayer({
      id: 'route-casing',
      type: 'line',
      source: 'route-line',
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-color': '#fff', 'line-width': 7, 'line-opacity': 0.8 },
    })
    map.addLayer({
      id: 'route-solid',
      type: 'line',
      source: 'route-line',
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'dash'], 0]],
      paint: { 'line-color': col, 'line-width': 4 },
    })
    map.addLayer({
      id: 'route-dash',
      type: 'line',
      source: 'route-line',
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'dash'], 1]],
      paint: { 'line-color': col, 'line-width': 4, 'line-dasharray': [2, 1.5] },
    })
  }
  if (map.isStyleLoaded()) go()
  else map.once('load', go)
}
/** Источник создаётся после загрузки стиля: если его ещё нет (F5 с route= в хеше), ждём и пишем данные, когда он появится */
const setData = (map: MLMap, id: string, features: Feat[]) => {
  const put = () => {
    const src = map.getSource(id) as GeoJSONSource | undefined
    if (!src) return false
    setFeatures(src, features)
    return true
  }
  if (put()) return () => {}
  const f = () => {
    if (put()) {
      map.off('styledata', f)
      map.off('idle', f)
    }
  }
  map.on('styledata', f)
  map.on('idle', f)
  return () => {
    map.off('styledata', f)
    map.off('idle', f)
  }
}

export function RouteTool({ map }: { map: MLMap }) {
  const [tool, setTool] = useState<'route' | 'area' | null>(null)
  const [mode, setMode] = useState<Mode>('horse')
  const [data, setData0] = useState<{ g: Graph; hazards: Map<string, string>; hazardPts: HazardPt[] } | null>(null)
  const [a, setA] = useState<Pt | null>(null)
  const [b, setB] = useState<Pt | null>(null)
  const [ta, setTa] = useState('')
  const [tb, setTb] = useState('')
  const [pick, setPick] = useState<'a' | 'b' | null>(null)
  const [area, setArea] = useState<Px[]>([])
  const pins = useRef<{ a?: Marker; b?: Marker }>({})
  const stopPins = useRef<Marker[]>([])
  const cardRef = useRef<HTMLDivElement>(null)
  const before = useRef<{ center: LngLatLike; zoom: number; bearing: number; pitch: number } | null>(null)
  const pending = useRef(readRouteHash(location.hash))
  const [peek, setPeek] = useState(true)
  const [expand, setExpand] = useState(false) // телефон: панель развёрнута вручную до выбора обеих точек
  const [copied, setCopied] = useState('')
  const [sheetH, setSheetH] = useState(0)
  const stage = mobile() && !(a && b) && !expand

  useEffect(() => {
    ensure(map)
    guardMap(map)
    // на мелком масштабе метки дней — кружки с номером, полный текст — по наведению/тапу
    const z = () => document.body.classList.toggle('route-zoomed', map.getZoom() >= 5.5)
    z()
    map.on('zoom', z)
    return () => {
      map.off('zoom', z)
      document.body.classList.remove('route-zoomed')
    }
  }, [])
  useEffect(() => {
    if (tool === 'route' && !data) loadRouteGraph().then(setData0)
  }, [tool])
  // маршрут из ссылки: открыть инструмент, подождать граф и поставить точки
  useEffect(() => {
    if (pending.current) {
      setMode(pending.current.mode)
      setTool('route')
    }
  }, [])
  useEffect(() => {
    const r = pending.current
    if (!r || !data) return
    pending.current = null
    const pa = r.a ? ptFromId(data.g, r.a) : null,
      pb = r.b ? ptFromId(data.g, r.b) : null
    if (pa) {
      setA(pa)
      setTa(placeLabel(pa.name))
    }
    if (pb) {
      setB(pb)
      setTb(placeLabel(pb.name))
    }
    setPick(pa && pb ? null : pa ? 'b' : 'a')
  }, [data])
  // «Маршрут сюда» из карточки места: открыть инструмент, подставить «Куда», ждать клика «Откуда»
  const routeTo = useRef<string | null>(null)
  const applyTo = (id: string, d: NonNullable<typeof data>) => {
    const p = ptFromId(d.g, id)
    if (!p) return
    setB(p)
    setTb(placeLabel(p.name))
    setPick('a')
    setTimeout(
      () => cardRef.current?.querySelector<HTMLInputElement>('.route-end input')?.focus({ preventScroll: true }),
      0,
    )
  }
  useEffect(() => {
    return on('route-to', ({ place: id }) => {
      if (!id) return
      pending.current = null
      routeTo.current = id
      setFolded(false)
      setTool('route')
      if (data) {
        routeTo.current = null
        applyTo(id, data)
      }
    })
  }, [data])
  useEffect(() => {
    if (data && routeTo.current && tool === 'route') {
      const id = routeTo.current
      routeTo.current = null
      applyTo(id, data)
    }
  }, [data, tool])
  // «Вернуть вид»: при выходе из маршрута предложить прежнюю камеру (Esc, ✕, плашка)
  const wasRoute = useRef(false)
  useEffect(() => {
    if (tool === 'route') {
      wasRoute.current = true
      return
    }
    if (!wasRoute.current) return
    wasRoute.current = false
    const v = before.current
    before.current = null
    if (!v) return
    toast('Маршрут закрыт, вид карты изменён')
    const box = document.querySelector('#toasts .toast')
    if (box) {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = 'Вернуть вид'
      b.className = 'toast-restore'
      b.onclick = () => {
        map.easeTo({ ...v, duration: 500 })
        document.getElementById('toasts')?.replaceChildren()
      }
      box.appendChild(b)
      // «Отменить»: вернуть маршрут (и route= в хеше — его снова запишет эффект ссылки)
      const u = document.createElement('button')
      u.type = 'button'
      u.textContent = 'Отменить'
      u.className = 'toast-restore'
      u.onclick = () => {
        setTool('route')
        document.getElementById('toasts')?.replaceChildren()
      }
      box.appendChild(u)
    }
  }, [tool])
  // единый активный инструмент: Esc и включение другого инструмента выключают этот
  useEffect(() => {
    if (!tool) return
    return activateTool(tool, tool === 'route' ? 'Маршрут' : 'Площадь', () => {
      setTool(null)
      setPick(null)
    })
  }, [tool])
  const [folded, setFolded] = useState(false)
  useEffect(() => {
    if (tool !== 'route') setExpand(false)
  }, [tool])
  // другая карточка поверх маршрута сворачивает его в плашку (A/B и расчёт сохраняются)
  useDossier(
    'route',
    tool === 'route',
    () => {
      setFolded(false)
      setTool((t) => (t === 'route' ? null : t))
      setPick(null)
    },
    undefined,
    {
      collapse: setFolded,
      label: () => (plan ? `Маршрут: ${fmtKm(plan.km)} · ${fmtTravel(plan.days, plan.hpds)}` : 'Маршрут'),
    },
  )

  // только города, порты, крепости; без дублей и пометок «(город)», «(маркер карты)»
  const names = useMemo(() => {
    if (!data) return [] as Pt[]
    const by = new Map<string, Pt>()
    for (const p of data.g.pts.values()) {
      if (!ROUTE_KINDS.has(p.kind ?? '') || /маркер карты/.test(p.name)) continue
      const l = placeLabel(p.name),
        old = by.get(l)
      if (!old || (p.name === l && old.name !== l)) by.set(l, p)
    }
    return [...by.values()].sort((x, y) => placeLabel(x.name).localeCompare(placeLabel(y.name), 'ru'))
  }, [data])
  const byName = (n: string) => {
    const q = n.trim().toLowerCase()
    return (
      names.find((p) => placeLabel(p.name).toLowerCase() === q) ??
      (data
        ? ([...data.g.pts.values()].find(
            (p) => !p.id.startsWith('xy:') && placeLabel(p.name).toLowerCase() === q && q,
          ) ?? null)
        : null)
    )
  }
  const suggest = (text: string) => {
    const q = text.trim().toLowerCase()
    if (!q) return []
    const l = names.map((p) => ({ p, n: placeLabel(p.name) })).filter((o) => o.n.toLowerCase().includes(q))
    return l
      .sort((x, y) => +!x.n.toLowerCase().startsWith(q) - +!y.n.toLowerCase().startsWith(q))
      .slice(0, 5)
      .map((o) => o.p)
  }
  const coarse = matchMedia('(pointer: coarse)').matches
  // «Маршрут сюда»: 2–3 ближайших крупных места и ближайшая столица как варианты «Откуда»
  const fromChips = useMemo(() => {
    if (!b || a) return [] as Pt[]
    const d = (p: Pt) => distPx(p, b)
    const big = names
      .filter(
        (p) =>
          p.id !== b.id && !/marker_karty/.test(p.id) && ['capital', 'city', 'port'].includes(p.kind ?? '') && d(p) > 2,
      )
      .sort((x, y) => d(x) - d(y))
    const out = big.slice(0, 3)
    const cap = big.find((p) => p.kind === 'capital')
    if (cap && !out.includes(cap)) out[out.length - 1] = cap
    return out
  }, [names, a, b])
  const plan = useMemo(
    () => (data && a && b && a.id !== b.id ? planRoute(data.g, a, b, mode, data.hazards) : null),
    [data, a, b, mode],
  )
  const stops = useMemo(
    () => (plan && data ? splitDays(plan.legs, data.g.pts.values(), [plan.a.id, plan.b.id], data.hazardPts) : []),
    [plan, data],
  )
  const path = useMemo(() => (plan ? plan.legs.flatMap((l) => l.geom) : []), [plan])
  const along = useMemo(
    () =>
      plan && data
        ? placesAlong(path, data.g.pts.values(), [plan.a.id, plan.b.id], undefined, data.hazardPts).slice(0, 14)
        : [],
    [plan, data],
  )
  const hzAlong = useMemo(() => (plan && data ? hazardsAlong(path, data.hazardPts) : []), [plan, data])
  const ship = useMemo(
    () =>
      data && a && b && a.id !== b.id && !plan && mode === 'ship' ? shipFallback(data.g, a, b, data.hazards) : null,
    [data, a, b, mode, plan],
  )
  // корабль недоступен, если нет ни водного, ни составного (пешком до порта + корабль) пути
  const shipOk = useMemo(
    () => (data && a && b && a.id !== b.id ? !!planRoute(data.g, a, b, 'ship', data.hazards) : true),
    [data, a, b],
  )
  const footAlt = useMemo(
    () =>
      data && a && b && a.id !== b.id && !plan && mode === 'ship'
        ? planRoute(data.g, a, b, 'foot', data.hazards)
        : null,
    [data, a, b, mode, plan],
  )

  // клики по карте: выбор A/B (только в режиме выбора) и вершины площади
  useEffect(() => {
    if (tool === null) return
    const onClick = (e: { lngLat: { lng: number; lat: number }; point: { x: number; y: number } }) => {
      const px = lngLatToPx([e.lngLat.lng, e.lngLat.lat])
      if (tool === 'area') {
        setArea((p) => [...p, px])
        return
      }
      if (!pick || !data) return
      let best: Pt | null = null,
        bd = 26
      for (const p of names) {
        const s = map.project(pxToLngLat([p.x, p.y])),
          d = distPx(s, e.point)
        if (d < bd && !p.id.startsWith('xy:')) {
          bd = d
          best = p
        }
      }
      const pt = best ?? {
        id: `pt:${Math.round(px[0])},${Math.round(px[1])}`,
        name: `точка ${Math.round(px[0])}, ${Math.round(px[1])}`,
        x: px[0],
        y: px[1],
      }
      if (pick === 'a') {
        setA(pt)
        setTa(placeLabel(pt.name))
        setPick(b ? null : 'b')
      } else {
        setB(pt)
        setTb(placeLabel(pt.name))
        setPick(null)
      }
    }
    map.on('click', onClick)
    map.getCanvas().style.cursor = tool === 'area' || pick ? 'crosshair' : ''
    return () => {
      map.off('click', onClick)
      map.getCanvas().style.cursor = ''
    }
  }, [tool, pick, data, b, names])

  // линия маршрута; маркеры «А» и «Б»
  useEffect(() => {
    const f: Feat[] = []
    if (plan)
      for (const l of plan.legs)
        f.push({
          type: 'Feature',
          properties: { cat: l.cat, dash: DASHED.includes(l.cat) ? 1 : 0 },
          geometry: { type: 'LineString', coordinates: l.geom.map(pxToLngLat) },
        })
    return setData(map, 'route-line', tool === 'route' ? f : [])
  }, [plan, tool])
  useEffect(() => {
    for (const [k, pt, txt, cls] of [
      ['a', a, 'А', 'a'],
      ['b', b, 'Б', 'b'],
    ] as const) {
      pins.current[k]?.remove()
      pins.current[k] = undefined
      if (tool === 'route' && pt)
        pins.current[k] = pin(txt, cls)
          .setLngLat(pxToLngLat([pt.x, pt.y]))
          .addTo(map)
    }
  }, [a, b, tool])
  // метки концов дней (кроме последнего: он в пункте назначения)
  useEffect(() => {
    stopPins.current.forEach((m) => m.remove())
    stopPins.current = []
    if (tool !== 'route') return
    for (const s of stops)
      if (!s.last) {
        const m = pin('', 'stop')
            .setLngLat(pxToLngLat([s.x, s.y]))
            .addTo(map),
          el = m.getElement()
        const day = document.createElement('span'),
          label = document.createElement('span')
        day.className = 'sn'
        day.textContent = String(s.day)
        label.className = 'sf'
        label.textContent = stopPin(s)
        el.replaceChildren(day, label)
        el.title = stopPin(s)
        el.style.pointerEvents = 'auto'
        el.addEventListener('click', (ev) => {
          ev.stopPropagation()
          el.classList.toggle('open')
        })
        stopPins.current.push(m)
      }
    // прореживание меток дней по зуму: при z<1.5 — только каждая N-я (N кратно 5, не больше ~5 меток)
    const thin = () => {
      const n = stopPins.current.length,
        step = map.getZoom() < 1.5 ? Math.max(5, Math.ceil(n / 5 / 5) * 5) : 1
      stopPins.current.forEach((m, i) => m.getElement().classList.toggle('thin', step > 1 && (i + 1) % step !== 0))
    }
    thin()
    map.on('zoom', thin)
    return () => {
      map.off('zoom', thin)
      stopPins.current.forEach((m) => m.remove())
      stopPins.current = []
    }
  }, [stops, tool])
  // маршрут в ссылке: route=<откуда>,<куда>,<способ>. При закрытии ключ route удаляется
  useEffect(() => {
    if (pending.current) return
    if (tool === 'route') {
      const next =
        a && b ? routeHash(location.hash, { a: a?.id ?? '', b: b?.id ?? '', mode }) : routeHash(location.hash, null)
      if (next !== location.hash) history.replaceState(null, '', next)
      return
    }
    if (location.hash.includes('route=')) history.replaceState(null, '', routeHash(location.hash, null))
  }, [tool, plan, a, b, mode])
  // шторка на телефоне: высота над низом экрана -> --sheet-h (читает ядро для отступов камеры)
  useEffect(() => {
    const el = cardRef.current
    if (tool !== 'route' || !el || !mobile()) return
    const upd = () => {
      const r = el.getBoundingClientRect()
      setSheetH(Math.round(r.height))
      document.body.style.setProperty(
        '--sheet-h',
        el.hidden || r.height === 0
          ? '0px'
          : `${Math.round(r.height)}px` /* высота шторки над доком (как в dossier.ts), а не от низа экрана: иначе шкала масштаба взлетает на высоту дока */,
      )
    }
    const ro = new ResizeObserver(upd)
    ro.observe(el)
    upd()
    addEventListener('resize', upd)
    return () => {
      ro.disconnect()
      removeEventListener('resize', upd)
      document.body.style.removeProperty('--sheet-h')
    }
  }, [tool, folded, peek, stage, !!data])
  // пока открыт маршрут, maxBounds снят: мир уже на всю ширину окна, и без этого края карты нельзя вывести из-под досье и дока
  useEffect(() => {
    if (tool !== 'route') return
    const mb = map.getMaxBounds()
    if (!mb) return
    const mz = map.getMinZoom()
    map.setMaxBounds(null)
    map.setMinZoom(-1.5) // длинный путь на телефоне: ниже z=0 обе точки иначе не влезают над шторкой
    return () => {
      map.setMinZoom(mz)
      map.setMaxBounds(mb)
    }
  }, [tool])
  useEffect(() => {
    if (!a || !b || tool !== 'route' || folded) return
    // нет пути (например, корабль между внутренними городами) — в кадре всё равно обе точки
    const all = (
      plan
        ? plan.legs.flatMap((l) => l.geom)
        : ([
            [a.x, a.y],
            [b.x, b.y],
          ] as Px[])
    ).map(pxToLngLat)
    const xs = all.map((c) => c[0]),
      ys = all.map((c) => c[1])
    // панель досье появляется после рендера и после смены раскладки: ждём dossier-open и берём отступы по фактическим размерам
    let t = 0,
      n = 0
    const fit = () => {
      if (!document.body.classList.contains('dossier-open') && n++ < 12) {
        t = window.setTimeout(fit, 80)
        return
      }
      const pad = viewPadding(cardRef.current),
        cx = (Math.min(...xs) + Math.max(...xs)) / 2,
        cy = (Math.min(...ys) + Math.max(...ys)) / 2
      const inside = () =>
        [
          [Math.min(...xs), Math.min(...ys)],
          [Math.max(...xs), Math.max(...ys)],
        ].every(([x, y]) => {
          const q = map.project([x, y])
          return (
            q.x >= pad.left - 2 &&
            q.x <= innerWidth - pad.right + 2 &&
            q.y >= pad.top - 2 &&
            q.y <=
              (mobile()
                ? map.getContainer().clientHeight -
                  Math.max(0, pad.bottom - (innerHeight - map.getContainer().getBoundingClientRect().bottom))
                : innerHeight - pad.bottom) +
                2
          )
        })
      const start = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() }
      before.current ??= start
      // вписать с отступами; если не влезло (границы/мин. зум) — отдалять вокруг центра трассы, пока обе точки не окажутся в свободной области
      // на телефоне карта кончается над шкалой времени: отступ снизу считаем от низа холста, а не окна
      const fp = mobile()
        ? {
            ...pad,
            bottom: Math.max(0, pad.bottom - (innerHeight - map.getContainer().getBoundingClientRect().bottom)),
          }
        : pad
      map.fitBounds(
        [
          [Math.min(...xs), Math.min(...ys)],
          [Math.max(...xs), Math.max(...ys)],
        ],
        { padding: fp, maxZoom: 6, duration: 0 },
      )
      for (let i = 0; i < 30 && !inside(); i++)
        map.easeTo({ zoom: Math.max(map.getMinZoom(), map.getZoom() - 0.1), around: [cx, cy], duration: 0 })
      const end = { center: map.getCenter(), zoom: map.getZoom() }
      map.jumpTo(start)
      map.easeTo({ ...end, duration: 400 })
    }
    t = window.setTimeout(fit, 120)
    return () => clearTimeout(t)
  }, [plan, a?.id, b?.id, peek, folded, sheetH])

  // многоугольник площади
  useEffect(() => {
    const c = area.map(pxToLngLat)
    const f: Feat[] = c.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } }))
    if (tool === 'area' && c.length > 1)
      f.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } })
    if (tool === 'area' && c.length > 2)
      f.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...c, c[0]]] } })
    setData(map, 'area-poly', tool === 'area' ? f : [])
  }, [area, tool])

  const toggle = (t: 'route' | 'area') => {
    setTool(tool === t ? null : t)
    if (t === 'route' && tool !== 'route') setPick(a ? (b ? null : 'b') : 'a')
  }
  // невалидный текст: место сбрасывается (старый маршрут и линия уходят), режим выбора на карте выключается
  const resolve = (which: 'a' | 'b', text: string) => {
    const p = byName(text)
    setPick(null)
    if (which === 'a') {
      setTa(text)
      setA(p)
    } else {
      setTb(text)
      setB(p)
    }
  }
  const choose = (which: 'a' | 'b', p: Pt) => resolve(which, placeLabel(p.name))
  const swap = () => {
    setA(b)
    setB(a)
    setTa(tb)
    setTb(ta)
  }
  const km2 = area.length > 2 ? polygonKm2(area) : 0

  // телефон: пока точки выбираются, шторка — только «Откуда/Куда» (карта остаётся доступной для тапа)
  const cats = plan ? (Object.keys(CAT_NAME) as Cat[]).filter((c) => plan.byCat[c]) : []
  const stepName = (id: string) => placeLabel(data!.g.pts.get(id)?.name ?? plan!.b.name)
  return (
    <>
      {createPortal(
        <>
          <ToolBtn
            n="route"
            title="Маршрут между двумя местами: километры и сутки пути"
            on={tool === 'route'}
            onClick={() => toggle('route')}
          >
            Маршрут
          </ToolBtn>
          <ToolBtn
            n="area"
            title="Площадь области: отметьте углы кликами по карте"
            on={tool === 'area'}
            onClick={() => toggle('area')}
          >
            Площадь области
          </ToolBtn>
        </>,
        toolGroup('measure'),
      )}
      {createPortal(
        <>
          {tool === 'area' && (
            <div class="measure tbar-item">
              <span id="area-km2">
                {area.length < 3 ? `Поставьте минимум 3 точки (${area.length})` : `${fmtKm2(km2)} км²`}
              </span>
              <button type="button" onClick={() => setArea((p) => p.slice(0, -1))} disabled={!area.length}>
                Убрать точку
              </button>
              <button type="button" onClick={() => setArea([])} disabled={!area.length}>
                Сбросить
              </button>
            </div>
          )}
        </>,
        toolBar(),
      )}
      {tool === 'route' &&
        createPortal(
          <div class={`card route-card${peek ? ' peek' : ''}${stage ? ' stage' : ''}`} hidden={folded} ref={cardRef}>
            <button
              type="button"
              class="sheet-handle"
              aria-expanded={!peek && !stage}
              aria-label={peek || stage ? 'Развернуть шторку маршрута' : 'Свернуть шторку маршрута'}
              onClick={() => (stage ? setExpand(true) : setPeek((v) => !v))}
            >
              <i />
            </button>
            <CloseBtn
              onClick={() => {
                setTool(null)
                setPick(null)
              }}
            />
            <h3>Маршрут</h3>
            <div class="route-total" title={HOURS_HINT}>
              {plan ? (
                <>{totalParts(plan)}</>
              ) : (
                <span class="meta">
                  {a && b && data
                    ? a.id === b.id
                      ? 'Начало и конец совпадают'
                      : 'Маршрут не построен'
                    : a && b
                      ? 'Считаю…'
                      : 'Выберите «Откуда» и «Куда»'}
                </span>
              )}
            </div>
            <div class="seg route-modes" role="group" aria-label="Способ передвижения">
              {(Object.keys(MODES) as Mode[]).map((m) => (
                <button
                  type="button"
                  class={mode === m ? 'on' : ''}
                  aria-pressed={mode === m}
                  aria-label={MODES[m].name}
                  disabled={m === 'ship' && !shipOk && mode !== 'ship'}
                  title={m === 'ship' && !shipOk ? 'Корабль: водного пути между этими местами нет' : MODES[m].name}
                  onClick={() => setMode(m)}
                >
                  <ModeIc m={m} />
                  <span class="mn">{MODES[m].name}</span>
                </button>
              ))}
            </div>
            <div class="route-ends">
              {(
                [
                  ['a', 'Откуда', ta, a],
                  ['b', 'Куда', tb, b],
                ] as const
              ).map(([w, label, text, pt]) => (
                <div class="route-end">
                  <label>
                    <span>{label}</span>
                    <input
                      list="route-places"
                      value={text}
                      placeholder="место"
                      onInput={(e) => resolve(w, (e.target as HTMLInputElement).value)}
                      class={`${text && !pt ? 'bad' : ''} ${pick === w ? 'picking' : ''}`}
                      aria-invalid={!!text && !pt}
                    />
                    <button
                      type="button"
                      class={pick === w ? 'on' : ''}
                      title="Указать на карте"
                      aria-label={`Указать на карте: ${label.toLowerCase()}`}
                      aria-pressed={pick === w}
                      onClick={() => setPick(pick === w ? null : w)}
                    >
                      ◎
                    </button>
                  </label>
                  {text.trim() && !pt && (
                    <div class="route-bad" role="alert">
                      Выберите место из списка{suggest(text).length ? ':' : ' — такого нет.'}
                      {suggest(text).map((p) => (
                        <a
                          role="button"
                          tabIndex={0}
                          onClick={() => choose(w, p)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') choose(w, p)
                          }}
                        >
                          {placeLabel(p.name)}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <datalist id="route-places">
                {names.slice(0, 700).map((p) => (
                  <option value={placeLabel(p.name)} />
                ))}
              </datalist>
              <button class="swap" onClick={swap}>
                ⇅ поменять
              </button>
            </div>
            {pick && (
              <div class="meta" role="status">
                {coarse
                  ? 'Коснитесь точки на карте'
                  : pick === 'a'
                    ? 'Кликните точку старта на карте'
                    : 'Кликните точку назначения на карте'}{' '}
                (ближайшее место или любая точка)
              </div>
            )}
            {!a && b && fromChips.length > 0 && (
              <div class="route-chips" role="group" aria-label="Откуда: ближайшие места">
                <span class="meta">Откуда:</span>
                {fromChips.map((p) => (
                  <button type="button" class="chip" onClick={() => choose('a', p)}>
                    {placeLabel(p.name)}
                    {p.kind === 'capital' ? ' · столица' : ''}
                  </button>
                ))}
              </div>
            )}
            {!data && <div class="meta">Загружаю дороги…</div>}
            {a && b && a.id === b.id && <p>Начало и конец совпадают.</p>}
            {a && b && data && a.id !== b.id && !plan && (
              <p class="route-none">
                {mode === 'ship'
                  ? ship?.port
                    ? `Водного пути нет — до ближайшего порта (${placeLabel(ship.port.name)}) пешком ${fmtKm(ship.km!)}.`
                    : 'Водного пути между этими местами нет.'
                  : `Пути нет: ${MODES[mode].name.toLowerCase()} туда не добраться.`}
                {footAlt && (
                  <>
                    {' '}
                    Пешком — {fmtKm(footAlt.km)}, ≈{ru(footAlt.days)} сут.{' '}
                    <button type="button" class="mn-link" onClick={() => setMode('foot')}>
                      Показать пешком
                    </button>
                  </>
                )}
              </p>
            )}
            {plan && (
              <div class="route-res">
                <div class="meta">
                  {MODES[plan.mode].name}
                  {plan.transfer ? ', с пересадкой на корабль' : plan.composite ? ', пешком до порта и от порта' : ''};
                  по прямой {fmtKm(plan.straightKm)}
                </div>
                <table class="route-cats">
                  <tbody>
                    {cats.map((c) => (
                      <tr>
                        <td>
                          <i style={{ background: COLORS[c] }} />
                          {CAT_NAME[c]}
                        </td>
                        <td>{fmtKm(plan.byCat[c]!.km)}</td>
                        <td>{ru(plan.byCat[c]!.days)} сут</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div class="route-days">
                  <b>По дням</b>
                  <ol>
                    {stops.map((s) => (
                      <li data-day={s.day}>
                        <b>День {s.day}</b> — {s.last ? 'прибытие: ' : 'ночлег: '}
                        {stopLabel(s)}
                        <span class="meta"> · {Math.round(s.km)} км от начала</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div class="route-along">
                  <b>По пути</b>
                  {along.length === 0 && hzAlong.length === 0 && plan.warnings.length === 0 ? (
                    <p class="meta">Рядом с путём (до {40} км) мест нет.</p>
                  ) : null}
                  <ul>
                    {along.map((o) => (
                      <li class={o.unsafe ? 'haz' : ''}>
                        {o.unsafe ? '⚠ ' : o.place.kind === 'fortress' ? '⚑ ' : ''}
                        {placeLabel(o.place.name)}
                        <span class="meta">
                          {' '}
                          · {o.unsafe ? 'руины, нежить — ночлег невозможен, ' : ''}
                          {o.fortress ? 'крепость, ' : ''}
                          {o.onRoad ? `на пути (≤${CORRIDOR_KM} км)` : `в ${Math.round(o.offKm)} км от пути`} ·{' '}
                          {Math.round(o.alongKm)}-й км
                        </span>
                      </li>
                    ))}
                    {hzAlong.map((h) => (
                      <li class="haz">
                        ⚠ {h.name}
                        <span class="meta"> · {h.threat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  type="button"
                  class="route-copy"
                  onClick={async () => {
                    const t = describeRoute({
                      from: placeLabel(plan.a.name),
                      to: placeLabel(plan.b.name),
                      mode: plan.mode,
                      km: plan.km,
                      days: plan.days,
                      hpds: plan.hpds,
                      stops,
                      along,
                      warnings: [...plan.warnings, ...hzAlong.map((h) => `${h.name} (${h.threat})`)],
                    })
                    try {
                      await navigator.clipboard.writeText(t)
                      setCopied('Скопировано')
                    } catch {
                      setCopied('Не удалось скопировать')
                    }
                    setTimeout(() => setCopied(''), 2500)
                  }}
                >
                  Копировать описание пути
                </button>
                {copied && (
                  <span class="meta" role="status">
                    {' '}
                    {copied}
                  </span>
                )}
                {plan.warnings.length > 0 && (
                  <div class="alt route-warn">
                    <b>Предупреждения</b>
                    {plan.warnings.map((w) => (
                      <p>{w}</p>
                    ))}
                  </div>
                )}
                <ol class="route-steps">
                  <li>
                    <b>{placeLabel(plan.a.name)}</b>
                  </li>
                  {plan.legs.map((l) => (
                    <li>
                      <span class="m" style={{ color: COLORS[l.cat] }}>
                        {CAT_NAME[l.cat]}
                      </span>{' '}
                      {fmtKm(l.km)} → <b>{stepName(l.to)}</b>
                      {l.terr.length && plan.mode !== 'griffon' ? (
                        <span class="meta"> · {l.terr.join(', ')}</span>
                      ) : null}
                    </li>
                  ))}
                </ol>
                <div class="meta">
                  Скорости: вики (верхом {MODES.horse.kmDay} км/сут, телега {MODES.cart.kmDay}, грифон{' '}
                  {MODES.griffon.kmDay}, пешком {MODES.foot.kmDay}, корабль 10 км/ч); тракт ×1,0, грунтовка ×0,8,
                  бездорожье по местности ×0,3–0,7.
                </div>
              </div>
            )}
          </div>,
          dossierSlot(),
        )}
    </>
  )
}
