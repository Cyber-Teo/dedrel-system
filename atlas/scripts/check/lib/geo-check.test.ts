import { describe, expect, it } from 'vitest'
import { inMulti, inPolygon, checkCapitals, type Poly } from './geo-check'

const sq: Poly = [
  [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ],
]
const holed: Poly = [
  sq[0],
  [
    [4, 4],
    [6, 4],
    [6, 6],
    [4, 6],
    [4, 4],
  ],
]
describe('point-in-polygon', () => {
  it('внутри/снаружи/граница/дыра', () => {
    expect(inPolygon([5, 5], sq)).toBe(true)
    expect(inPolygon([11, 5], sq)).toBe(false)
    expect(inPolygon([10, 5], sq)).toBe(true)
    expect(inPolygon([5, 5], holed)).toBe(false)
    expect(inPolygon([2, 2], holed)).toBe(true)
  })
  it('мультиполигон и столица вне страны', () => {
    expect(
      inMulti(
        [25, 5],
        [
          sq,
          [
            [
              [20, 0],
              [30, 0],
              [30, 10],
              [20, 10],
              [20, 0],
            ],
          ],
        ],
      ),
    ).toBe(true)
    const states = new Map([['s', [sq]]])
    expect(checkCapitals([{ place: 'p', state: 's', at: [5, 5], why: 't' }], states, 'f')).toEqual([])
    expect(checkCapitals([{ place: 'p', state: 's', at: [50, 5], why: 't' }], states, 'f')).toHaveLength(1)
  })
})
