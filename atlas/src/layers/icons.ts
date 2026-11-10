// Значки слоёв: SVG-набор public/icons (game-icons.net, CC BY 3.0 — public/icons/ATTRIBUTION.md), выбор значка по слою и категории, растеризация для map.addImage.
// Старые геометрические фигуры (drawIcon) остались запасным вариантом для слоёв без своего значка.
import type { ExpressionSpecification, GeoJSONSource, Map } from 'maplibre-gl'
import { POP } from './build'
import { EMPTY_FC, type FeatureCollection, type PointFeature } from '../lib/coords'
import { distPx } from '../lib/geo'
import { loadImage, loadedImage } from '../lib/image'
import { warn } from '../lib/log'

/** Все значки набора: ключ = имя файла public/icons/<ключ>.svg. */
export const ICON_KEYS = [
  'capital',
  'city',
  'town',
  'fortress',
  'citadel',
  'abbey',
  'hamlet',
  'outpost',
  'ruins',
  'port',
  'temple',
  'school',
  'mine',
  'lighthouse',
  'mage-tower',
  'fair',
  'undead',
  'kraken',
  'reef',
  'whirl',
  'gas',
  'bandits',
  'monster',
  'anomaly',
  'forest',
  'war',
  'battle',
  'treaty',
  'founding',
  'catastrophe',
  'plague',
  'dynasty',
  'religion',
  'rebellion',
  'coronation',
  'economy',
  'migration',
  'discovery',
  'magic',
  'birth',
  'death',
  'trial',
  'politics',
  'other',
  'cog',
  'galley',
  'caravel',
  'boat',
  'caravan',
  'cart',
  'army',
  'fleet',
  'dragon',
  'demon',
  'undead-skull',
  'legion',
  'swamp',
  'wheat',
  'crystal',
  'ingot',
  'jug',
  'fish',
  'wood',
  'ore',
  'gems',
  'salt',
  'wool',
] as const
export type IconKey = (typeof ICON_KEYS)[number]
const KEYSET = new Set<string>(ICON_KEYS)
export const iconUrl = (key: string) => `${import.meta.env?.BASE_URL ?? '/'}icons/${key}.svg`

const HAZARD: Record<string, IconKey> = {
  нежить: 'undead',
  'нежить (болота)': 'swamp',
  чудовища: 'monster',
  'ядовитый газ': 'gas',
  бандиты: 'bandits',
  рифы: 'reef',
  тайфуны: 'whirl',
  кракены: 'kraken',
}
const RESOURCE: Record<string, IconKey> = {
  'зерно, еда и вино': 'wheat',
  'ремесло и товары': 'jug',
  древесина: 'wood',
  'металлы и руда': 'ingot',
  'артефакты и твари': 'crystal',
  камень: 'ore',
  'пряности и растения': 'salt',
}
const PLACE: Record<string, IconKey> = {
  столицы: 'capital',
  города: 'city',
  порты: 'port',
  храмы: 'temple',
  шахты: 'mine',
  руины: 'ruins',
  деревни: 'hamlet',
}
const PEOPLE: Record<string, IconKey> = {
  правители: 'dynasty',
  'власть и суд': 'treaty',
  военные: 'army',
  'маги и духовенство': 'mage-tower',
  'гильдии и торговля': 'fair',
  'знать и сенат': 'capital',
  'божества и демоны': 'demon',
  прочие: 'city',
}
const GUILD: Record<string, IconKey> = {
  наёмнические: 'army',
  торговые: 'fair',
  ремесленные: 'ore',
  магические: 'mage-tower',
  'прочие гильдии': 'city',
}
const ROMAN = /^([IVXLC]+) легион/

