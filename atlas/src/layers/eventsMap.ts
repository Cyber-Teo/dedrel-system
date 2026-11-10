// Слой «События»: значки по типу (вместо одинаковых точек), кластеры с числом на малом зуме, подсказка «название · год», зона касания ≥32 px.
// Источник 'events' ведёт main.tsx; здесь он перехватывается (setData) и дублируется в кластерный источник 'events-ic'.
import type { ExpressionSpecification, GeoJSONSource, Map, MapGeoJSONFeature } from 'maplibre-gl'
import { events, lngLatOf, places, yearLabel } from '../events'
import { addMissingResolver, eventIcon, loadSvg, renderIcon } from './icons'
import { readYear } from '../hash'
import { type PointFeature } from '../lib/coords'
import { warn } from '../lib/log'
import { createHoverTip } from '../lib/tooltip'
import { emit, on as onBus } from '../lib/bus'

const byId = new globalThis.Map(events.map((e) => [e.id, e]))
let installed: Map | null = null

/** Тип значка: чума/мор/карантин — раньше войны (в заголовке «Огненная чума» тип мог быть иным). */
const PLAGUE = /чум[аыуе]|\bмор\b|карантин|эпидеми/i
const evKey = (e: (typeof events)[number] | undefined, master: boolean) =>
  master ? 'magic' : e && PLAGUE.test(e.title) ? 'plague' : eventIcon(e?.type)
/** Точка события — первое точечное место (город, крепость); метка страны/«маркер карты» точкой не считается, событие без точечного места на карте не рисуется. */
const isMarker = (id: string) => /marker_karty|\/index$/.test(id)
const pointOf = (e: (typeof events)[number] | undefined) => {
  const id = e?.places.find((p) => !isMarker(p) && lngLatOf(places.get(p)))
  return id ? lngLatOf(places.get(id)) : null
}

/** Чипы-фильтры типов события: подпись и ключи значков (ключ значка = evKey). */
export const EVENT_CHIPS: { id: string; label: string; keys: string[] }[] = [
  { id: 'war', label: 'Война', keys: ['war', 'battle'] },
  { id: 'catastrophe', label: 'Катастрофа', keys: ['catastrophe', 'plague'] },
  { id: 'founding', label: 'Основание', keys: ['founding'] },
  { id: 'treaty', label: 'Договор', keys: ['treaty'] },
  { id: 'magic', label: 'Магия', keys: ['magic'] },
  { id: 'dynasty', label: 'Власть', keys: ['dynasty', 'coronation'] },
  { id: 'rebellion', label: 'Восстание', keys: ['rebellion'] },
  { id: 'religion', label: 'Религия', keys: ['religion'] },
  { id: 'economy', label: 'Экономика', keys: ['economy'] },
  { id: 'migration', label: 'Переселение', keys: ['migration'] },
  { id: 'discovery', label: 'Открытие', keys: ['discovery'] },
  { id: 'birth', label: 'Рождение', keys: ['birth'] },
  { id: 'death', label: 'Смерть', keys: ['death'] },
  { id: 'trial', label: 'Суд', keys: ['trial'] },
  { id: 'politics', label: 'Политика', keys: ['politics'] },
]
const ALL_KEYS = [...new Set(EVENT_CHIPS.flatMap((c) => c.keys))]
let typeFilter: Set<string> | null = null // null — все типы
export const getTypeFilter = () => typeFilter
/** Ключи значков, оставшиеся на карте; null — все. Перерисовывает слой. */
export function setTypeFilter(keys: Set<string> | null) {
  typeFilter = keys && keys.size < ALL_KEYS.length ? keys : null
  emit('evtypes')
}
const typeOk = (icon: string) => !typeFilter || typeFilter.has(icon.slice(3))

/** Значимость типа для значка кластера: меньше — важнее. */
const TYPE_RANK = [
  'war',
  'battle',
  'catastrophe',
  'plague',
  'treaty',
  'rebellion',
  'dynasty',
  'coronation',
  'founding',
  'politics',
  'trial',
  'death',
  'religion',
  'magic',
  'economy',
  'migration',
  'discovery',
  'birth',
]
const rankOf = (icon: string) => {
  const i = TYPE_RANK.indexOf(icon.slice(3))
  return i < 0 ? TYPE_RANK.length : i
}

/** Пауза (мс), которую источник событий должен выждать, прежде чем значки и кластеры пересобираются. */
const DEBOUNCE_MS = 300
/** Радиус прозрачного круга для клика по событию: ≥32 px в поперечнике. */
const HIT_RADIUS_PX = 16
/** Масштаб образов значков событий. */
const EV_PIXEL_RATIO = 3
/** Подсказка: заголовок длиннее этого обрезается. */
const TIP_TITLE_MAX = 70
/** Подсказка ближе этого к правому краю карты (px) встаёт слева от курсора. */
const TIP_EDGE_PX = 190

