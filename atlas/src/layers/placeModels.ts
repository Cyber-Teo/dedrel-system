// Модельки по типу места и гербы столиц: отдельный подслой, включается вместе со слоем «Места по рангу».
import type { GeoJSONSource, Map } from 'maplibre-gl'
import { loadData } from '../data/load'
import { readYear } from '../hash'
import { EMPTY_FC } from '../lib/coords'
import { emit, on } from '../lib/bus'
import { error } from '../lib/log'
import { caravanFeatures, limitCaravans } from './caravans'
import { buildCoats, type Capital, type PlaceRow } from './coats'
import { loadSvg, onPlacesFlag } from './icons'
import { ensureModelImg } from './modelImage'
import { shipFeatures } from './ships'

export function installPlaceModels(map: Map, before?: string): void {
  const vis = { visibility: 'none' as const }
  map.addSource('models-place', { type: 'geojson', data: EMPTY_FC })
  map.addSource('capital-coats', { type: 'geojson', data: EMPTY_FC })
  const anchorBefore = map.getLayer('thematic-icons') ? undefined : before
  map.addLayer(
    {
      id: 'models-place',
      type: 'symbol',
      source: 'models-place',
      minzoom: 3,
      layout: {
        ...vis,
        'icon-image': ['get', 'icon'],
        'icon-anchor': 'top-right',
        'icon-offset': [-4, 3],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-rotation-alignment': 'viewport',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.75, 5, 0.95, 8, 1.2],
      },
    },
    anchorBefore,
  )
  map.addLayer({
    id: 'capital-coats',
    type: 'symbol',
    source: 'capital-coats',
    minzoom: 0.9,
    layout: {
      ...vis,
      'icon-image': ['get', 'icon'],
      'icon-anchor': 'center',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 0.9, 0.8, 1.5, 0.85, 3, 0.95, 6, 1.1],
    },
  }) // выше значков слоя
  map.on('click', 'capital-coats', (e) => {
    const id = e.features?.[0]?.properties?.state
    if (id) emit('dossier', { t: 'polity', id })
  })
  map.on('mouseenter', 'capital-coats', () => (map.getCanvas().style.cursor = 'pointer'))
  map.on('mouseleave', 'capital-coats', () => (map.getCanvas().style.cursor = ''))

  map.on('click', 'capital-coats', (e) => {
    const id = e.features?.[0]?.properties?.state
    if (id) emit('dossier', { t: 'polity', id })
  })
  map.on('mouseenter', 'capital-coats', () => (map.getCanvas().style.cursor = 'pointer'))
  map.on('mouseleave', 'capital-coats', () => (map.getCanvas().style.cursor = ''))

  let year = readYear(location.hash) ?? 1
  let showCoats = (_y: number) => {}
  // год: из события ядра (detail), а если его нет, из хеша; без года оставляем прежний
  const setYear = (y?: number) => {
    year = y ?? readYear(location.hash) ?? year
    showCoats(year)
  }
  on('year', (y) => setYear(typeof y === 'number' ? y : undefined))
  addEventListener('hashchange', () => setYear())

  let building: Promise<void> | null = null
  const build = () =>
    (building ??= (async () => {
      const [places, caps, owners] = await Promise.all([
        loadData<PlaceRow[]>('places'),
        loadData<Capital[]>('capitals'),
        loadData<Parameters<typeof buildCoats>[3]>('history/owners'),
      ])
      showCoats = await buildCoats(map, new globalThis.Map(places.map((p) => [p.id, p])), caps, owners)
      showCoats(year)
      // корабли у портов и караваны на трактах
      await Promise.all([loadSvg('cog'), loadSvg('caravan')])
      const caravans = caravanFeatures()
      const feats = [...shipFeatures(places), ...caravans]
      for (const f of feats) ensureModelImg(map, f.properties.icon as string)
      ;(map.getSource('models-place') as GeoJSONSource | undefined)?.setData({ ...EMPTY_FC, features: feats } as never)
      limitCaravans(map, caravans)
    })().catch((e) => {
      building = null
      error('модельки мест', e)
    }))
  onPlacesFlag((shown) => {
    for (const id of ['models-place', 'capital-coats'])
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', shown ? 'visible' : 'none')
    if (shown) build()
  })
}
