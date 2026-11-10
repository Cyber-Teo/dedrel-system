import { describe, expect, it } from 'vitest'
import { checkCells } from './cells-check'
import type { Poly } from './geo-check'

const sq = (x0: number, y0: number, x1: number, y1: number): Poly => [
  [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ],
]
describe('checkCells', () => {
  const land = [sq(0, 0, 160, 80)],
    states = new Map([['s', [sq(0, 0, 160, 80)]]])
  it('покрытие без пересечений проходит', () => {
    const cells = new Map([
      ['cell:1', { polys: [sq(0, 0, 80, 80)], state: 's' }],
      ['cell:2', { polys: [sq(80, 0, 160, 80)], state: 's' }],
    ])
    expect(checkCells(cells, land, states, 160, 80).errors).toEqual([])
  })
  it('дыра и пересечение дают ошибки', () => {
    const hole = new Map([['cell:1', { polys: [sq(0, 0, 80, 80)], state: 's' }]])
    expect(checkCells(hole, land, states, 160, 80).errors.join()).toMatch(/покрытие/)
    const over = new Map([
      ['cell:1', { polys: [sq(0, 0, 160, 80)], state: 's' }],
      ['cell:2', { polys: [sq(0, 0, 160, 80)], state: 's' }],
    ])
    expect(checkCells(over, land, states, 160, 80).errors.join()).toMatch(/пересечения/)
  })
})