type Point = { type: 'Point'; coordinates: number[] }
type SrcProps = { id: string; sel?: boolean; master?: boolean }
type EvProps = SrcProps & { icon: string; title: string; year: number | null; n?: number; ids?: string }
type SrcFc = { features: PointFeature<SrcProps>[] } | null | undefined
type EvFc = { type: 'FeatureCollection'; features: PointFeature<EvProps>[] }

const enrich = (fc: SrcFc): EvFc => {
  const first = new globalThis.Map<string, PointFeature<SrcProps>>()
  for (const f of fc?.features ?? []) if (!first.has(f.properties.id)) first.set(f.properties.id, f)
  const groups = new globalThis.Map<string, PointFeature<EvProps>[]>()
  for (const f of first.values()) {
    const e = byId.get(f.properties.id),
      ll = pointOf(e)
    if (!ll) continue
    const icon = `ev-${evKey(e, !!f.properties.master)}`
    if (!typeOk(icon)) continue
    const g = groups.get(ll.join(',')) ?? []
    g.push({
      ...f,
      geometry: { type: 'Point', coordinates: ll },
      properties: { ...f.properties, icon, title: e?.title ?? '', year: e?.year ?? null },
    })
    groups.set(ll.join(','), g)
  }
  // события в одной точке (напр. столица) — один значок с числом, а не стопка
  const features: PointFeature<EvProps>[] = []
  for (const g of groups.values()) {
    if (g.length === 1) {
      features.push({ ...g[0], properties: { ...g[0].properties, n: 1, ids: g[0].properties.id } })
      continue
    }
    // значок кластера — самый значимый тип в точке (война > катастрофа > договор > …), а не самый частый: «прочее» не затмевает чуму и войну
    const top = g.map((f) => f.properties.icon).sort((x, y) => rankOf(x) - rankOf(y))[0]
    features.push({
      ...g[0],
      properties: {
        ...g[0].properties,
        icon: top,
        n: g.length,
        ids: g.map((f) => f.properties.id).join('|'),
        sel: g.some((f) => f.properties.sel),
      },
    })
  }
  return { type: 'FeatureCollection' as const, features }
}
/** Образ значка события: `ev-<ключ>` (или `ev-<ключ>-s` — выбранное, с красным кольцом). */
function evImage(id: string) {
  const sel = id.endsWith('-s'),
    key = id.slice(3).replace(/-s$/, '')
  const base = renderIcon(key, 96, 1)
  if (!base) return null
  const c = document.createElement('canvas')
  c.width = c.height = 96
  const g = c.getContext('2d')!
  if (sel) {
    g.strokeStyle = '#c0152b'
    g.lineWidth = 7
    g.beginPath()
    g.arc(48, 48, 42, 0, Math.PI * 2)
    g.stroke()
  }
  g.drawImage(base, 0, 0)
  return g.getImageData(0, 0, 96, 96)
}
/** Образ кластера `evc-<тип>-<n>`: небольшой диск со значком преобладающего типа и числом событий. */
function clusterImage(key: string, n: number) {
  const s = 96,
    c = document.createElement('canvas')
  c.width = c.height = 2 * s - 16 // образ больше диска: центр образа = точка места, диск сдвинут вверх-вправо
  const g = c.getContext('2d')!
  g.translate(s - 16, 0)
  g.fillStyle = '#f2e9d8'
  g.strokeStyle = '#5a3b1c'
  g.lineWidth = 5
  g.beginPath()
  g.arc(44, 52, 38, 0, Math.PI * 2)
  g.fill()
  g.stroke()
  const ic = renderIcon(key, 60, 1)
  if (ic) g.drawImage(ic, 14, 22)
  const t = String(n),
    w = Math.max(34, 18 + t.length * 17)
  g.fillStyle = '#7a1f1a'
  g.strokeStyle = '#f2e9d8'
  g.lineWidth = 4
  g.beginPath()
  g.roundRect(s - w - 2, 2, w, 36, 18)
  g.fill()
  g.stroke()
  g.fillStyle = '#f2e9d8'
  g.font = '700 26px Georgia, serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(t, s - w / 2 - 2, 21)
  return g.getImageData(0, 0, c.width, c.width)
}
/** Преобладающий тип в кластере по счётчикам c_<ключ> (выражение MapLibre). */
const dominant = (): ExpressionSpecification => {
  const cnt = (k: string): ExpressionSpecification => ['coalesce', ['get', `c_${k}`], 0]
  const arms: (string | ExpressionSpecification)[] = []
  for (const k of ALL_KEYS) {
    const beats = ALL_KEYS.filter((j) => j !== k).map((j): ExpressionSpecification => ['>=', cnt(k), cnt(j)])
    arms.push(['all', ...beats] as unknown as ExpressionSpecification, k)
  }
  return ['case', ...arms, 'treaty'] as unknown as ExpressionSpecification // «case» переменной длины
}
/** События под точкой клика: состав кластера (тот же набор, что на бейдже) или значок; сортировка по близости к выбранному году. */
export function eventIdsAt(
  map: Map,
  point: { x: number; y: number },
  fallback: string[],
): Promise<string[]> | string[] {
  const hits = map.getLayer('events-ic-cluster')
    ? map.queryRenderedFeatures(
        [
          [point.x - 16, point.y - 16],
          [point.x + 16, point.y + 16],
        ],
        { layers: ['events-ic-cluster', 'events-ic-grp', 'events-ic'] },
      )
    : []
  const y0 = readYear(location.hash) ?? 0,
    dist = (id: string) => Math.abs(((byId.get(id)?.year as number) ?? 0) - y0)
  const sort = (ids: string[]) => [...new Set(ids)].sort((a, b) => dist(a) - dist(b) || a.localeCompare(b))
  // ближайший к клику значок: его бейдж и задаёт набор карточек
  const near = hits
    .map((f) => {
      const p = map.project((f.geometry as Point).coordinates as [number, number])
      return { f, d: Math.hypot(p.x - point.x, p.y - point.y) }
    })
    .sort((a, b) => a.d - b.d)[0]?.f as MapGeoJSONFeature | undefined
  if (near?.properties.cluster)
    return (map.getSource('events-ic') as GeoJSONSource)
      .getClusterLeaves(near.properties.cluster_id, 5000, 0)
      .then((ls) => sort(ls.flatMap((f) => String(f.properties?.ids).split('|'))))
  if (near) return sort(String(near.properties.ids).split('|'))
  const ok = (id: string) => typeOk(`ev-${evKey(byId.get(id), !!byId.get(id)?.master)}`)
  return sort(fallback.filter(ok))
}

