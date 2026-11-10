import { describe, expect, it } from 'vitest'
import { byTime, dateText, scYear, scenarios } from './scenarios'
import { relations } from '../graph/data'

describe('сценарии', () => {
  it('год в дате один раз, месяц в именительном', () => {
    expect(dateText({ year: 1005, month: 4 })).toBe('Апрель 1005 г.')
    expect(dateText({ year: 1005, month: 11, day: 7 })).toBe('7 ноября 1005 г.')
    expect(dateText({ year: 1005, month: 3, label: 'конец марта 1005' })).toBe('Конец марта 1005 г.')
  })
  it('«г.» только после числовой даты, текстовые ярлыки как есть', () => {
    expect(dateText({ year: 817, label: '817 год', note: 'без точной даты' })).toBe('817 год (без точной даты)')
    expect(dateText({ year: -320, label: 'около −320 года' })).toBe('Около −320 года')
    expect(dateText({ year: 817, label: 'через неделю после революции', note: 'точная дата в вики не названа' })).toBe(
      'Через неделю после революции (точная дата в вики не названа)',
    )
    expect(dateText({ year: 1005, label: 'осень 1005' })).toBe('Осень 1005 г.')
  })
  it('в тексте шагов нет «г. г.» и «год г.»', () => {
    for (const sc of scenarios)
      for (const st of sc.steps) expect(dateText(st.date)).not.toMatch(/(год|года|году|г\.) г\./)
  })
  it('шаг 11 войны 1005 — кадр Бастионного союза', () => {
    const w = scenarios.find((s) => s.id === 'war-1005')!
    expect(w.steps[10].owners_at).toBe(1005.85)
  })
  it('в тексте шагов нет служебных слов про камеру', () => {
    for (const sc of scenarios) for (const st of sc.steps) expect(st.text).not.toMatch(/Камера/)
  })
  it('революция: шаги 5–6 — кадр политики 818 (Занра отдельно), шаг 6 с источником Занры', () => {
    const r = scenarios.find((s) => s.id === 'revolution-817')!
    expect(r.steps[4].owners_at).toBe(818)
    expect(r.steps[5].owners_at).toBe(818)
    expect(r.steps[5].sources).toContain('countries/zanra/index')
    expect(dateText(r.steps[5].date)).toBe('Через месяц после сбора легиона (дата в вики не названа)')
  })
  it('«Переворот в Гроссе»: каждый шаг в 573 году, с местами и источником', () => {
    const g = scenarios.find((s) => s.id === 'gross-573')!
    expect(g.steps.length).toBeGreaterThanOrEqual(5)
    expect(g.steps.length).toBeLessThanOrEqual(7)
    for (const st of g.steps) {
      expect(st.date.year).toBe(573)
      expect(st.highlight.places.length).toBeGreaterThan(0)
      expect(st.sources.length).toBeGreaterThan(0)
    }
  })
  it('«Восточный поход Малдреда»: 6–10 шагов, у каждого год, камера и источник; годы по порядку в 88–206', () => {
    const m = scenarios.find((s) => s.id === 'maldred-east-88')!
    expect(m.title).toBe('Восточный поход Малдреда (88–206)')
    expect(m.steps.length).toBeGreaterThanOrEqual(6)
    expect(m.steps.length).toBeLessThanOrEqual(10)
    let prev = -Infinity
    for (const st of m.steps) {
      expect(st.sources.length).toBeGreaterThan(0)
      expect(st.camera.place ?? st.camera.px).toBeTruthy()
      expect(st.date.year).toBeGreaterThanOrEqual(prev)
      expect(st.date.year).toBeGreaterThanOrEqual(88)
      expect(st.date.year).toBeLessThanOrEqual(206)
      prev = st.date.year
    }
    expect(m.steps[0].date.year).toBe(88)
    expect(m.steps.at(-1)!.date.year).toBe(206)
  })
  it('список по хронологии: −500, 88, 206, 206, 573, 672, 817, 1005, 1005', () => {
    expect(byTime.map((s) => parseInt(scYear(s.id)))).toEqual([-500, 88, 206, 206, 573, 672, 817, 1005, 1005])
    expect(byTime.length).toBe(scenarios.length)
  })
  it('предательство Рулфари', () => {
    expect(relations.some((r) => r.type === 'betrayal' && r.a === 'person:rulfari')).toBe(true)
  })
})
