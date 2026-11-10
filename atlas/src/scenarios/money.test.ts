import { describe, expect, it } from 'vitest'
import { PRICES, breakdown, exchange, parseAmount, toCopper } from './money'

describe('монеты: 10 меди = 1 серебро, 10 серебра = 1 золото, 10 золота = 1 платина', () => {
  it('курсы', () => {
    expect(exchange(1, 'silver', 'copper')).toBe(10)
    expect(exchange(1, 'gold', 'silver')).toBe(10)
    expect(exchange(1, 'platinum', 'gold')).toBe(10)
    expect(exchange(1, 'platinum', 'copper')).toBe(1000)
    expect(exchange(5, 'copper', 'gold')).toBeCloseTo(0.05)
  })
  it('разбор числа с запятой', () => {
    expect(parseAmount('2,5')).toBe(2.5)
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('-3')).toBeNull()
  })
  it('разложение на монеты', () => {
    expect(breakdown(toCopper(1234, 'copper'))).toEqual({ platinum: 1, gold: 2, silver: 3, copper: 4 })
    expect(breakdown(0)).toEqual({ platinum: 0, gold: 0, silver: 0, copper: 0 })
  })
  it('цены из вики', () => {
    const horse = PRICES.find((p) => p.name.startsWith('Аренда лошади'))!
    expect(horse.copper).toBe(1000)
    expect(PRICES.find((p) => p.name.includes('ездовой'))!.copper).toBe(7500)
  })
  it('разделители тысяч: «1 000», неразрывный и узкий пробел', () => {
    expect(parseAmount('1 000')).toBe(1000)
    expect(parseAmount('1\u00a0000')).toBe(1000)
    expect(parseAmount('1\u202f000,5')).toBe(1000.5)
    expect(parseAmount(' ')).toBeNull()
  })
})
