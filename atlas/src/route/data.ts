// Загрузка данных маршрута в браузере (vite ?raw/?url) и ленивая сборка графа.
import { loadData, loadGeo } from '../data/load'
import roadsUrl from '../../data/geo/roads.geojson?url'
import routesUrl from '../../data/geo/routes.geojson?url'
import riversUrl from '../../data/geo/rivers.geojson?url'
import terrainUrl from '../../data/geo/terrain.geojson?url'
import { buildGraph, type Graph } from './graph'
import { graphInput, type HazardPt, type RawData } from './load'

let cached: Promise<{ g: Graph; hazards: Map<string, string>; hazardPts: HazardPt[] }> | null = null
export function loadRouteGraph() {
  return (cached ??= (async () => {
    const geo = (u: string) => loadGeo<RawData['roads']>(u)
    const [roads, routes, rivers, terrain, places, hazards0] = await Promise.all([
      geo(roadsUrl),
      geo(routesUrl),
      geo(riversUrl),
      geo(terrainUrl),
      loadData<RawData['places']>('places'),
      loadData<RawData['hazards']>('hazards'),
    ])
    const { input, hazards, hazardPts } = graphInput({ places, hazards: hazards0, roads, routes, rivers, terrain })
    return { g: buildGraph(input), hazards, hazardPts }
  })())
}