/** Значок (ключ набора, для легионов — «legion:XIII») для слоя и категории; null — нет своего значка (запасная фигура). Экспорт для критерия «iconFor(layer, category)». */
export function iconFor(layer: string, cat: string, name = ''): string | null {
  switch (layer) {
    case 'hazards':
      return HAZARD[cat] ?? 'monster'
    case 'undead':
      return 'undead-skull'
    case 'anomalies':
      return 'anomaly'
    case 'fortresses':
      return cat === 'руины'
        ? 'ruins'
        : /цитадел/i.test(name)
          ? 'citadel'
          : /^форт\b|форт |застав|сторожев|бастион|казарм|башн/i.test(name)
            ? 'outpost'
            : 'fortress'
    case 'legions': {
      const m = ROMAN.exec(cat)
      return m ? `legion:${m[1]}` : 'legion'
    }
    case 'schools':
      return 'school'
    case 'shrines':
      return /аббатств|монастыр/i.test(name) ? 'abbey' : 'temple'
    case 'resources':
      return RESOURCE[cat] ?? 'ore'
    case 'places-ranked':
      return cat === 'храмы' && /аббатств|монастыр/i.test(name) ? 'abbey' : (PLACE[cat] ?? 'city')
    case 'people':
      return PEOPLE[cat] ?? 'city'
    case 'guild-hq':
      return GUILD[cat] ?? 'city'
    default:
      return null
  }
}
/** Значок события по его типу (тип выводится из поля type, неклассифицированные — свиток). */
const EVENT_TYPE: Record<string, IconKey> = {
  war: 'war',
  battle: 'battle',
  treaty: 'treaty',
  founding: 'founding',
  independence: 'founding',
  annexation: 'war',
  catastrophe: 'catastrophe',
  plague: 'plague',
  dynasty: 'dynasty',
  coronation: 'coronation',
  religion: 'religion',
  rebellion: 'rebellion',
  economy: 'economy',
  migration: 'migration',
  discovery: 'discovery',
  magic: 'magic',
  birth: 'birth',
  death: 'death',
  trial: 'trial',
  politics: 'politics',
}
export const eventIcon = (type?: string | null): IconKey => EVENT_TYPE[type ?? ''] ?? 'treaty'

/** С какого зума виден значок: столицы с z1, города z2, мелкие места z3 (прочие — всегда). */
export const MIN_ZOOM: Record<string, number> = {
  hamlet: 3,
  capital: 1,
  fortress: 1,
  ruins: 1,
  city: 2,
  town: 2,
  temple: 2,
  school: 2,
  port: 3,
  mine: 3,
  lighthouse: 3,
  fair: 3,
}

/** Масштаб знака внутри холста: порт — 0,7 (24 px на z5). */
const SCALE: Record<string, number> = { port: 0.7, hamlet: 0.62 }
const NO_OUTLINE = new Set<string>() // значки без обводки (пока пусто: обводка у всех)
/** SVG значка набора по ключу (кэш общий с остальными картинками, см. lib/image). */
export const loadSvg = (key: string): Promise<HTMLImageElement> => loadImage(iconUrl(key))
export const loadedSvg = (key: string) => loadedImage(iconUrl(key))

