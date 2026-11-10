import { build, type Row } from './build'
import { iconFor } from './icons'
import { DEFAULT_LAYERS, hasLayerKey, withLayerIds } from './layerHash'
import { loadData, loadGeo } from '../data/load'
import statesUrl from '../../data/geo/states-1006.geojson?url'
import type { AreasFileT, RouteRecT } from '../data/schema'

const [
  layers,
  places,
  orgs,
  people,
  military,
  fortressDates,
  religion,
  hazards,
  magic,
  resources,
  guildHq,
  peopleLoc,
  anchors,
  miniatures,
  states,
  areas,
  routesRaw,
] = await Promise.all(
  [
    'layers',
    'places',
    'orgs',
    'people',
    'military',
    'fortress-dates',
    'religion',
    'hazards',
    'magic',
    'resources',
    'guild-hq',
    'people-loc',
    'anchors',
    'miniatures',
  ]
    .map((n) => loadData<Row>(n))
    .concat([loadGeo<Row>(statesUrl), loadData<Row>('areas'), loadData<Row>('routes')]),
)

export const routes = routesRaw as RouteRecT[]
const placesList = places as { id: string; name: string; sources?: string[] }[]
export const placeName = new Map<string, string>(placesList.map((p) => [p.id, p.name]))
/** Государство места (slug из countries/<slug>/…) — для цвета знамени на походах. */
export const placeCountry = (id: string): string | undefined =>
  placesList
    .find((p) => p.id === id)
    ?.sources?.map((s) => /^countries\/([^/]+)/.exec(s)?.[1])
    .find(Boolean)
export const areasFile = areas as AreasFileT
export const built = build({
  layers,
  places,
  orgs,
  people,
  military,
  fortressDates,
  religion,
  hazards,
  magic,
  resources,
  guildHq,
  peopleLoc,
  anchors,
  states,
  miniatures,
})

export const PALETTE = [
  '#8c1c13',
  '#b8892b',
  '#5a3b1c',
  '#a8442a',
  '#6e6a3a',
  '#3f4f5a',
  '#7a2f55',
  '#c9a44c',
  '#2f5d3a',
  '#8a6d3b',
]
export const SHAPES = ['hex', 'diamond', 'square', 'triangle', 'star', 'cross', 'ring', 'shield', 'circle', 'flag']

/** Категории слоя по убыванию числа объектов: для легенды и цвета/формы значка. */
export const catsOf = (layerId: string): { cat: string; n: number }[] => {
  const m = new Map<string, number>()
  for (const o of built.objs.get(layerId) ?? []) m.set(o.cat, (m.get(o.cat) ?? 0) + 1)
  return [...m].map(([cat, n]) => ({ cat, n })).sort((a, b) => b.n - a.n || a.cat.localeCompare(b.cat, 'ru'))
}
const catIndex = new Map<string, number>()
for (const l of built.layers) catsOf(l.id).forEach((c, i) => catIndex.set(`${l.id}|${c.cat}`, i))
/** Значок объекта: у ресурсов форма зависит от типа, у остальных — цвет от категории. */
export function iconOf(
  layerId: string,
  cat: string,
  approx: boolean,
  name = '',
): { shape: string; color: string; name: string } {
  const l = built.layers.find((x) => x.id === layerId)!,
    i = catIndex.get(`${layerId}|${cat}`) ?? 0
  const own = iconFor(layerId, cat, name)
  if (own) return { shape: own, color: l.color ?? '#7a1f1a', name: `ic-${own}${approx ? '-o' : ''}` }
  const shape = layerId === 'resources' ? SHAPES[i % SHAPES.length] : l.icon!
  const color = layerId === 'resources' ? l.color! : PALETTE[i % PALETTE.length]
  return { shape, color, name: `ic-${shape}-${color.slice(1)}${approx ? '-o' : ''}` }
}

/** Однострочное описание рабочих слоёв для панели. */
export const LAYER_BLURB: Record<string, string> = {
  hazards: 'Чем грозит каждая зона и где она.',
  events: 'Хроника с местом на карте, в окне лет вокруг ползунка.',
  campaigns: 'Армии линиями; видны только в годы похода (±окно).',
  legions: 'Какие части и где стоят.',
  fortresses: 'С эпохой постройки; значок зависит от типа.',
  resources: 'Форма значка — вид ресурса.',
  'trade-routes': 'Суша, река, море и караваны.',
  currencies: 'Какая монета в ходу в какой области.',
  slavery: 'Центры и потоки.',
  religions: 'Основная заливкой, остальные в карточке.',
  shrines: 'Где стоят и чему посвящены.',
  undead: 'Где обитают и где поднимают мёртвых.',
  anomalies: 'Места, где ломаются законы природы.',
  schools: 'Где учат и кого.',
  people: 'Те, чьё место пребывания известно.',
  languages: 'Какие говорят в какой области.',
  'guild-hq': 'Где сидят и какого они типа.',
  'guild-spheres': 'Штриховка поверх стран; цвет — гильдия.',
  'places-ranked': 'Столицы видны сразу, мелкие места — при приближении.',
  'world-miniatures': 'Драконы, корабли, кракен, караваны, нежить, башня университета.',
}
/** Слои, привязанные к состоянию 1006 г. (границы государств, торговые пути без дат), а не к ползунку лет. */
export const BOUND_1006 = new Set(['religions', 'languages', 'currencies', 'guild-spheres', 'trade-routes'])
/** Без ключа l в адресе действует набор по умолчанию (флага «уже показывали» нет: пустой набор хранится как l=none). */
export function seedDefaultLayers() {
  try {
    if (hasLayerKey(location.hash)) return
    const ids = DEFAULT_LAYERS.filter((id) => built.layers.some((l) => l.id === id && l.status === 'ready'))
    history.replaceState(null, '', withLayerIds(location.hash, ids))
  } catch {
    /* приватный режим: слои по умолчанию не включаем */
  }
}
seedDefaultLayers()

const SHORT: Record<string, string> = {
  events: 'События',
  people: 'Персонажи',
  'places-ranked': 'Места',
  'world-miniatures': 'Миниатюры',
  hazards: 'Опасные зоны',
  'trade-routes': 'Торговля',
  'guild-spheres': 'Сферы гильдий',
  'guild-hq': 'Гильдии',
  campaigns: 'Походы',
  fortresses: 'Крепости',
  resources: 'Ресурсы',
  currencies: 'Валюты',
  religions: 'Религии',
  shrines: 'Святыни',
  schools: 'Школы магии',
  anomalies: 'Аномалии',
  undead: 'Нежить',
  slavery: 'Рабство',
  languages: 'Языки',
}
/** Короткое имя слоя для чипа: из таблицы, иначе имя до скобки/двоеточия. */
export function shortName(l: { id: string; name: string }): string {
  return SHORT[l.id] ?? l.name.replace(/\s*[(:].*$/, '').trim()
}
