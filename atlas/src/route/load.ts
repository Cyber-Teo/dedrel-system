// Превращает разобранные данные (places.yaml, roads/routes/rivers/terrain.geojson, hazards.yaml) во вход графа.
import type { Px } from '../geo/pixel'
import type { GraphInput, Pt, Terr } from './graph'

// Формат файлов проверяют схемы data/ (validate); поля геометрии и свойств читаются по месту, поэтому типы здесь свободные.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type F = { geometry: { type: string; coordinates: any }; properties: Record<string, any> }
type FC = { features: F[] }
export type RawData = {
  places: { id: string; name: string; kind?: string; symbol?: string; x?: number; y?: number }[]
  roads: FC
  routes: FC
  rivers: FC
  terrain: FC
  hazards: { name: string; threat: string; place?: string }[]
}
const TERR_NAME: Record<string, string> = { forest: 'лес', swamp: 'болото', mountains: 'горы', desert: 'пустыня' }

export type HazardPt = { name: string; threat: string; x: number; y: number; placeId?: string }
export function graphInput(d: RawData): { input: GraphInput; hazards: Map<string, string>; hazardPts: HazardPt[] } {
  const places: Pt[] = d.places
    .filter((p) => p.x !== undefined && p.y !== undefined && p.kind !== 'sea')
    .map((p) => ({ id: p.id, name: p.name, x: p.x!, y: p.y!, port: p.symbol === 'port', kind: p.kind }))
  const nodes = d.roads.features.filter((f) => f.properties.kind === 'node')
  const roadNodes = nodes.map((f) => ({
    id: f.properties.id,
    name: f.properties.name,
    x: f.geometry.coordinates[0],
    y: f.geometry.coordinates[1],
  }))
  const roads = d.roads.features
    .filter((f) => f.properties.kind === 'road')
    .map((f) => ({
      from: f.properties.from,
      to: f.properties.to,
      type: f.properties.type,
      geom: f.geometry.coordinates as Px[],
    }))
  const sea = d.routes.features
    .filter((f) => f.properties.kind === 'trade_sea')
    .map((f) => ({ id: f.properties.id, geom: f.geometry.coordinates as Px[] }))
  const rivers = d.rivers.features.map((f) => ({
    id: f.properties.id,
    name: f.properties.name,
    geom: f.geometry.coordinates as Px[],
  }))
  const terr: Terr[] = d.terrain.features.map((f) => {
    const polys = f.geometry.coordinates as Px[][][]
    const flat = polys.flat(2)
    return {
      kind: f.properties.terrain,
      name: f.properties.name ?? TERR_NAME[f.properties.terrain] ?? f.properties.terrain,
      polys,
      bbox: [
        Math.min(...flat.map((p) => p[0])),
        Math.min(...flat.map((p) => p[1])),
        Math.max(...flat.map((p) => p[0])),
        Math.max(...flat.map((p) => p[1])),
      ],
    }
  })
  const byId = new Map(d.places.map((p) => [p.id, p]))
  const hazardPts: HazardPt[] = d.hazards.flatMap((h) => {
    const p = h.place ? byId.get(h.place) : undefined
    return p && p.x !== undefined && p.y !== undefined
      ? [{ name: h.name, threat: h.threat, x: p.x, y: p.y, placeId: p.id }]
      : []
  })
  return {
    input: {
      places,
      roadNodes,
      roads,
      sea,
      rivers,
      terr,
      seas: d.places
        .filter((p) => p.kind === 'sea' && p.x !== undefined && !['Тёмный', 'открытое море', 'Океан'].includes(p.name))
        .map((p) => ({ id: p.id, name: p.name, x: p.x!, y: p.y! })),
    },
    hazards: new Map(d.hazards.map((h) => [h.name, h.threat])),
    hazardPts,
  }
}
