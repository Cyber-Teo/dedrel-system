import { describe, expect, it } from 'vitest'
import { resolveCell, summary } from './areaData'
import { parseAreas } from './areaParse'

const f = parseAreas(`
values: {religion: {A: {color: '#aaaaaa'}, B: {color: '#bbbbbb'}}, language: {}, currency: {}, guild: {G: {color: '#111111', angle: 45}, H: {color: '#222222', angle: 0}}}
areas:
  - {id: a1, layer: religion, value: A, scope: state_1006, ids: [s1], confidence: canon, sources: [x]}
  - {id: a2, layer: religion, value: B, scope: state_1006, ids: [s1], primary: false, confidence: canon, sources: [x]}
  - {id: a3, layer: religion, value: B, scope: region, ids: [r1], confidence: derived, sources: [x]}
  - {id: g1, layer: guild, value: G, scope: state_1006, ids: [s1], confidence: canon, sources: [x]}
  - {id: g2, layer: guild, value: H, scope: cells, ids: ['cell:2'], confidence: canon, sources: [x]}
`)
const c = (id: string, region: string | null = null) => ({ id, name: id, state_1006: 's1', region })
describe('площадные слои', () => {
  it('регион перекрывает государство, прочие значения идут в карточку', () => {
    expect(resolveCell(f, 'religion', c('cell:1')).main?.value).toBe('A')
    expect(resolveCell(f, 'religion', c('cell:1')).others.map((o) => o.value)).toEqual(['B'])
    expect(resolveCell(f, 'religion', c('cell:1', 'r1')).main?.value).toBe('B')
  })
  it('гильдии накладываются', () => {
    expect(
      resolveCell(f, 'guild', c('cell:2'))
        .guilds.map((g) => g.value)
        .sort(),
    ).toEqual(['G', 'H'])
    const s = summary(f, 'guild', [c('cell:1'), c('cell:2')])
    expect(s).toMatchObject({ records: 2, filled: 2 })
    expect(s.legend[0]).toEqual({ value: 'G', n: 2 })
  })
})
