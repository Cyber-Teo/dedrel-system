import { describe, expect, it } from 'vitest'
import { visibleAt, type Obj } from './build'
import { readLayerIds, withLayerIds } from './layerHash'
import { formatHash, readYear, withYear } from '../hash'

const o = (p: Partial<Obj>): Obj => ({
  key: 'k',
  layer: 'l',
  id: 'i',
  name: 'n',
  cat: 'c',
  approx: false,
  meta: [],
  sources: ['x'],
  confidence: 'canon',
  ...p,
})
describe('слои', () => {
  it('порог и окно по годам', () => {
    expect(visibleAt(o({ from: 100 }), 99, 5)).toBe(false)
    expect(visibleAt(o({ from: 100, to: 200 }), 200, 5)).toBe(false)
    expect(visibleAt(o({ from: 1005, to: 1005, soft: true }), 1000, 5)).toBe(true)
  })
  it('хеш хранит слои и переживает перемещение карты', () => {
    const h = withLayerIds('#cx=1&cy=2&z=1&m=drawn&y=500', ['legions', 'hazards'])
    expect(readLayerIds(h)).toEqual(['legions', 'hazards'])
    expect(readLayerIds(formatHash({ center: [5, 6], zoom: 2, mode: 'drawn' }, h))).toEqual(['legions', 'hazards'])
  })
  it('год y живёт в хеше рядом с центром карты и слоями', () => {
    const h = formatHash({ center: [5, 6], zoom: 2, mode: 'drawn' }, withYear('#l=legions', -300))
    expect(readYear(h)).toBe(-300)
    expect(readLayerIds(h)).toEqual(['legions'])
    expect(readYear(withYear(h, 600))).toBe(600)
    expect(readYear('#cx=1&cy=2')).toBe(null)
  })
})

describe('слои по умолчанию в хеше', () => {
  it('без l — набор по умолчанию, l=none — пусто, пустой набор пишется как l=none', () => {
    expect(readLayerIds('#cx=1&y=500')).toEqual(['world-miniatures', 'places-ranked'])
    expect(readLayerIds('#l=none&y=500')).toEqual([])
    expect(withLayerIds('#cx=1', [])).toContain('l=none')
    expect(readLayerIds(withLayerIds('#cx=1&l=legions', []))).toEqual([])
  })
  it('история без обычных слоёв не стирает набор по умолчанию', async () => {
    const { withHistoryLayers } = await import('./layerHash')
    const h = withHistoryLayers('#cx=1', { politics: true, landscape: false })
    expect(h).toContain('l=world-miniatures,places-ranked,politics')
  })
})

describe('слои истории в хеше', () => {
  it('politics/landscape в l, LayersUI их не затирает', async () => {
    const { withHistoryLayers, readHistoryLayers } = await import('./layerHash')
    const h = withHistoryLayers('#cx=1&y=700&l=legions', { politics: true, landscape: true })
    expect(h).toContain('l=legions,politics,landscape')
    expect(readHistoryLayers(h)).toEqual({ politics: true, landscape: true })
    expect(readLayerIds(h)).toEqual(['legions'])
    expect(readHistoryLayers(withLayerIds(h, ['hazards']))).toEqual({ politics: true, landscape: true })
    expect(readLayerIds(withHistoryLayers(h, { politics: false, landscape: false }))).toEqual(['legions'])
  })
})
