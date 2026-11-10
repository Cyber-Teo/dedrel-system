// Годы государств в поиске = годы в «Списки → Государства» (history/polities); начало не больше конца; дубли имён сведены.
import { describe, expect, it } from 'vitest'
import { index, listSpan, mergedPolities, polityLife } from './data'
import { searchGroups } from './rank'
import { rulerSpan } from './polity'
import { personKind } from './cards'

const pol = index.filter((e) => e.group === 'polity')
describe('годы государств в поиске', () => {
  it('Иллиорская империя — с 206', () => {
    expect(pol.find((e) => e.name.startsWith('Иллиорская империя'))!.sub).toBe('государство, 206–н. в.')
  })
  it('начало не позже конца ни у одной строки', () => {
    for (const e of pol) {
      const m = /(-?\d+)–(-?\d+)/.exec(e.sub.replace(/−/g, '-'))
      if (m) expect(Number(m[1]), e.name).toBeLessThanOrEqual(Number(m[2]))
    }
  })
  it('Игни — с 140 (Государство Игни сложилось в 135–140 годах)', () => {
    expect(pol.find((e) => e.name === 'Княжество Игни')!.sub).toBe('государство, 140–н. в.')
  })
  it('«Асмодей» — одна запись человека, подпись «Демон»', () => {
    const a = index.filter((e) => e.group === 'person' && /Асмодей/.test(e.name))
    expect(a.map((e) => e.name)).toEqual(['Асмодей'])
    expect(personKind({ role: 'последний архидемон' })).toBe('Демон')
  })
  it('«Арност» — одна строка с 672 г.', () => {
    const a = pol.filter((e) => /Арност/.test(e.name))
    expect(a.length).toBe(1)
    expect(a[0].sub).toBe('государство, 672–н. в.')
  })
  it('список государств и поиск: годы одни и те же у каждого государства', () => {
    for (const g of mergedPolities) {
      const l = polityLife(g.id)!
      expect(l.from, g.name).toBe(Math.round(g.start))
      expect(l.to, g.name).toBe(g.open ? null : Math.round(g.end))
      const row = pol.find((e) => e.id === g.id)
      expect(row, g.name).toBeTruthy()
      if (l.to === null || l.from <= l.to)
        expect(row!.sub.replace(/−/g, '-'), g.name).toContain(`${l.from}–${l.to ?? 'н. в.'}`)
    }
  })
  it('список: одно имя — одна строка, Префектура с 672, разрыв Гросса', () => {
    expect(new Set(mergedPolities.map((g) => g.name)).size).toBe(mergedPolities.length)
    const text = (re: RegExp) => listSpan(mergedPolities.find((g) => re.test(g.name))!)
    expect(text(/Префектура мертвецов/)).toBe('672 — н. в.')
    expect(text(/Игни/)).toMatch(/ — н\. в\.$/)
    expect(text(/Гросс/)).toBe('151–206, с 573')
  })
})

describe('порядок выдачи', () => {
  const rows = (q: string) => searchGroups(index, q).flatMap((g) => g.hits.map((h) => h.entry))
  it('«Арност»: сначала государство, потом антагонист; одна строка префектуры', () => {
    const r = rows('Арност')
    expect(r[0].group).toBe('polity')
    expect(r.filter((e) => /Префектура мертвецов/.test(e.name)).length).toBe(1)
    expect(r.findIndex((e) => e.id === 'person:nekromant')).toBeGreaterThan(0)
  })
  it('«Малдред»: императоры по началу правления, подпись без повтора слова', () => {
    const r = rows('Малдред').filter((e) => e.group === 'person' && /^(Гней|Маний|Лукас|Авл|Йорик) /.test(e.name))
    expect(r.map((e) => e.name.split(' ')[0])).toEqual(['Гней', 'Маний', 'Лукас', 'Авл', 'Йорик'])
    expect(r[4].sub).toBe('император, 985 — н. в.')
  })
  it('«Иллиор»: строки «Иллиорская империя · столица» нет', () => {
    expect(rows('Иллиор').filter((e) => e.group === 'place' && e.name === 'Иллиорская империя')).toEqual([])
  })
})

describe('срок правителя простым текстом', () => {
  it('без «?», «наст.» и «с —»', () => {
    expect(rulerSpan('? (852)', '?')).toBe('(852 г. — единственное упоминание)')
    expect(rulerSpan('?', 'наст.')).toBe('до наших дней')
    expect(rulerSpan('325', '?')).toBe('с 325')
    expect(rulerSpan('?', 'июль 1005')).toBe('до июля 1005')
    expect(rulerSpan('?', '? (мир 294)')).toBe('даты не указаны')
  })
})
