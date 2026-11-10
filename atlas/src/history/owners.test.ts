import { describe, expect, it } from 'vitest'
import { diffOwners, frameSuffix, listShifts, labelCell, ownerAt, ownersAt, readCmp, withCmp, type Run } from './owners'

const runs: Run[] = [
  [-200, 'a', 'derived', ['s']],
  [500, null, 'speculative', ['s']],
  [900, 'b', 'canon', ['s']],
]
describe('ownerAt', () => {
  it('последняя запись с годом ≤ выбранного', () => {
    expect(ownerAt(runs, 0).polity).toBe('a')
    expect(ownerAt(runs, 500).polity).toBeNull()
    expect(ownerAt(runs, 500).confidence).toBe('speculative')
    expect(ownerAt(runs, 1006).polity).toBe('b')
  })
  it('до первой записи — нет сведений', () => {
    expect(ownerAt(runs, -300)).toMatchObject({ polity: null, confidence: null, from: null })
    expect(ownerAt(undefined, 0).polity).toBeNull()
  })
  it('подпись — ячейка у среднего центроида', () => {
    const c = [
      { id: '1', centroid: [0, 0] as [number, number], area: 1 },
      { id: '2', centroid: [100, 0] as [number, number], area: 1 },
      { id: '3', centroid: [60, 0] as [number, number], area: 1 },
    ]
    expect(labelCell(c)?.id).toBe('3')
    expect(labelCell([])).toBeNull()
  })
  it('подпись — в крупнейшей связной части, а не между частями', () => {
    const c = (id: string, x: number, area: number) => ({ id, centroid: [x, 0] as [number, number], area })
    const cs = [c('a', 0, 10), c('b', 10, 10), c('far', 1000, 3)]
    const adj = new Map([
      ['a', new Set(['b'])],
      ['b', new Set(['a'])],
      ['far', new Set<string>()],
    ])
    expect(['a', 'b']).toContain(labelCell(cs, adj)?.id)
  })
})

describe('ownersAt: дробные кадры 1005', () => {
  const cells: Record<string, Run[]> = {
    'cell:1': [
      [995, 'rojo', 'canon', ['s']],
      [1005, 'rojo', 'canon', ['s']],
      [1005.5, 'igni', 'derived', ['s']],
      [1005.85, 'igni', 'canon', ['s']],
    ],
  }
  it('кадры внутри года', () => {
    expect(ownersAt(cells, 1005, 0).get('cell:1')).toMatchObject({ polity: 'rojo', from: 1005 })
    expect(ownersAt(cells, 1005, 0.5).get('cell:1')).toMatchObject({ polity: 'igni', confidence: 'derived' })
    expect(ownersAt(cells, 1005, 0.85).get('cell:1')).toMatchObject({ polity: 'igni', confidence: 'canon' })
    expect(ownersAt(cells, 1005).get('cell:1')?.polity).toBe('igni')
    expect(ownersAt(cells, 1004).get('cell:1')?.polity).toBe('rojo')
  })
})

describe('frameSuffix', () => {
  it('дробные кадры 1005 различимы', () => {
    expect([1005, 1005.5, 1005.85].map(frameSuffix)).toEqual(['', ' (лето)', ' (с 7 ноября)'])
  })
})

describe('сравнение двух лет', () => {
  const cells: Record<string, Run[]> = {
    c1: [
      [0, 'a', 'canon', []],
      [500, 'b', 'canon', []],
    ],
    c2: [[0, 'a', 'canon', []]],
    c3: [[300, 'a', 'canon', []]],
  }
  it('участки, сменившие владельца, группируются «от → к»', () => {
    const d = diffOwners(cells, 100, 600, (id) => id ?? 'без владельца')
    expect(d).toEqual(
      [
        { from: 'a', to: 'b', ids: ['c1'], area: 0 },
        { from: 'без владельца', to: 'a', ids: ['c3'], area: 0 },
      ].sort((p, q) => q.ids.length - p.ids.length),
    )
    expect(diffOwners(cells, 600, 600, (id) => id ?? '')).toEqual([])
  })
  it('cmp читается и пишется в хеш, чужие ключи целы', () => {
    expect(readCmp('#y=1006&cmp=573&l=politics')).toBe(573)
    expect(readCmp('#y=1006')).toBeNull()
    expect(withCmp('#y=1006&l=politics', 573)).toBe('#y=1006&l=politics&cmp=573')
    expect(withCmp('#y=1006&cmp=573', null)).toBe('#y=1006')
  })
})

describe('listShifts', () => {
  it('склеивает одинаковые пары имён, X → X уходит в счётчик, порядок по площади', () => {
    const r = listShifts([
      { from: 'A', to: 'B', ids: ['1'], area: 5 },
      { from: 'A', to: 'B', ids: ['2'], area: 5 },
      { from: 'X', to: 'X', ids: ['3', '4'], area: 99 },
      { from: 'C', to: 'D', ids: ['5'], area: 20 },
    ])
    expect(r.rows.map((t) => `${t.from}>${t.to}:${t.ids.length}`)).toEqual(['C>D:1', 'A>B:2'])
    expect(r.same).toBe(2)
  })
})
