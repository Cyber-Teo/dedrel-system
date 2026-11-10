import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { built } from './registry'
import { ICON_KEYS, MIN_ZOOM, eventIcon, iconFor } from './icons'
import { parseYears, parsePop, POP, splitThreat, visibleAt } from './build'
import { campaignModel, miniOffsets, miniVisible } from './models'

describe('набор значков', () => {
  it('в public/icons ≥40 SVG, и список ключей совпадает с файлами', () => {
    const files = readdirSync('public/icons')
      .filter((f) => f.endsWith('.svg'))
      .map((f) => f.replace('.svg', ''))
      .sort()
    expect(files.length).toBeGreaterThanOrEqual(40)
    expect(files).toEqual([...ICON_KEYS].sort())
  })
  it('атрибуция перечисляет каждый значок с автором', () => {
    const t = readFileSync('public/icons/ATTRIBUTION.md', 'utf8')
    for (const k of ICON_KEYS) expect(t).toContain(`| ${k}.svg |`)
    expect(t).not.toContain('| ? |')
    expect(t).toContain('CC BY 3.0')
  })
  it('iconFor: у каждой категории слоёв есть значок из набора', () => {
    for (const l of [
      'hazards',
      'undead',
      'anomalies',
      'fortresses',
      'legions',
      'schools',
      'shrines',
      'resources',
      'places-ranked',
      'people',
      'guild-hq',
    ])
      for (const o of built.objs.get(l) ?? []) {
        const k = iconFor(l, o.cat)
        expect(k, `${l}|${o.cat}`).not.toBeNull()
        expect(ICON_KEYS as readonly string[]).toContain(k!.split(':')[0])
      }
    expect(iconFor('legions', 'XIII легион')).toBe('legion:XIII')
    expect(MIN_ZOOM.capital).toBeLessThan(MIN_ZOOM.city)
    expect(MIN_ZOOM.city).toBeLessThan(MIN_ZOOM.port)
  })
  it('события: значок по типу, неизвестное — свиток', () => {
    expect(eventIcon('war')).toBe('war')
    expect(eventIcon('battle')).toBe('battle')
    expect(eventIcon('other')).toBe('treaty')
    expect(eventIcon(undefined)).toBe('treaty')
    for (const t of ['birth', 'death', 'trial', 'politics']) expect(eventIcon(t)).toBe(t)
    expect(iconFor('shrines', 'храмы', 'Аббатство Неугасимого Пламени')).toBe('abbey')
  })
})

describe('данные слоёв', () => {
  it('составные угрозы разбиты на отдельные типы', () => {
    expect(splitThreat('тайфуны, кракены, рифы')).toEqual(['тайфуны', 'кракены', 'рифы'])
    expect(splitThreat('чудовища, нежить, банды')).toEqual(['чудовища', 'нежить', 'бандиты'])
    const cats = new Set(built.objs.get('hazards')!.map((o) => o.cat))
    for (const c of cats) expect(c).not.toMatch(/,| и /)
  })
  it('люди по годам жизни: Малдред (род. ≈25) не виден в −300, императоры 912–961 не «живут» в 1006', () => {
    const p = (id: string) => built.objs.get('people')!.find((o) => o.id === id)!
    const m = p('person:maldred_avgust_tarkviniy')
    expect(visibleAt(m, -300, 5)).toBe(false)
    expect(m.meta.find(([k]) => k === 'Место')).toBeTruthy()
    expect(parseYears('912–961')).toEqual({ from: 912, to: 962 })
    expect(parseYears('род. ≈25; ум. 210')).toEqual({ from: 25, to: 211 })
    expect(parseYears('?')).toBeNull()
    const ppl = built.objs.get('people')!
    const emp = ppl.filter((o) => o.meta.some(([k, v]) => k === 'Годы' && v === '912–961'))
    expect(emp.length).toBeGreaterThan(0)
    for (const e of emp) {
      expect(visibleAt(e, 1006, 5)).toBe(false)
      expect(e.meta.some(([k]) => k === 'Живёт')).toBe(false)
    }
    const noYears = ppl.filter((o) => !o.meta.some(([k]) => k === 'Годы'))
    for (const n of noYears) {
      expect(visibleAt(n, 1005, 5)).toBe(true)
      expect(visibleAt(n, 900, 5)).toBe(false)
    }
  })
  it('Вестхельд: крепость 280–625, с 625 — руины', () => {
    const f = built.objs.get('fortresses')!
    const live = f.find((o) => o.id === 'geo:vestheld')!,
      ruin = f.find((o) => o.id === 'geo:vestheld#ruins')!
    expect(visibleAt(live, 600, 5)).toBe(true)
    expect(visibleAt(live, 625, 5)).toBe(false)
    expect(visibleAt(ruin, 625, 5)).toBe(true)
    expect(ruin.cat).toBe('руины')
    expect(ruin.meta.some(([, v]) => v === '625')).toBe(true)
  })
  it('легенда крепостей — названия государств, не slug', () => {
    for (const o of built.objs.get('fortresses')!) expect(o.cat).not.toMatch(/^[a-z_]+$/)
  })
  it('легионы без положения идут в missing', () => {
    expect(built.missing.get('legions')!.length).toBeGreaterThan(0)
  })
})

