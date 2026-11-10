import { describe, expect, it } from 'vitest'
import {
  dateLine,
  monthDated,
  personEvents,
  personRelations,
  placeChronicle,
  scenarioOf,
  titleNoDate,
} from './chronicle'
import { events } from '../events'
import { index, personBy } from './data'
import { searchGroups } from './rank'

const ILL = 'countries/illior_empire/cities/city_illior'
describe('хроника места', () => {
  const c = placeChronicle(ILL)
  it('Иллиор: 817 (революция) и 1005 (чума) среди главных, 5 строк', () => {
    expect(c.top).toHaveLength(5)
    expect(c.top.some((e) => e.year === 817 && /революц/i.test(e.title))).toBe(true)
    expect(c.top.some((e) => e.year === 1005 && /чум/i.test(e.title))).toBe(true)
    expect(c.all.length).toBeGreaterThan(5)
  })
})
describe('человек', () => {
  it('Малдред: связь-ссылка и событие 206', () => {
    const p = personBy.get('person:maldred_avgust_tarkviniy')!
    expect(personRelations(p.id).length).toBeGreaterThan(0)
    expect(personEvents(p).some((e) => e.year === 206)).toBe(true)
  })
})
describe('событие', () => {
  it('сценарий у революции 817', () => {
    const e = events.find((x) => x.year === 817 && x.title === 'Иллиорская революция')!
    expect(scenarioOf(e)?.id).toBe('revolution-817')
  })
  it('дата без повтора года и префикс заголовка', () => {
    expect(dateLine({ year: 1005, date_text: 'май 1005 г.' })).toBe('Май 1005 г.')
    expect(dateLine({ year: 1005, date_text: '1005' })).toBe('1005 г.')
    expect(monthDated({ year: 1005, date_text: 'август 1005' })).toBe(true)
    expect(titleNoDate('Август 1005: Договор о мире', 1005)).toBe('Договор о мире')
    expect(titleNoDate('Договор', 1005)).toBe('Договор')
  })
})
describe('поиск без дублей', () => {
  it('«Иллиорская коллегия бардов» один раз', () => {
    const n = searchGroups(index, 'Иллиор')
      .flatMap((g) => g.hits)
      .filter((h) => h.entry.name === 'Иллиорская коллегия бардов').length
    expect(n).toBe(1)
  })
})
