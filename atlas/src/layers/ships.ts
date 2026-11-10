// Корабли у портов: по одному кораблику у каждого порта (ставится слева-снизу от значка, на воде).
import { pxToLngLat } from '../geo/pixel'
import type { PointFeature } from '../lib/coords'
import type { PlaceRow } from './coats'

export function shipFeatures(places: PlaceRow[]): PointFeature[] {
  return places
    .filter((p) => p.kind === 'port' && p.x !== undefined && p.y !== undefined)
    .map((p) => ({
      type: 'Feature',
      properties: { icon: 'm|cog|n|-', id: p.id, kind: 'ship' },
      geometry: { type: 'Point', coordinates: pxToLngLat([p.x!, p.y!]) },
    }))
}