describe('миниатюры мира', () => {
  it('появляются только в годы, верные по лору', () => {
    const by = (id: string) => built.minis.find((m) => m.id === id)!
    expect(miniVisible(by('mini:dragon-country'), -100)).toBe(false)
    expect(miniVisible(by('mini:dragon-country'), 0)).toBe(false)
    expect(miniVisible(by('mini:dragon-country'), 1)).toBe(true)
    expect(miniVisible(by('mini:inner-sea-1'), -500)).toBe(false)
    expect(by('mini:inner-sea-1').confidence).toBe('speculative')
    expect(miniVisible(by('mini:undead-arnost'), 671)).toBe(false)
    expect(miniVisible(by('mini:undead-arnost'), 672)).toBe(true)
    expect(built.minis.length).toBeGreaterThanOrEqual(25)
    expect(
      built.minis.filter((m) => miniVisible(m, 1006) && Math.hypot(m.x - 5791, m.y - 1953) < 20).length,
    ).toBeGreaterThanOrEqual(3) // Иллиор в 1006
    for (const m of built.minis) {
      expect(m.sources.length).toBeGreaterThan(0)
      expect(ICON_KEYS as readonly string[]).toContain(m.icon)
    }
  })
  it('тип модельки похода по названию', () => {
    expect(campaignModel('флот Малдреда 164', '')).toBe('fleet')
    expect(campaignModel('армия Дааса', '')).toBe('army')
  })
})

describe('значки мест по типу, население, коллизии', () => {
  it('тип места из places.yaml даёт свой значок: порт, шахта, храм, деревня, столица', () => {
    const ic = (k: string) => iconFor('places-ranked', k)
    expect([ic('порты'), ic('шахты'), ic('храмы'), ic('деревни'), ic('столицы'), ic('города')]).toEqual([
      'port',
      'mine',
      'temple',
      'hamlet',
      'capital',
      'city',
    ])
    const cats = new Set(built.objs.get('places-ranked')!.map((o) => o.cat))
    expect(cats.has('деревни')).toBe(true)
    expect(new Set([...cats].map((c) => ic(c))).size).toBeGreaterThanOrEqual(5)
  })
  it('население берётся только из источника', () => {
    expect(parsePop('~1 млн жителей; столица')).toBe(1e6)
    expect(parsePop('≈300 тыс.')).toBe(3e5)
    expect(parsePop('~8000 жителей (крупный)')).toBe(8000)
    expect(parsePop('собрались несколько десятков тысяч человек')).toBeUndefined()
    expect(parsePop(undefined)).toBeUndefined()
    expect(POP.get('places-ranked:countries/illior_empire/cities/city_illior')).toBe(1e6)
  })
  it('миниатюры на одной координате разводятся по кругу 14 px', () => {
    const o = miniOffsets([
      { id: 'a', x: 100, y: 100 },
      { id: 'b', x: 105, y: 100 },
      { id: 'c', x: 900, y: 900 },
    ])
    expect(o.size).toBe(2)
    expect(o.has('c')).toBe(false)
    for (const v of o.values()) expect(Math.hypot(v[0], v[1])).toBeCloseTo(14, 0)
    expect(o.get('a')).not.toEqual(o.get('b'))
  })
})