let scheduleEventsApply: (d: SrcFc) => void = () => {}
/** Сообщить слою событий новые данные источника 'events': значки и кластеры пересоберутся после паузы DEBOUNCE_MS. */
export const scheduleEvents = (d: SrcFc) => scheduleEventsApply(d)

export function installEventIcons(map: Map) {
  if (installed === map) return
  const src = map.getSource('events') as GeoJSONSource | undefined
  if (!src || !map.getLayer('events-pts')) return
  installed = map
  map.addSource('events-ic', {
    type: 'geojson',
    data: enrich(null),
    cluster: true,
    clusterRadius: 34,
    clusterMaxZoom: 2,
    clusterProperties: {
      n: ['+', ['get', 'n']],
      ...Object.fromEntries(
        ALL_KEYS.map((k) => [`c_${k}`, ['+', ['case', ['==', ['get', 'icon'], `ev-${k}`], ['get', 'n'], 0]]]),
      ),
    },
  })
  const apply = (d: SrcFc) => {
    const fc = enrich(d),
      keys = [...new Set<string>(fc.features.map((f) => f.properties.icon.slice(3)))]
    Promise.all(keys.map(loadSvg))
      .then(() => {
        for (const f of fc.features)
          for (const id of [f.properties.icon, `${f.properties.icon}-s`])
            if (!map.hasImage(id)) {
              const im = evImage(id)
              if (im) map.addImage(id, im, { pixelRatio: EV_PIXEL_RATIO })
            }
        for (const f of fc.features)
          if ((f.properties.n ?? 1) > 1) {
            const id = `evc-${f.properties.icon.slice(3)}-${f.properties.n}`
            if (!map.hasImage(id))
              map.addImage(id, clusterImage(f.properties.icon.slice(3), f.properties.n ?? 1), {
                pixelRatio: EV_PIXEL_RATIO,
              })
          }
        ;(map.getSource('events-ic') as GeoJSONSource).setData(fc as never)
      })
      .catch((e) => warn('события: значки', e))
  }
  const reload = () => (src.getData() as Promise<SrcFc>).then(apply).catch((e) => warn('события: данные', e))
  reload()
  onBus('evtypes', () => {
    lastKey = ''
    pending = null
    reload()
  })
  // Источник 'events' наполняет ядро (setData). Значки пересобираем явно: после смены данных читаем их и откладываем сборку.
  let lastKey = '',
    pending: SrcFc = null,
    timer: ReturnType<typeof setTimeout> | undefined
  const flush = () => {
    timer = undefined
    const d = pending
    pending = null
    if (!d) return
    const key = d.features
      .map((f) => `${f.properties.id}${f.properties.sel ? '!' : ''}${f.geometry.coordinates}`)
      .join('|')
    if (key === lastKey) return
    lastKey = key
    apply(d)
  }
  scheduleEventsApply = (d) => {
    pending = d
    timer ??= setTimeout(flush, DEBOUNCE_MS)
  }
  map.on('sourcedata', (e) => {
    if (e.sourceId !== 'events' || e.sourceDataType !== 'content') return
    ;(src.getData() as Promise<SrcFc>).then(scheduleEventsApply).catch((err) => warn('события: данные', err))
  })
  // кликабельная область — прозрачные круги радиусом 16 px (≥32 px в поперечнике)
  map.setPaintProperty('events-pts', 'circle-radius', HIT_RADIUS_PX)
  map.setPaintProperty('events-pts', 'circle-opacity', 0)
  map.setPaintProperty('events-pts', 'circle-stroke-width', 0)
  const before = map.getLayer('thematic-icons')
    ? 'thematic-icons'
    : map.getLayer('measure-line')
      ? 'measure-line'
      : undefined // под значками мест: бейдж не закрывает города
  map.addLayer(
    {
      id: 'events-ic-cluster',
      type: 'symbol',
      source: 'events-ic',
      filter: ['has', 'point_count'],
      layout: {
        'icon-image': ['concat', 'evc-', dominant(), '-', ['get', 'n']],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 1, 1.0, 3, 1.1],
        'icon-offset': [12, -14],
        'icon-allow-overlap': true,
      },
    },
    before,
  )
  const SZ_EV: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 1, 0.72, 3, 0.85, 5, 1.0, 8, 1.15]
  map.addLayer(
    {
      id: 'events-ic',
      type: 'symbol',
      source: 'events-ic',
      filter: ['all', ['!', ['has', 'point_count']], ['<=', ['get', 'n'], 1]],
      layout: {
        'icon-image': ['case', ['get', 'sel'], ['concat', ['get', 'icon'], '-s'], ['get', 'icon']],
        'icon-size': SZ_EV,
        'icon-offset': [0, -11],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    },
    before,
  )
  // события в одной точке: значок преобладающего типа с числом, сдвинут вверх-вправо от значка места
  map.addLayer(
    {
      id: 'events-ic-grp',
      type: 'symbol',
      source: 'events-ic',
      filter: ['all', ['!', ['has', 'point_count']], ['>', ['get', 'n'], 1]],
      layout: {
        'icon-image': ['concat', 'evc-', ['slice', ['get', 'icon'], 3], '-', ['get', 'n']],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 1, 1.0, 3, 1.1, 5, 1.2, 8, 1.3],
        'icon-offset': [12, -14],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    },
    before,
  )
  addMissingResolver(map, async (id) => {
    if (map.hasImage(id)) return
    if (id.startsWith('evc-')) {
      const m = /^evc-([a-z-]+)-(\d+)$/.exec(id)
      if (!m) return
      await loadSvg(m[1]).catch((e) => warn('события: значок', m[1], e))
      if (!map.hasImage(id)) map.addImage(id, clusterImage(m[1], +m[2]), { pixelRatio: EV_PIXEL_RATIO })
      return
    }
    if (!id.startsWith('ev-')) return
    await loadSvg(id.slice(3).replace(/-s$/, '')).catch((e) => warn('события: значок', id, e))
    const d = evImage(id)
    if (d && !map.hasImage(id)) map.addImage(id, d, { pixelRatio: EV_PIXEL_RATIO })
  })
  // подсказка «название · год»; у правой панели досье прижимается влево
  createHoverTip(
    map,
    ['events-pts'],
    (f, el) => {
      const ev = byId.get(String(f.properties.id))
      if (!ev) return false
      el.append(`${ev.title.length > TIP_TITLE_MAX ? ev.title.slice(0, TIP_TITLE_MAX - 2) + '…' : ev.title} · `)
      const small = document.createElement('small')
      small.textContent = yearLabel(ev.year as number)
      el.append(small)
    },
    {
      anchor: (e) => {
        const panel = document.getElementById('dossier')?.getBoundingClientRect(),
          edge = panel && panel.width > 0 ? panel.left : map.getContainer().clientWidth
        return e.point.x > edge - TIP_EDGE_PX ? 'bottom-right' : undefined
      },
    },
  )
  for (const l of ['events-ic-cluster', 'events-ic-grp']) {
    map.on('mouseenter', l, () => (map.getCanvas().style.cursor = 'pointer'))
    map.on('mouseleave', l, () => (map.getCanvas().style.cursor = ''))
  }
  for (const k of new Set([...events.map((e) => eventIcon(e.type)), 'plague']))
    loadSvg(k).catch((e) => warn('события: значок', k, e))
  loadSvg('magic').catch((e) => warn('события: значок magic', e))
}
