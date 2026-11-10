import { describe, expect, it } from 'vitest'
import { norm, parseYear, search, searchGroups, type Entry } from './rank'

const E = (id: string, group: Entry['group'], name: string, aliases: string[] = []): Entry => ({
  id,
  group,
  name,
  aliases,
  sub: '',
})
const idx = [
  E('geo:talar', 'place', 'Талар', ['Талор']),
  E('geo:imrelon', 'place', 'Имрелон', ['Аселенора']),
  E('geo:talaria', 'place', 'Таларийский перевал'),
  E('p:yo', 'person', 'Фёдор Ёлкин'),
  E('pol:ill', 'polity', 'Иллиорская империя'),
]

describe('norm', () => {
  it('ё=е, регистр, пунктуация', () => {
    expect(norm('  ФЁДОР,  Ёлкин ')).toBe('федор елкин')
  })
})
describe('search', () => {
  it('алиас находит основное имя', () => {
    expect(search(idx, 'Талор')[0].entry.id).toBe('geo:talar')
  })
  it('Аселенора → Имрелон', () => {
    expect(search(idx, 'аселенора')[0].entry.id).toBe('geo:imrelon')
  })
  it('ё/е нечувствительно', () => {
    expect(search(idx, 'федор елкин')[0].entry.id).toBe('p:yo')
    expect(search(idx, 'Фёдор')[0].entry.id).toBe('p:yo')
  })
  it('точное имя выше префикса', () => {
    expect(search(idx, 'талар').map((r) => r.entry.id)).toEqual(['geo:talar', 'geo:talaria'])
  })
  it('все слова запроса обязательны', () => {
    expect(search(idx, 'империя иллиор').map((r) => r.entry.id)).toEqual(['pol:ill'])
    expect(search(idx, 'империя талар')).toEqual([])
  })
  it('пустой запрос — пусто', () => {
    expect(search(idx, '  ')).toEqual([])
  })
})
describe('годы в запросе', () => {
  const ev = (id: string, year: number): Entry => ({
    id,
    group: 'event',
    name: 'Событие ' + id,
    aliases: [],
    sub: '',
    year,
  })
  const evs = [ev('a', -500), ev('b', 500), ev('c', 1005)]
  it('parseYear: минусы и «до победы»', () => {
    expect([
      parseYear('-500'),
      parseYear('−500'),
      parseYear('500 до победы'),
      parseYear('1005'),
      parseYear('1005 г.'),
      parseYear('иллиор'),
    ]).toEqual([-500, -500, -500, 1005, 1005, null])
  })
  it('-500, −500 и «500 до победы» находят год −500, но не 500', () => {
    for (const q of ['-500', '−500', '500 до победы']) expect(search(evs, q).map((h) => h.entry.id)).toEqual(['a'])
    expect(search(evs, '500')[0].entry.id).toBe('b')
  })
})
describe('«Иллиор»: город выше мёртвого государства и тюрьмы', () => {
  it('точное имя города первое, государство с годами ниже без дубля алиаса', () => {
    const i: Entry[] = [
      E('pol', 'polity', 'Иллиор (74–110)', ['Иллиор']),
      E('city', 'place', 'Иллиор'),
      E('jail', 'place', 'Иллиорская тюрьма'),
    ]
    const g = searchGroups(i, 'Иллиор')
    expect(g[0].hits.map((h) => h.entry.id)).toEqual(['city', 'jail'])
    expect(g[1].hits[0].entry.id).toBe('pol')
  })
})
describe('группы', () => {
  it('«Малдред»: человек с именем из нескольких слов выше событий с этим словом в начале', () => {
    const g = searchGroups([E('e', 'event', 'Малдред идёт на юг'), E('p', 'person', 'Йорик Малдред Август')], 'малдред')
    expect(g.map((x) => x.group)).toEqual(['person', 'event'])
  })
  it('группа с лучшим совпадением первая, повторы убраны', () => {
    const i: Entry[] = [
      E('e1', 'event', 'Малдред идёт'),
      E('p1', 'person', 'Малдред'),
      E('p1', 'person', 'Малдред'),
      E('g1', 'place', 'Дорога Малдреда'),
    ]
    const g = searchGroups(i, 'малдред')
    expect(g[0].group).toBe('person')
    expect(g.find((x) => x.group === 'person')!.hits).toHaveLength(1)
  })
})

import { cellHistory, lifespan, neighbours, samePolity } from './polity'
describe('polity', () => {
  const runs: any = [
    [-500, 'a', 'canon', ['s1']],
    [100, 'a', 'canon', ['s2']],
    [200, null, null, []],
    [300, 'b', 'derived', []],
    [400, 'a', 'canon', []],
  ]
  it('лента сливает одинаковых подряд', () => {
    expect(cellHistory(runs).map((s) => [s.polity, s.from, s.to])).toEqual([
      ['a', -500, 200],
      [null, 200, 300],
      ['b', 300, 400],
      ['a', 400, null],
    ])
  })
  it('годы жизни', () => {
    expect(lifespan({ c: runs }, 'b')).toEqual({ first: 300, last: 400, cells: 1 })
    expect(lifespan({ c: runs }, 'a')!.last).toBeNull()
  })
  it('соседи пропускают пустоту', () => {
    expect(neighbours(runs, 'b')).toEqual({ prev: 'a', next: 'a' })
  })
  it('имена из разных реестров', () => {
    expect(samePolity('Королевство Гросс (Берсан)', 'Королевство Гросс')).toBe(true)
    expect(samePolity('Люди', 'Первые люди')).toBe(false)
  })
})

import { cleanNote } from './clean'
describe('cleanNote', () => {
  it('(вывод: X) → сноска и признак', () => {
    expect(cleanNote('«≈1500 лет назад» (вывод: ≈−500); но эльфы ≈−470 — расхождение')).toEqual({
      text: '«≈1500 лет назад»; но эльфы ≈−470',
      derived: true,
      notes: ['≈−500', 'источники расходятся'],
    })
    expect(cleanNote('Иллиор (вывод), родом из Гросса')).toMatchObject({
      text: 'Иллиор, родом из Гросса',
      derived: true,
    })
    expect(cleanNote('вывод: между Иллиором и Олифанором').text).toBe('между Иллиором и Олифанором')
    expect(cleanNote('Название (вывод:).').text).toBe('Название.')
    expect(cleanNote('обычный текст')).toEqual({ text: 'обычный текст', derived: false, notes: [] })
  })
})
describe('государство первым, регионы-дубли склеены', () => {
  const R = (id: string, name: string): Entry => ({ id, group: 'place', name, aliases: [], sub: '', kind: 'region' })
  const gi: Entry[] = [
    R('geo:gross', 'Гросс'),
    R('geo:cg', 'Центральный Гросс'),
    R('c:gcr', 'Центральный регион Гросс'),
    E('pol:gross', 'polity', 'Королевство Гросс'),
  ]
  it('«Гросс»: первая группа — государство, регион один', () => {
    const g = searchGroups(gi, 'Гросс')
    expect(g[0].hits[0].entry.id).toBe('pol:gross')
    expect(g.find((x) => x.group === 'place')!.hits.map((h) => h.entry.id)).toEqual(['geo:gross'])
  })
})

describe('места без точки на карте', () => {
  it('стоят ниже одноимённых с точкой', () => {
    const i: Entry[] = [{ ...E('a', 'place', 'Виларин'), nomap: true }, E('b', 'place', 'Виларин')]
    expect(search(i, 'Виларин').map((h) => h.entry.id)).toEqual(['b', 'a'])
  })
})