/** Значок на холсте px×px: ключ набора (+ римская цифра легиона), alpha < 1 — для приблизительных положений. */
export function renderIcon(shape: string, px: number, alpha = 1): HTMLCanvasElement | null {
  const [key, num] = shape.split(':'),
    im = loadedSvg(key)
  if (!im) return null
  const c = document.createElement('canvas')
  c.width = c.height = px
  const g = c.getContext('2d')!
  const k = SCALE[key] ?? 1 // порт мельче: 14/18/24 px на z1.5/3/5, не крупнее миниатюр
  // белая обводка 1,5 px (при pixelRatio 3 это ≈4,5 px холста): силуэт значка, сдвинутый по кругу; сам значок сжат на 8%, чтобы обводка не обрезалась
  const kk = k * 0.92,
    oo = (px * (1 - kk)) / 2,
    ow = alpha < 1 ? 3 : 4.5
  if (!NO_OUTLINE.has(key)) {
    const s = document.createElement('canvas')
    s.width = s.height = px
    const sg = s.getContext('2d')!
    sg.drawImage(im, oo, oo, px * kk, px * kk)
    sg.globalCompositeOperation = 'source-in'
    sg.fillStyle = '#fff'
    sg.fillRect(0, 0, px, px)
    g.globalAlpha = alpha
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8
      g.drawImage(s, Math.cos(a) * ow, Math.sin(a) * ow)
    }
  }
  g.globalAlpha = alpha
  g.drawImage(im, oo, oo, px * kk, px * kk)
  g.globalAlpha = 1
  if (num) {
    const w = px * (0.26 + 0.13 * num.length),
      h = px * 0.34,
      x = (px - w) / 2,
      y = px * 0.64
    g.fillStyle = '#7a1f1a'
    g.strokeStyle = '#2b1a0e'
    g.lineWidth = px * 0.05
    g.beginPath()
    g.roundRect(x, y, w, h, h * 0.3)
    g.fill()
    g.stroke()
    g.fillStyle = '#f2e9d8'
    g.font = `700 ${px * 0.27}px Georgia, serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(num, px / 2, y + h / 2 + px * 0.01)
  }
  return c
}

const INK = '#2b1a0e',
  PARCH = '#f1e6c8'
export function drawIcon(shape: string, color: string, hollow: boolean, px = 44): ImageData {
  const c = document.createElement('canvas')
  c.width = c.height = px
  const g = c.getContext('2d')!,
    m = px / 2,
    r = px * 0.34
  g.lineWidth = px * 0.075
  g.lineJoin = 'round'
  const poly = (pts: [number, number][]) => {
    g.beginPath()
    pts.forEach(([x, y], i) => (i ? g.lineTo(m + x * r, m + y * r) : g.moveTo(m + x * r, m + y * r)))
    g.closePath()
  }
  g.fillStyle = hollow ? PARCH : color
  g.strokeStyle = hollow ? color : INK
  if (hollow) g.setLineDash([px * 0.12, px * 0.07])
  switch (shape) {
    case 'diamond':
      poly([
        [0, -1.25],
        [1, 0],
        [0, 1.25],
        [-1, 0],
      ])
      break
    case 'square':
      poly([
        [-0.9, -0.9],
        [0.9, -0.9],
        [0.9, 0.9],
        [-0.9, 0.9],
      ])
      break
    case 'triangle':
      poly([
        [0, -1.1],
        [1.1, 0.9],
        [-1.1, 0.9],
      ])
      break
    case 'hex':
      poly(
        [0, 1, 2, 3, 4, 5].map(
          (i) => [Math.cos((i * Math.PI) / 3) * 1.1, Math.sin((i * Math.PI) / 3) * 1.1] as [number, number],
        ),
      )
      break
    case 'star':
      poly(
        Array.from({ length: 10 }, (_, i) => {
          const a = (i * Math.PI) / 5 - Math.PI / 2,
            k = i % 2 ? 0.5 : 1.25
          return [Math.cos(a) * k, Math.sin(a) * k] as [number, number]
        }),
      )
      break
    case 'cross':
      poly([
        [-0.35, -1.1],
        [0.35, -1.1],
        [0.35, -0.35],
        [1.1, -0.35],
        [1.1, 0.35],
        [0.35, 0.35],
        [0.35, 1.1],
        [-0.35, 1.1],
        [-0.35, 0.35],
        [-1.1, 0.35],
        [-1.1, -0.35],
        [-0.35, -0.35],
      ])
      break
    case 'shield':
      poly([
        [-0.95, -1],
        [0.95, -1],
        [0.95, 0.15],
        [0, 1.2],
        [-0.95, 0.15],
      ])
      break
    case 'flag':
      poly([
        [-0.8, -1.1],
        [1.0, -0.6],
        [-0.8, -0.1],
        [-0.8, 1.2],
        [-1.0, 1.2],
        [-1.0, -1.1],
      ])
      break
    case 'ring':
      g.beginPath()
      g.arc(m, m, r * 1.05, 0, Math.PI * 2)
      break
    default:
      g.beginPath()
      g.arc(m, m, r, 0, Math.PI * 2)
  }
  g.fill()
  g.stroke()
  if (shape === 'ring') {
    g.setLineDash([])
    g.beginPath()
    g.arc(m, m, r * 0.35, 0, Math.PI * 2)
    g.fillStyle = hollow ? color : INK
    g.fill()
  }
  return g.getImageData(0, 0, px, px)
}

const SZ = 96,
  RATIO = 3,
  seen = new globalThis.Map<string, string>() // имя образа -> ключ набора
let tuned: Map | null = null
const LEGION: ExpressionSpecification = ['in', 'legion:', ['get', 'icon']]
const SZM: ExpressionSpecification = ['coalesce', ['get', 'sz'], 1]
const sizeAt = (a: number, b: number, c: number, d: number) =>
  [
    'interpolate',
    ['linear'],
    ['zoom'],
    1,
    ['*', SZM, a, ['case', LEGION, 1.25, 1]],
    3,
    ['*', SZM, b, ['case', LEGION, 1.2, 1]],
    5,
    ['*', SZM, c, ['case', LEGION, 1.15, 1]],
    8,
    ['*', SZM, d, ['case', LEGION, 1.1, 1]],
  ] as unknown as ExpressionSpecification
const tiers = (zoomOf: (k: string) => number) => {
  const by = [1, 2, 3].map((z) => [...seen].filter(([, k]) => zoomOf(k.split(':')[0]) <= z).map(([n]) => n))
  return [
    'case',
    ['==', ['slice', ['get', 'icon'], 0, 3], 'tc-'],
    true,
    ['==', ['slice', ['get', 'icon'], 0, 3], 'rd-'],
    true,
    [
      'step',
      ['zoom'],
      ['in', ['get', 'icon'], ['literal', by[0]]],
      2,
      ['in', ['get', 'icon'], ['literal', by[1]]],
      3,
      true,
    ],
  ] as unknown as ExpressionSpecification
}
let tuneTimer = 0

// Кластеры значков слоёв: на малом зуме близкие значки сливаются в кружок с числом (клик приближает), ресурсы — точки ≤10 px; с z≥CL_MAX — веер как есть.
const CL_MAX = 3,
  DOT_MAX = 2.5,
  CL_PX = 30
const DOT_COLOR: Record<string, string> = {
  city: '#c9a227',
  hamlet: '#8a7a5c',
  wheat: '#b8892b',
  jug: '#a8442a',
  wood: '#5a7a3a',
  ingot: '#c9a227',
  crystal: '#7a3fa0',
  ore: '#6b6354',
  salt: '#3d6b7a',
}
const tierOf = (z: number) => (z < 2 ? 1 : z < 3 ? 2 : 3)
function clusterImage(n: number): ImageData {
  const s = 80,
    c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')!,
    r = n >= 10 ? 32 : 29
  g.shadowColor = 'rgba(43,26,14,.5)'
  g.shadowBlur = 5
  g.fillStyle = '#5a3b1c'
  g.strokeStyle = '#f2e9d8'
  g.lineWidth = 4
  g.beginPath()
  g.arc(s / 2, s / 2, r, 0, Math.PI * 2)
  g.fill()
  g.shadowBlur = 0
  g.stroke()
  g.fillStyle = '#f2e9d8'
  g.font = `700 ${n >= 100 ? 28 : 36}px Georgia, serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(String(n), s / 2, s / 2 + 2)
  return g.getImageData(0, 0, s, s)
}
function dotImage(color: string, small = false): ImageData {
  const s = 20,
    c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')!,
    r = small ? 4.2 : 7
  g.fillStyle = color
  g.strokeStyle = '#f2e9d8'
  g.lineWidth = 3.5
  g.beginPath()
  g.arc(10, 10, r, 0, Math.PI * 2)
  g.stroke()
  g.strokeStyle = '#2b1a0e'
  g.lineWidth = 1.6
  g.stroke()
  g.fill()
  return g.getImageData(0, 0, s, s)
}
/** Приоритет при коллизиях значков (меньше — важнее) и множитель размера по населению (places.yaml, где оно названо в источнике). */
const RANK: Record<string, number> = {
  capital: 0,
  citadel: 1,
  fortress: 2,
  city: 3,
  town: 3.5,
  port: 4,
  temple: 5,
  abbey: 5,
  school: 5,
  mine: 6,
  ruins: 6,
  lighthouse: 6,
  hamlet: 9,
}
function decorate(f: ThematicFeature, shape: string) {
  const pop = POP.get(f.properties.key)
  const sz =
    shape === 'capital'
      ? 1.15
      : shape === 'city' || shape === 'port'
        ? pop
          ? pop >= 2e5
            ? 1.3
            : pop >= 2e4
              ? 1.12
              : 0.92
          : 1
        : 1
  return { ...f.properties, rk: (RANK[shape] ?? 7) - (pop ? Math.log10(pop) / 10 : 0), sz }
}
let placesOn = false
const placesCbs: ((on: boolean) => void)[] = []
/** Подписка на «включён ли слой Места по рангу» (из набора объектов на карте): им управляются модельки мест и гербы столиц. */
export function onPlacesFlag(cb: (on: boolean) => void) {
  placesCbs.push(cb)
  cb(placesOn)
}
function placesFlag(on: boolean) {
  if (on !== placesOn) {
    placesOn = on
    placesCbs.forEach((c) => c(on))
  }
}
export { clusterImage }
/** Недостающие образы: MapLibre 5 пишет «could not be loaded», если образа нет в момент запроса, даже когда его добавил styleimagemissing. Резолверы собираются в один и вызываются ДО запроса. */
const resolvers = new globalThis.WeakMap<Map, ((id: string) => Promise<void> | void)[]>()
export function addMissingResolver(map: Map, fn: (id: string) => Promise<void> | void) {
  let l = resolvers.get(map)
  if (!l) {
    const arr: ((id: string) => Promise<void> | void)[] = []
    l = arr
    resolvers.set(map, arr)
    map.setMissingStyleImageResolver(async (id) => {
      for (const f of arr) await f(id)
    })
  }
  l.push(fn)
}
/** Столицы государств с гербом-медальоном (слой capital-coats): обычный значок столицы под ними скрыт. */
let coatCaps = new globalThis.Set<string>(),
  rebuildNow: (() => void) | null = null
