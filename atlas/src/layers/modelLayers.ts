// Источники и слои моделек: пути, походы, миниатюры мира (с кластерами при мелком зуме).
import type { ExpressionSpecification, Map } from 'maplibre-gl'
import { EMPTY_FC } from '../lib/coords'

type Point = { type: 'Point'; coordinates: number[] }

/** Миниатюры ближе этого расстояния (px экрана) на малом зуме собираются в кластер с числом. */
const MINI_CLUSTER_RADIUS = 40
/** Кластеры миниатюр работают только до этого зума. */
const MINI_CLUSTER_MAX_ZOOM = 2

export function addModelLayers(map: Map, before?: string): void {
  for (const id of ['models-route', 'models-camp', 'models-camp-end'])
    map.addSource(id, { type: 'geojson', data: EMPTY_FC })
  // миниатюры мира: на z<3 близкие собираются в кластер с числом (клик приближает)
  map.addSource('models-mini', {
    type: 'geojson',
    data: EMPTY_FC,
    cluster: true,
    clusterRadius: MINI_CLUSTER_RADIUS,
    clusterMaxZoom: MINI_CLUSTER_MAX_ZOOM,
  })
  const size: ExpressionSpecification = [
    'interpolate',
    ['linear'],
    ['zoom'],
    1,
    0.5,
    2.5,
    0.66,
    3,
    0.78,
    5,
    0.95,
    8,
    1.15,
  ]
  const common = {
    'icon-allow-overlap': false,
    'icon-ignore-placement': true,
    'icon-rotation-alignment': 'viewport',
    'icon-anchor': 'center',
  } as const
  map.addLayer(
    {
      id: 'models-route',
      type: 'symbol',
      source: 'models-route',
      layout: {
        ...common,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-image': ['get', 'icon'],
        'icon-size': size,
        'icon-rotate': ['get', 'rot'],
        'icon-padding': 12,
        'symbol-sort-key': ['get', 'sort'],
      },
    },
    before,
  )
  map.addLayer(
    {
      id: 'models-camp',
      type: 'symbol',
      source: 'models-camp',
      layout: {
        ...common,
        'icon-allow-overlap': true,
        'icon-image': ['get', 'icon'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 1, 0.85, 3, 1.0, 5, 1.15, 8, 1.35],
        'icon-rotate': ['get', 'rot'],
      },
    },
    before,
  )
  map.addLayer(
    {
      id: 'models-camp-end',
      type: 'symbol',
      source: 'models-camp-end',
      layout: {
        ...common,
        'icon-allow-overlap': true,
        'icon-image': 'camp-end',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 1, 0.5, 5, 0.7, 8, 0.9],
      },
    },
    before,
  )
  map.addLayer(
    {
      id: 'models-mini',
      type: 'symbol',
      source: 'models-mini',
      filter: [
        'step',
        ['zoom'],
        ['all', ['!', ['has', 'point_count']], ['<=', ['coalesce', ['get', 'mz'], 0], 0]],
        4,
        ['all', ['!', ['has', 'point_count']], ['<', ['coalesce', ['get', 'mz'], 0], 99]],
      ],
      layout: {
        ...common,
        'icon-allow-overlap': true,
        'icon-image': ['get', 'icon'],
        'icon-offset': ['coalesce', ['get', 'off'], ['literal', [0, 0]]],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 1, 0.7, 3, 1.0, 5, 1.35, 8, 1.8],
      },
    },
    before,
  )
  map.addLayer(
    {
      id: 'models-mini-cl',
      type: 'symbol',
      source: 'models-mini',
      filter: ['has', 'point_count'],
      layout: {
        ...common,
        'icon-allow-overlap': true,
        'icon-image': ['concat', 'tc-', ['to-string', ['get', 'point_count']]],
        'icon-offset': [13, -15],
        'icon-size': 0.9,
      },
    },
    before,
  )
  map.on('click', 'models-mini-cl', (e) => {
    const f = e.features?.[0]
    if (f)
      map.easeTo({
        center: (f.geometry as Point).coordinates as [number, number],
        zoom: Math.max(map.getZoom() + 1.4, 3.1),
        duration: 450,
      })
  })
  map.on('mouseenter', 'models-mini-cl', () => (map.getCanvas().style.cursor = 'pointer'))
  map.on('mouseleave', 'models-mini-cl', () => (map.getCanvas().style.cursor = ''))
}
