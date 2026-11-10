// Общая загрузка data/geo/cells.geojson: качается и разбирается один раз на сессию.
import cellsUrl from '../../data/geo/cells.geojson?url'
import { loadGeo } from '../data/load'

type Ring = [number, number][]
export type CellGeometry = { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] }
export type CellsFc = {
  type: 'FeatureCollection'
  features: {
    type: 'Feature'
    properties: { id: string; name: string; centroid: [number, number]; area_km2: number }
    geometry: CellGeometry
  }[]
}
let p: Promise<CellsFc> | undefined
export const loadCellsFc = (): Promise<CellsFc> => (p ??= loadGeo<CellsFc>(cellsUrl))
