import { describe, expect, it } from 'vitest'
import { CONFIDENCE_RU, events, DEFAULT_YEAR, rangeLabel, yearLabel, yearTitle } from './events'

describe('формат года', () => {
  it('короткий год и пояснение', () => {
    expect(yearLabel(-300)).toBe('−300')
    expect(yearTitle(-300)).toBe('300 до победы над Асмодеем')
    expect(yearLabel(1006)).toBe('1006')
  })
  it('нет года 0', () => {
    expect(yearLabel(0)).toBe('1')
  })
  it('диапазоны', () => {
    expect(rangeLabel(-500, 1)).toBe('−500 – 1')
    expect(rangeLabel(818, 1006)).toBe('818 – н. в.')
  })
  it('старт 1006, тексты достоверности', () => {
    expect(DEFAULT_YEAR).toBe(1006)
    expect(CONFIDENCE_RU.canon.title).toMatch(/прямо сказано в вики/)
  })
})

describe('дубли хроники', () => {
  const near = (y: number) => events.filter((e) => Math.abs(e.year! - y) <= 5)
  it('Реформы Аны и революция 817 — по одному разу', () => {
    expect(near(817).filter((e) => /^Реформы/.test(e.title))).toHaveLength(1)
    expect(near(817).filter((e) => /революци/i.test(e.title))).toHaveLength(1)
  })
})
