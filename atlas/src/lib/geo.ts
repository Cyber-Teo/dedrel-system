// Расстояния в пикселях карты и перевод в километры.
import { KM_PER_PX, type Px } from '../geo/pixel'

export { KM_PER_PX }

type XY = { x: number; y: number }

/** Расстояние между двумя точками {x, y} в пикселях карты. */
export const distPx = (a: XY, b: XY): number => Math.hypot(a.x - b.x, a.y - b.y)

/** Расстояние между двумя точками {x, y} в километрах. */
export const distKm = (a: XY, b: XY): number => distPx(a, b) * KM_PER_PX

/** Длина ломаной в пикселях карты. */
export function pathLenPx(path: Px[]): number {
  let len = 0
  for (let i = 1; i < path.length; i++) len += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])
  return len
}
