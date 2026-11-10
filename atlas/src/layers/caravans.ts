// Караваны на трактах: по одному на путь, в его середине; в кадре показываются только ближайшие к центру.
import type { Map } from 'maplibre-gl'
import { pxToLngLat } from '../geo/pixel'
import type { PointFeature } from '../lib/coords'
import { lines, posAt } from './modelLines'

/** Не больше стольких караванов в кадре: иначе пустыню и тракты усеивают одинаковые верблюды. */
const CARAVAN_MAX_IN_VIEW = 4
/** Путь короче этого (px карты) караван не получает. */
const CARAVAN_MIN_LEN_PX = 200
/** Торговые сухопутные пути (не «caravan») получают караван, только если длиннее этого (px карты). */
const TRADE_LAND_MIN_LEN_PX = 700

/** Точки караванов: путь «caravan» либо длинный сухопутный торговый (routes.json). */
export function caravanFeatures(): PointFeature[] {
  const out: PointFeature[] = []
  for (const [id, l] of lines) {
    const fits = l.kind === 'caravan' || (l.kind === 'trade_land' && l.len > TRADE_LAND_MIN_LEN_PX)
    if (!fits || l.len <= CARAVAN_MIN_LEN_PX) continue
    out.push({
      type: 'Feature',
      properties: { icon: 'm|caravan|n|-', id, kind: 'caravan' },
      geometry: { type: 'Point', coordinates: pxToLngLat(posAt(l, 0.5).c) },
    })
  }
  return out
}

/** Фильтр слоя: корабли всегда, из караванов — ближайшие к центру карты из попавших в кадр. Обновляется на moveend. */
export function limitCaravans(map: Map, caravans: PointFeature[]): void {
  const limit = () => {
    if (!map.getLayer('models-place')) return
    const b = map.getBounds(),
      c = map.getCenter()
    const d = (f: PointFeature) => Math.hypot(f.geometry.coordinates[0] - c.lng, f.geometry.coordinates[1] - c.lat)
    const ids = caravans
      .filter((f) => b.contains(f.geometry.coordinates as [number, number]))
      .sort((p, q) => d(p) - d(q))
      .slice(0, CARAVAN_MAX_IN_VIEW)
      .map((f) => f.properties.id)
    map.setFilter('models-place', ['any', ['!=', ['get', 'kind'], 'caravan'], ['in', ['get', 'id'], ['literal', ids]]])
  }
  map.on('moveend', limit)
  limit()
}
