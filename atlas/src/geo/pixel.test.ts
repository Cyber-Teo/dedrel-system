import { describe, expect, it } from 'vitest'
import { MAPLIBRE_TILE, WORLD, distanceKm, lngLatToPx, pxToLngLat, screenPerPx } from './pixel'

describe('пиксельная проекция', () => {
  it('px -> lnglat -> px возвращает исходную точку', () => {
    for (const p of [
      [0, 0],
      [7920, 5960],
      [5791, 1965],
      [3960, 2980],
    ] as const) {
      const q = lngLatToPx(pxToLngLat([...p]))
      expect(q[0]).toBeCloseTo(p[0], 6)
      expect(q[1]).toBeCloseTo(p[1], 6)
    }
  })
  it('долгота линейна по x: равные шаги px дают равные шаги градусов', () => {
    const d1 = pxToLngLat([400, 100])[0] - pxToLngLat([0, 100])[0]
    const d2 = pxToLngLat([7920, 100])[0] - pxToLngLat([7520, 100])[0]
    expect(d1).toBeCloseTo(d2, 9)
  })
  it('400 px = 100 км', () => {
    expect(distanceKm([100, 100], [500, 100])).toBeCloseTo(100, 9)
    expect(distanceKm([0, 0], [300, 400])).toBeCloseTo(125, 9)
  })
  it('screenPerPx: на зуме 0 мир занимает 512 экранных px, на каждый зум вдвое больше', () => {
    expect(screenPerPx(0)).toBeCloseTo(MAPLIBRE_TILE / (WORLD / 2), 12)
    expect(screenPerPx(3) / screenPerPx(2)).toBeCloseTo(2, 12)
    expect(screenPerPx(0) * (WORLD / 2)).toBeCloseTo(512, 9)
  })
})
