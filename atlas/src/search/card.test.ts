import { describe, expect, it } from 'vitest'
import { normKey, placeFields } from './card'

describe('placeFields', () => {
  const f = placeFields(
    'равнина',
    'описание | Мэр Иван; мэр иван | столица империи | Дворец со шпилем; Дворец со шпилем (залил город) | здесь 26 таверн, 4 борделя',
    [],
    'Столица империи',
  )
  const all = [...f.shown, ...f.more].flatMap((s) => s.items.map((i) => i.text))
  it('дедуплицирует без учёта регистра и префиксы', () => {
    expect(all.filter((t) => normKey(t) === 'мэр иван')).toHaveLength(1)
    expect(all.filter((t) => t.startsWith('Дворец со шпилем'))).toHaveLength(1)
    expect(all.some((t) => normKey(t) === 'столица империи')).toBe(false)
  })
  it('числа уходят в плашки', () => {
    expect(f.plaques).toEqual(['26 таверн', '4 борделя'])
  })
})

describe('темы «Показать ещё»', () => {
  const f = placeFields(
    'равнина',
    'описание | Мэр Иван | Дворец Основателя со шпилем (залил город при чуме 1005), сенат, городская управа | богатых купцов нет; портал в Нижний мир | Императорская арена, столичный театр | революция 817 г.',
    [],
    'город',
  )
  const titles = [...f.shown, ...f.more].map((s) => s.title),
    where = (t: string) => [...f.more].find((s) => s.items.some((i) => i.text.includes(t)))?.title
  it('«Власть» один заголовок', () => {
    expect(titles.filter((t) => t === 'Власть')).toHaveLength(1)
  })
  it('здания — в «Места и здания»', () => {
    expect(where('Дворец')).toBe('Места и здания')
    expect(where('арена')).toBe('Места и здания')
    expect(where('театр')).toBe('Места и здания')
  })
  it('сенат уходит во власть', () => {
    expect(where('сенат')).toBe('Органы власти')
  })
  it('«богатых» не культ, «портал» не торговля', () => {
    expect(where('богатых')).not.toBe('Культ и религия')
    expect(where('портал')).not.toBe('Гильдии и торговля')
  })
  it('год с «г.» — история', () => {
    expect(where('революция')).toBe('История')
  })
})

import { cleanNote } from './clean'
describe('служебные координаты', () => {
  it('«маркер lat=…, long=…» не попадает в текст', () => {
    expect(cleanNote('маркер lat=4388.0, long=6416.2').text).toBe('')
    expect(cleanNote('юг города; маркер lat=1.5, long=2.5').text).toBe('юг города')
  })
})
