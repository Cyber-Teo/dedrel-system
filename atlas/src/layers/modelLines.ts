// Пути моделек: ломаные маршрутов с накопленной длиной, положение по доле пути и курс.
import { pxToLngLat, type Px } from '../geo/pixel'
import { routes } from './registry'

export type Line = {
  id: string
  kind: string
  px: Px[]
  len: number
  cum: number[]
  bb: [number, number, number, number]
}

export const lines = new globalThis.Map<string, Line>()
export const routeById = new globalThis.Map(routes.map((r) => [r.id, r]))
export const inView = (l: Line, b: { getWest(): number; getEast(): number; getSouth(): number; getNorth(): number }) =>
  l.bb[0] <= b.getEast() && l.bb[2] >= b.getWest() && l.bb[1] <= b.getNorth() && l.bb[3] >= b.getSouth()
export const posAt = (l: Line, p: number): { c: Px; dx: number; dy: number } => {
  const d = Math.max(0, Math.min(1, p)) * l.len
  let i = 1
  while (i < l.cum.length - 1 && l.cum[i] < d) i++
  const a = l.px[i - 1],
    b = l.px[i],
    seg = l.cum[i] - l.cum[i - 1] || 1,
    t = (d - l.cum[i - 1]) / seg
  return { c: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], dx: b[0] - a[0], dy: b[1] - a[1] }
}
/** Ориентация по курсу: вправо/влево — зеркало образа, наклон ограничен, чтобы корабль не шёл вверх килем. */
export function heading(dx: number, dy: number) {
  let ang = (Math.atan2(dy, dx) * 180) / Math.PI,
    flip = false
  if (Math.abs(ang) > 90) {
    flip = true
    ang = ang > 0 ? ang - 180 : ang + 180
  }
  return { flip, rot: Math.max(-28, Math.min(28, ang)) * (flip ? -1 : 1) }
}

/** Запомнить пути: длина, накопленные длины и рамка в lng/lat (для отбора по вьюпорту). */
export function registerLines(geo: { id: string; kind: string; px: Px[] }[]): void {
  for (const g of geo) {
    const cum = [0]
    for (let i = 1; i < g.px.length; i++)
      cum.push(cum[i - 1] + Math.hypot(g.px[i][0] - g.px[i - 1][0], g.px[i][1] - g.px[i - 1][1]))
    const ll = g.px.map((q) => pxToLngLat(q)),
      xs = ll.map((q) => q[0]),
      ys = ll.map((q) => q[1])
    lines.set(g.id, {
      ...g,
      len: cum[cum.length - 1],
      cum,
      bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    })
  }
}