export function setCoatCapitals(keys: string[]) {
  coatCaps = new globalThis.Set(keys)
  rebuildNow?.()
}
/** Свойства точек слоя значков: ключ объекта и образ обязательны, остальное зависит от слоя. */
export type ThematicProps = { key: string; icon: string; gz?: unknown; [k: string]: unknown }
type ThematicFeature = PointFeature<ThematicProps>
type ThematicFc = FeatureCollection<ThematicFeature>

let clustered: Map | null = null
let rawData: ThematicFc = { type: 'FeatureCollection', features: [] }
let rebuildThematic: (() => void) | null = null

/**
 * Данные источника 'thematic'. Показываются не как есть: на малом зуме значки сливаются в кластеры, города и ресурсы
 * становятся точками. Поэтому слои задают данные через set(), а при смене набора образов или зума вызывается rebuild().
 */
export const thematic = {
  set(map: Map, data: ThematicFc): void {
    rawData = data
    if (rebuildThematic) rebuildThematic()
    else (map.getSource('thematic') as GeoJSONSource | undefined)?.setData(data as never)
    placesFlag(data.features.some((f) => String(f.properties.key).startsWith('places-ranked:')))
  },
  rebuild(): void {
    rebuildThematic?.()
  },
}

function installCluster(map: Map) {
  const src = map.getSource('thematic') as GeoJSONSource | undefined
  if (clustered === map || !src) return
  clustered = map
  if (!map.hasImage('hit-ghost')) map.addImage('hit-ghost', new ImageData(28, 28), { pixelRatio: 1 })
  if (!map.getSource('thematic-hit'))
    map.addSource('thematic-hit', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  if (!map.getLayer('thematic-hit'))
    map.addLayer({
      id: 'thematic-hit',
      type: 'symbol',
      source: 'thematic-hit',
      layout: {
        'icon-image': 'hit-ghost',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-anchor': 'center',
      },
    })
  map.on('mouseenter', 'thematic-hit', () => (map.getCanvas().style.cursor = 'pointer'))
  map.on('mouseleave', 'thematic-hit', () => (map.getCanvas().style.cursor = ''))
  const rebuild = () => {
    const z = map.getZoom()
    const fs: ThematicFeature[] = [],
      dots: ThematicFeature[] = [],
      hits: ThematicFeature[] = [],
      pts: { f: ThematicFeature; x: number; y: number }[] = []
    for (const f of rawData.features) {
      const shape = seen.get(f.properties.icon)?.split(':')[0] ?? ''
      const tier = tierOf(z)
      if (z < CL_MAX && seen.has(f.properties.icon) && (MIN_ZOOM[shape] ?? 1) > tier) continue
      if (shape === 'capital' && coatCaps.has(f.properties.key)) continue
      // место уже нарисовано на растре автора (точка + подпись): свой значок не рисуем, оставляем прозрачную область для клика
      if (f.properties.gz) {
        hits.push({ type: 'Feature', properties: { key: f.properties.key, icon: 'hit-ghost' }, geometry: f.geometry })
        continue
      }
      const pr = decorate(f, shape)
      // деревня — всегда малая точка, город — точка без пиктограммы до z3; ресурсы — точки до z2,5
      if (shape === 'hamlet' || (shape === 'city' && z < CL_MAX) || (z < DOT_MAX && DOT_COLOR[shape])) {
        dots.push({ ...f, properties: { ...pr, icon: `rd-${shape}` } })
        continue
      }
      // город без названного населения ≥20 тыс. — малый город (ворота), крупный — застройка: на z≥3 в одном кадре видны разные пиктограммы
      if (shape === 'city' && !((POP.get(f.properties.key) ?? 0) >= 2e4) && z >= CL_MAX) {
        const o = String(pr.icon).endsWith('-o')
        pr.icon = o ? 'ic-town-o' : 'ic-town'
        ensureIcon(map, pr.icon as string, 'town', '', o)
      }
      if (z >= CL_MAX) {
        fs.push({ ...f, properties: pr })
        continue
      }
      if (shape === 'capital' || shape === 'city') {
        fs.push({ ...f, properties: pr })
        continue
      } // столицы не прячутся под бейдж кластера
      const p = map.project(f.geometry.coordinates as [number, number])
      pts.push({ f: { ...f, properties: pr }, x: p.x, y: p.y })
    }
    const used = new Set<number>()
    pts.forEach((a, i) => {
      if (used.has(i)) return
      const grp = [i]
      used.add(i)
      pts.forEach((b, j) => {
        if (!used.has(j) && distPx(a, b) < CL_PX) {
          grp.push(j)
          used.add(j)
        }
      })
      if (grp.length < 2) {
        fs.push(a.f)
        return
      }
      const cx = grp.reduce((s, k) => s + pts[k].f.geometry.coordinates[0], 0) / grp.length,
        cy = grp.reduce((s, k) => s + pts[k].f.geometry.coordinates[1], 0) / grp.length
      fs.push({
        type: 'Feature',
        properties: { key: '', icon: `tc-${grp.length}`, n: grp.length, rk: 2.5 },
        geometry: { type: 'Point', coordinates: [cx, cy] },
      })
    })
    for (const f of [...fs, ...dots]) {
      const id = f.properties.icon
      if (!map.hasImage(id)) {
        if (id.startsWith('tc-')) map.addImage(id, clusterImage(+id.slice(3)), { pixelRatio: 2 })
        else if (id.startsWith('rd-'))
          map.addImage(id, dotImage(DOT_COLOR[id.slice(3)] ?? '#8a6d3b', id === 'rd-hamlet'), { pixelRatio: 2 })
      }
    }
    ;(map.getSource('thematic-hit') as GeoJSONSource | undefined)?.setData({ ...EMPTY_FC, features: hits } as never)
    src.setData({ ...EMPTY_FC, features: [...fs, ...dots] } as never)
  }
  rebuildNow = rebuild
  rebuildThematic = rebuild
  let bucket = ''
  map.on('zoomend', () => {
    const z = map.getZoom(),
      b = `${tierOf(z)}|${z >= CL_MAX}|${z < DOT_MAX}`
    if (z < CL_MAX || b !== bucket) rebuild()
    bucket = b
  })
  addMissingResolver(map, (id) => {
    if (map.hasImage(id)) return
    if (id.startsWith('tc-')) map.addImage(id, clusterImage(+id.slice(3)), { pixelRatio: 2 })
    else if (id.startsWith('rd-'))
      map.addImage(id, dotImage(DOT_COLOR[id.slice(3)] ?? '#8a6d3b', id === 'rd-hamlet'), { pixelRatio: 2 })
  })
  map.on('click', 'thematic-icons', (e) => {
    const f = e.features?.find((x) => String(x.properties.icon).startsWith('tc-'))
    if (f)
      map.easeTo({
        center: (f.geometry as { coordinates: number[] }).coordinates as [number, number],
        zoom: Math.min(map.getZoom() + 1.6, CL_MAX + 0.2),
        duration: 450,
      })
  })
}
function tune(map: Map) {
  if (!map.getLayer('thematic-icons')) return
  if (tuned !== map) {
    tuned = map
    map.setLayoutProperty('thematic-icons', 'icon-size', sizeAt(0.78, 0.86, 0.96, 1.1)) // множитель sz — размер города по населению
    // значок над точкой (4–6 px), чтобы не закрывать подпись места на растре; перекрытие соседних значков разводит кластеризация
    map.setLayoutProperty('thematic-icons', 'icon-anchor', 'bottom')
    map.setLayoutProperty('thematic-icons', 'icon-offset', [
      'case',
      ['==', ['slice', ['get', 'icon'], 0, 3], 'tc-'],
      ['literal', [13, -15]],
      ['literal', [0, -14]],
    ])
    map.setLayoutProperty('thematic-icons', 'icon-padding', 2)
    // коллизии: значки не налезают друг на друга, при споре выигрывает ранг (столица > город > порт > …); обводка 1,5 px — в самом образе
    map.setLayoutProperty('thematic-icons', 'icon-allow-overlap', false)
    map.setLayoutProperty('thematic-icons', 'icon-ignore-placement', false)
    map.setLayoutProperty('thematic-icons', 'symbol-sort-key', ['coalesce', ['get', 'rk'], 7])
    installCluster(map)
  }
  clearTimeout(tuneTimer)
  tuneTimer = window.setTimeout(
    () =>
      map.getLayer('thematic-icons') &&
      map.setFilter(
        'thematic-icons',
        tiers((k) => MIN_ZOOM[k] ?? 1),
      ),
    0,
  )
}
export function ensureIcon(map: Map, name: string, shape: string, color: string, hollow: boolean) {
  if (map.hasImage(name)) return
  if (!KEYSET.has(shape.split(':')[0])) {
    map.addImage(name, drawIcon(shape, color, hollow), { pixelRatio: 2 })
    return
  }
  seen.set(name, shape)
  tune(map)
  const put = () => {
    const c = renderIcon(shape, SZ, hollow ? 0.55 : 1)!
    const d = c.getContext('2d')!.getImageData(0, 0, SZ, SZ)
    map.hasImage(name) ? map.updateImage(name, d) : map.addImage(name, d, { pixelRatio: RATIO })
  }
  if (loadedSvg(shape.split(':')[0])) put()
  else {
    map.addImage(name, new ImageData(SZ, SZ), { pixelRatio: RATIO }) // пустышка до загрузки SVG
    loadSvg(shape.split(':')[0])
      .then(() => map.hasImage(name) && put())
      .catch((e) => warn('значки: SVG', shape, e))
  }
}
/** Для DOM (легенда, панель): значок набора — файл SVG, запасная фигура — data-URL. */
export function iconDataUrl(shape: string, color: string): string {
  const key = shape.split(':')[0]
  if (KEYSET.has(key)) return iconUrl(key)
  const d = drawIcon(shape, color, false, 44),
    c = document.createElement('canvas')
  c.width = c.height = 44
  c.getContext('2d')!.putImageData(d, 0, 0)
  return c.toDataURL()
}

/** Подпись под значком: текст на холсте (стилю карты нужен glyphs, его нет) — образ `tl-<текст>`; вызывается для слоёв с подписями (крепости). */
export function ensureLabel(map: Map, id: string, text: string) {
  if (map.hasImage(id)) return
  const f = '600 22px Georgia, serif',
    c = document.createElement('canvas'),
    g = c.getContext('2d')!
  g.font = f
  const w = Math.ceil(g.measureText(text).width) + 12
  c.width = w
  c.height = 34
  g.font = f
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineJoin = 'round'
  g.strokeStyle = 'rgba(242,233,216,.95)'
  g.lineWidth = 6
  g.strokeText(text, w / 2, 18)
  g.fillStyle = '#3b1410'
  g.fillText(text, w / 2, 18)
  map.addImage(id, g.getImageData(0, 0, w, 34), { pixelRatio: 1.8 })
}
