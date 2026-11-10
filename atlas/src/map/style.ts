// Стиль карты: подложка-растр и три служебных слоя (события, измерение).
import type { StyleSpecification } from 'maplibre-gl'
import { H, W, pxToLngLat } from '../geo/pixel'
import { TILE_MAX_ZOOM, TILE_SIZE, tileUrls } from '../geo/tiles'
import type { Mode } from '../hash'
import { EVENT_COLOR, MAP_BG, MASTER_COLOR, POINT_STROKE, SEL_COLOR } from '../theme'

const EVENT_RADIUS = 8
const MEASURE_RADIUS = 5
const MEASURE_WIDTH = 3

const emptyFc = () => ({ type: 'FeatureCollection' as const, features: [] })

export function buildStyle(mode: Mode): StyleSpecification {
  const [west, north] = pxToLngLat([0, 0])
  const [east, south] = pxToLngLat([W, H])
  return {
    version: 8,
    projection: { type: 'mercator' },
    sources: {
      base: {
        type: 'raster',
        tiles: tileUrls(mode),
        tileSize: TILE_SIZE,
        maxzoom: TILE_MAX_ZOOM,
        bounds: [west, south, east, north],
      },
      measure: { type: 'geojson', data: emptyFc() },
      events: { type: 'geojson', data: emptyFc() },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': MAP_BG } },
      { id: 'base', type: 'raster', source: 'base' },
      {
        id: 'events-pts',
        type: 'circle',
        source: 'events',
        paint: {
          'circle-radius': EVENT_RADIUS,
          'circle-color': ['case', ['get', 'sel'], SEL_COLOR, ['get', 'master'], MASTER_COLOR, EVENT_COLOR],
          'circle-stroke-color': POINT_STROKE,
          'circle-stroke-width': 2,
          'circle-opacity': 0.9,
        },
      },
      {
        id: 'measure-line',
        type: 'line',
        source: 'measure',
        paint: { 'line-color': SEL_COLOR, 'line-width': MEASURE_WIDTH },
      },
      {
        id: 'measure-pts',
        type: 'circle',
        source: 'measure',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': MEASURE_RADIUS,
          'circle-color': POINT_STROKE,
          'circle-stroke-color': SEL_COLOR,
          'circle-stroke-width': 2,
        },
      },
    ],
  }
}
