import { z } from 'zod'

// Общие поля каждой записи данных.
const Alt = z.object({ text: z.string().min(1), sources: z.array(z.string()).default([]) })
const Common = {
  id: z.string().min(1),
  sources: z.array(z.string().min(1)).min(1, 'нужен хотя бы один источник (slug вики или «map:газеттир»)'),
  confidence: z.enum(['canon', 'derived', 'speculative']),
  visibility: z.enum(['public', 'master']).default('public'),
  alt: z.array(Alt).default([]),
}

// Пиксели карты 7920×5960. Координаты необязательны: придут из газеттира.
export const MAP_W = 7920
export const MAP_H = 5960
const Px = (max: number) => z.number().min(0).max(max)

export const Place = z.object({
  ...Common,
  name: z.string().min(1),
  kind: z.string().min(1),
  x: Px(MAP_W).optional(),
  y: Px(MAP_H).optional(),
  symbol: z.string().optional(),
  pos_confidence: z.enum(['high', 'medium', 'low']).optional(), // уверенность чтения подписи на растре (газеттир)
  aliases: z.array(z.string()).default([]),
  parent: z.string().optional(), // id места
  parent_text: z.string().optional(), // родитель, не найденный среди мест (держава и т.п.)
  slug: z.string().optional(),
  hint: z.string().optional(), // положение словами из текста
  facts: z.string().optional(),
})

export const DatePrecision = z.enum(['day', 'month', 'year', 'decade', 'approx'])
const Actor = z.object({ name: z.string().min(1), id: z.string().optional() })
// Смена владения: кто что получил/потерял (places — id мест; polity_id — id государства из states-1006.geojson, если оно там есть); note — исходная формулировка текста.
const Holder = z.object({ polity: z.string().min(1), polity_id: z.string().optional(), places: z.array(z.string()).default([]) })
export const TerritorialChange = z.object({
  gains: z.array(Holder).default([]),
  losses: z.array(Holder).default([]),
  note: z.string().optional(),
})

export const Event = z.object({
  ...Common,
  year: z.number().int().nullable(), // null = год в тексте не назван
  date_precision: DatePrecision,
  date_text: z.string().optional(),
  title: z.string().min(1),
  type: z.string().min(1),
  description: z.string().optional(),
  places: z.array(z.string()).default([]), // id мест
  actors: z.array(Actor).default([]),
  territorial_change: TerritorialChange.optional(),
  campaign: z.boolean().optional(), // решено игроками за столом (только если источник так говорит)
})

export const Person = z.object({
  ...Common,
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  role: z.string().optional(),
  affiliation: z.string().optional(),
  based_in: z.string().optional(),
  years: z.string().optional(),
  notable: z.string().optional(),
  relations: z.string().optional(),
  slug: z.string().optional(),
})

export const Org = z.object({
  ...Common,
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  kind: z.string().optional(),
  hq: z.string().optional(),
  leader: z.string().optional(),
  presence: z.string().optional(),
  influence: z.string().optional(),
  slug: z.string().optional(),
})

export const Flow = z.object({
  ...Common,
  kind: z.string().min(1),
  what: z.string().min(1),
  from: z.string().optional(),
  to: z.string().optional(),
})

