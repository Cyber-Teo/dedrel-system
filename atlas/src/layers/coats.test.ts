import { describe, expect, it } from 'vitest'
import { polities } from '../history/polities'
import { liveCoats } from './coats'

const coat = (state: string) => ({ properties: { state } })

describe('liveCoats', () => {
  it('герб неизвестного государства остаётся', () => {
    expect(liveCoats([coat('countries/unknown/index')], 500)).toHaveLength(1)
  })

  it('герб есть только у государства, живого в этот год', () => {
    const p = polities.find((q) => q.spans.length && q.start > -1000 && q.end < 1000)!
    const c = [coat(p.id)]
    expect(liveCoats(c, p.start)).toHaveLength(1)
    expect(liveCoats(c, p.end + 1000)).toHaveLength(0)
    expect(liveCoats(c, p.start - 1000)).toHaveLength(0)
  })
})
