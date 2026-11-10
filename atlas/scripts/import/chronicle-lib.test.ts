import { describe, expect, it } from 'vitest'
import { cluster, precisionOf, titleSimilar, isRumorEvent, polityName, polityId } from './chronicle-lib'

describe('склейка хроники', () => {
  it('склеивает вариации названия в один год', () => {
    const g = cluster([
      { year: 206, date_precision: 'year', title: 'Основание Иллиорской империи', sources: ['a'], places: [] },
      { year: 206, date_precision: 'year', title: 'Создание Иллиорской империи', sources: ['b'], places: [] },
      { year: 206, date_precision: 'year', title: 'Энфорис отказывается войти в империю', sources: ['c'], places: [] },
    ])
    expect(g.map((x) => x.length).sort()).toEqual([1, 2])
  })
  it('не склеивает разные месяцы и разные годы', () => {
    expect(titleSimilar('Май 1005: бои за Вестхельд', 'Июнь 1005: падение Вестхельда')).toBe(false)
    const g = cluster([
      { year: 280, date_precision: 'year', title: 'Набеги на Ринар', sources: [], places: [] },
      { year: 294, date_precision: 'year', title: 'Набеги на Ринар', sources: [], places: [] },
    ])
    expect(g.length).toBe(2)
  })
  it('точность даты и слухи', () => {
    expect(precisionOf('7 ноября 1005', 1005)).toBe('day')
    expect(precisionOf('октябрь—ноябрь 1005', 1005)).toBe('month')
    expect(precisionOf('320-е гг.', 320)).toBe('decade')
    expect(precisionOf('≈−1700', -1700)).toBe('approx')
    expect(precisionOf('277–279 гг., префектура — декабрь 279', 277)).toBe('year')
    expect(isRumorEvent({ title: 'Слухи о Некроманте' })).toBe(true)
    expect(isRumorEvent({ title: 'Рождение Авла (по слухам, зелье)' })).toBe(false)
  })
})

describe('алиасы государств', () => {
  it('Ройо = Королевство Ройо, Империя = Иллиорская империя', () => {
    expect(polityName('Ройо')).toBe('Королевство Ройо')
    expect(polityName('империя')).toBe('Иллиорская империя')
    expect(polityName('Гросса')).toBe('Королевство Гросс')
    expect(polityId('Королевство Ройо')).toBe('countries/rojo/index')
    expect(polityName('Данир')).toBe('Данир')
  })
})
