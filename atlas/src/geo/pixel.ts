// Пиксели карты (x слева, y сверху, 7920x5960) <-> lng/lat Web-Mercator.
// Отображение линейно в метрах меркатора: карта лежит в мировом квадрате z6 (16384 px)
// в масштабе 2 со смещением (256, 2240). Держать в синхроне с scripts/geo/tiles.py.
export const W = 7920
export const H = 5960
export const KM_PER_PX = 0.25
/** Сторона мирового квадрата z6 в пикселях тайлов. */
export const WORLD = 16384
const SCALE = 2,
  OX = 256,
  OY = 2240
const DEG = 180 / Math.PI

/** Границы зума карты: ниже -0,5 карта меньше экрана, выше 4,5 растр подложки распадается на пиксели. */
export const MIN_ZOOM = -0.5
export const MAX_ZOOM = 4.5
/** Размер мирового квадрата одного зума в MapLibre (tileSize 512 по умолчанию). */
export const MAPLIBRE_TILE = 512

export type Px = [number, number]
export type LngLat = [number, number]

export function pxToLngLat([x, y]: Px): LngLat {
  const fx = (OX + SCALE * x) / WORLD,
    fy = (OY + SCALE * y) / WORLD
  return [fx * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * fy))) * DEG]
}

export function lngLatToPx([lng, lat]: LngLat): Px {
  const fx = (lng + 180) / 360
  const s = Math.sin(lat / DEG)
  const fy = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)
  return [(fx * WORLD - OX) / SCALE, (fy * WORLD - OY) / SCALE]
}

export const distanceKm = (a: Px, b: Px) => Math.hypot(b[0] - a[0], b[1] - a[1]) * KM_PER_PX

/**
 * Экранных пикселей на один пиксель карты при зуме MapLibre z.
 * Весь мир на зуме z занимает MAPLIBRE_TILE·2^z экранных px, а в пикселях карты тот же мир — WORLD / SCALE.
 */
export const screenPerPx = (z: number) => (MAPLIBRE_TILE * 2 ** z) / (WORLD / SCALE)

/** Обратное к screenPerPx: зум MapLibre, при котором один px карты занимает spp экранных px. */
export const zoomForScreenPerPx = (spp: number) => Math.log2((spp * (WORLD / SCALE)) / MAPLIBRE_TILE)