// История владения ячеек (data/history/owners.yaml): запись = [с_года, polity_id|null (нет сведений), confidence, sources].
export const Conf = z.enum(['canon', 'derived', 'speculative'])
// confidence=null при polity=null — «нет сведений» (источники необязательны); иначе confidence и ≥1 источник обязательны.
export const OwnerRun = z.tuple([z.number(), z.string().min(1).nullable(), Conf.nullable(), z.array(z.string().min(1))]).superRefine((r, ctx) => {
  if (r[2] === null && r[1] !== null) ctx.addIssue({ code: 'custom', message: 'у владельца нужен confidence' })
  if (r[2] !== null && !r[3].length) ctx.addIssue({ code: 'custom', message: 'нужен хотя бы один источник' })
})
export const OwnersFile = z.object({
  polities: z.record(z.string().min(1), z.object({ name: z.string().min(1), color: z.string().regex(/^#[0-9a-f]{6}$/i, 'цвет #rrggbb') })),
  cells: z.record(z.string().regex(/^cell:\d+$/), z.array(OwnerRun).min(1)),
})
export type OwnersFileT = z.infer<typeof OwnersFile>

// Ландшафт по эпохам (data/history/landscape.yaml): объект отсутствует до года absent_before.
export const LandscapeItem = z.object({
  id: z.string().min(1), name: z.string().min(1), absent_before: z.number().int(), label: z.string().min(1),
  geometry: z.array(z.string().min(1)).min(1), event: z.string().min(1).optional(),
  confidence: Conf, sources: z.array(z.string().min(1)).min(1, 'нужен хотя бы один источник'), note: z.string().optional(),
})
export const LandscapeFile = z.array(LandscapeItem)
export type LandscapeItemT = z.infer<typeof LandscapeItem>

export const schemas = {
  places: Place, events: Event, people: Person, orgs: Org, flows: Flow,
} as const
export type Kind = keyof typeof schemas
export type PlaceT = z.infer<typeof Place>
export type EventT = z.infer<typeof Event>
export type PersonT = z.infer<typeof Person>
export type OrgT = z.infer<typeof Org>

// ---- Тематические слои (data/layers.yaml и точечные файлы слоёв) ----
const Src = z.array(z.string().min(1)).min(1, 'нужен хотя бы один источник')
export const LayerDefS = z.object({
  id: z.string().min(1), group: z.string().min(1), name: z.string().min(1), control: z.string().min(1),
  priority: z.enum(['P0', 'P1', 'P2']), status: z.enum(['ready', 'planned']), data: z.string().nullable(),
  icon: z.string().optional(), color: z.string().optional(), source_note: z.string().optional(), volume: z.string().optional(),
})
export const LayersFile = z.object({ groups: z.array(z.object({ id: z.string(), name: z.string() })).min(1), layers: z.array(LayerDefS) })
const PlaceRef = z.string().nullable() // null = место в источнике не указано (уйдёт в отчёт «без координат»)
export const LayerRecords = {
  military: z.object({ id: z.string(), number: z.string(), place: PlaceRef, from: z.number().int(), to: z.number().int(), text: z.string(), sources: Src, confidence: Conf }),
  fortressDates: z.object({ place: z.string(), built: z.number().int(), built_text: z.string(), ruined: z.number().int().optional(), extra: z.boolean().optional(), sources: Src, confidence: Conf }),
  religion: z.object({ id: z.string(), name: z.string(), faith: z.string(), place: PlaceRef, xy_place: z.string().optional(), from: z.number().int().optional(), text: z.string(), sources: Src, confidence: Conf }),
  hazards: z.object({ id: z.string(), name: z.string(), threat: z.string(), place: PlaceRef, xy_place: z.string().optional(), from: z.number().int().optional(), radius_km: z.number().positive().optional(), text: z.string(), sources: Src, confidence: Conf }),
  magic: z.object({ id: z.string(), type: z.enum(['undead', 'anomaly']), name: z.string(), place: PlaceRef, xy_place: z.string().optional(), from: z.number().int().optional(), radius_km: z.number().positive().optional(), text: z.string(), sources: Src, confidence: Conf }),
  resources: z.object({ id: z.string(), resource: z.string(), kind: z.string(), place: z.string(), where_text: z.string(), note: z.string().optional(), sources: Src, confidence: Conf }),
  guildHq: z.object({ ref: z.string(), place: z.string(), match: z.enum(['exact', 'contains']), text: z.string() }),
  peopleLoc: z.object({ ref: z.string(), place: z.string(), match: z.enum(['exact', 'contains']), text: z.string() }),
  anchors: z.object({ place: z.string(), anchor: z.string(), via: z.string() }),
} as const

// ---- Площадные слои 1006 (data/areas.yaml): значение по государству, региону или списку ячеек ----
export const AREA_LAYERS = ['religion', 'language', 'currency', 'guild'] as const
export const AreaRec = z.object({
  id: z.string().min(1), layer: z.enum(AREA_LAYERS), value: z.string().min(1), scope: z.enum(['state_1006', 'region', 'cells']),
  ids: z.array(z.string().min(1)).min(1), primary: z.boolean().default(true), text: z.string().optional(),
  confidence: Conf, sources: Src,
})
const ValueSet = z.record(z.string().min(1), z.object({ color: z.string().regex(/^#[0-9a-f]{6}$/i, 'цвет #rrggbb'), angle: z.number().optional() }))
export const AreasFile = z.object({
  values: z.object({ religion: ValueSet, language: ValueSet, currency: ValueSet, guild: ValueSet }),
  areas: z.array(AreaRec).min(1),
})
export type AreaRecT = z.infer<typeof AreaRec>
export type AreasFileT = z.infer<typeof AreasFile>

// ---- Потоки и походы (data/routes.yaml; геометрия в data/geo/routes.geojson) ----
export const ROUTE_KINDS = ['trade_land', 'trade_river', 'trade_sea', 'caravan', 'slave', 'campaign'] as const
export const RouteRec = z.object({
  id: z.string().regex(/^route:[a-z_]+-\d+$/), flows: z.array(z.string().min(1)).min(1), kind: z.enum(ROUTE_KINDS), name: z.string().min(1),
  from: z.string().min(1), to: z.string().min(1), via: z.array(z.string().min(1)).optional(),
  year_from: z.number().int().nullable(), year_to: z.number().int().nullable(), what: z.string().min(1),
  geom: z.enum(['road', 'river', 'sea', 'mixed', 'straight']), confidence: Conf, sources: Src,
})
export const RoutesFile = z.array(RouteRec)
export type RouteRecT = z.infer<typeof RouteRec>
