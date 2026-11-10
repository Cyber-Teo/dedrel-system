import { describe, expect, it } from 'vitest'
import { formatHash, withYear } from './hash'

describe('hash: единый сериализатор', () => {
  it('запятые и двоеточия не кодируются', () => {
    const h = formatHash({ center: [10, 20], zoom: 1, mode: 'drawn' }, '#l=a,b&k=x:y&y=5')
    expect(h).not.toMatch(/%2C|%3A/i)
    expect(h).toContain('l=a,b')
    expect(h).toContain('k=x:y')
    expect(withYear('#l=a,b&k=x:y', 500)).toBe('#l=a,b&k=x:y&y=500')
  })
})
