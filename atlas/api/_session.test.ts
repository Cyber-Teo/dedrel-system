import { describe, expect, it } from 'vitest'
import { makeLimiter, readCookie, safeEqual, signToken, verifyToken } from './_session'

const S = 'secret-a',
  T = 1_700_000_000_000
describe('сессия мастера', () => {
  it('подписанный токен проходит', () => expect(verifyToken(signToken(S, T), S, T + 1000)).toBe(true))
  it('чужой секрет не проходит', () => expect(verifyToken(signToken(S, T), 'secret-b', T)).toBe(false))
  it('подмена exp ломает подпись', () => {
    const [a, , c] = signToken(S, T).split('.')
    expect(verifyToken(`${a}.9999999999.${c}`, S, T)).toBe(false)
  })
  it('просроченный токен не проходит', () => expect(verifyToken(signToken(S, T, 60), S, T + 61_000)).toBe(false))
  it('мусор и пустое не проходят', () => {
    for (const t of [null, '', 'x', 'm1.1.2.3', 'm1.abc.def']) expect(verifyToken(t, S, T)).toBe(false)
  })
  it('пустой секрет не проходит', () => expect(verifyToken(signToken('', T), '', T)).toBe(false))
  it('safeEqual', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('a', 'abc')).toBe(false)
  })
  it('readCookie', () => expect(readCookie('a=1; dedrel_master=tok.en; b=2')).toBe('tok.en'))
  it('лимит: 10 неверных за минуту, потом блок, окно сдвигается', () => {
    const l = makeLimiter(10, 60_000)
    for (let i = 0; i < 10; i++) {
      expect(l.blocked('ip', T)).toBe(false)
      l.fail('ip', T)
    }
    expect(l.blocked('ip', T + 1000)).toBe(true)
    expect(l.blocked('ip', T + 61_000)).toBe(false)
  })
})
