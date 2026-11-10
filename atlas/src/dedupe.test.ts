import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { dedupeEvents, titleSim, type DedupeEv } from './dedupe'

const ev = (id: string, year: number, title: string, places: string[] = [], actors: string[] = []): DedupeEv => ({
  id,
  year,
  title,
  places,
  sources: [id],
  actors: actors.map((name) => ({ name })),
})

describe('dedupeEvents', () => {
  it('разные события одного года и места не склеиваются', () => {
    const a = ev(
      'a',
      553,
      'Некроманты бегут в Тэрранову',
      ['geo:terranova', 'geo:vyshnevodsk'],
      ['вышневодские некроманты', 'император Маркус'],
    )
    const b = ev(
      'b',
      553,
      'Маркус на троне: брак с Энфиной из Энфориса, налоговый кризис, гонения на некромантов (бегство в Порт Новой Надежды и Тэрранову), тракт Гарн–Олифанор',
      ['geo:terranova', 'geo:enforis'],
      ['император Маркус', 'Энфина'],
    )
    const c = ev(
      'c',
      673,
      'Нападение союза на Махаратху; плен Махродана',
      ['countries/makharatkha/index', 'countries/archdemon_s_plateau/index'],
      ['Махродан', 'раджа Махаратхи'],
    )
    const d = ev(
      'd',
      673,
      'Комиссия: «явление неизвестной природы»; Асмодийский союз нападает на Махаратху, через неделю разбит Чар Омидэх, Махродан заперт в колесе насоса',
      ['countries/makharatkha/index', 'countries/archdemon_s_plateau/index'],
      ['Махродан', 'Школа Чар Омидэх'],
    )
    expect(dedupeEvents([a, b, c, d])).toHaveLength(4)
  })
  it('дубли «Реформы Аны» и революция 817 склеиваются', () => {
    const log: string[] = []
    const r = dedupeEvents(
      [
        ev('r1', 818, 'Реформы Аны: 12 департаментов', ['geo:zanra'], ['Ана']),
        ev('r2', 818, 'Реформы королевы Аны', ['geo:zanra'], ['Ана']),
        ev('v1', 817, 'Иллиорская революция', ['geo:illior', 'geo:bersan'], ['Фурии']),
        ev('v2', 817, 'Революция 817 года', ['geo:bersan', 'geo:illior'], ['Фурии']),
      ],
      (m) => log.push(m.dropped.id),
    )
    expect(r).toHaveLength(2)
    expect(log).toEqual(['r2', 'v2'])
    expect(r[0].sources).toEqual(['r1', 'r2'])
  })
  it('схожее название в другом году не склеивается; почти одинаковое в том же — да', () => {
    expect(dedupeEvents([ev('a', 100, 'Битва у Моста'), ev('b', 101, 'Битва у Моста')])).toHaveLength(2)
    expect(titleSim('Битва у Моста', 'Битва у моста!')).toBe(1)
    expect(dedupeEvents([ev('a', 100, 'Битва у Моста'), ev('b', 100, 'Битва у моста')])).toHaveLength(1)
  })
  it('пустые места и участники сами по себе дублем не считаются', () => {
    expect(dedupeEvents([ev('a', 5, 'Один'), ev('b', 5, 'Другой')])).toHaveLength(2)
  })
})

describe('склейка второго уровня', () => {
  const IL = 'countries/illior_empire/cities/city_illior'
  it('чума 1005, мэр Фурий и Велеслав — по одной записи; заголовок короткий, длинный в description', () => {
    const r = dedupeEvents([
      ev('p1', 1005, 'Огненная чума 1005 года: карантин в Выселках', [IL, 'geo:vyselki'], ['Йорик']),
      ev(
        'p2',
        1005,
        'Огненная чума закрывает границы империи (по слухам, остановлена светом шпиля Дворца Основателя); Виларинский конвент против нежити Арноста',
        [IL, 'geo:vilarin'],
        ['Йорик', 'Сарина'],
      ),
      ev('p3', 1005, 'Огненная чума 1005 года: вспышка в империи и свет шпиля', [IL]),
      ev('m1', 1005, 'Децимус Фурий — мэр Иллиора', [IL], ['Децимус Фурий']),
      ev('m2', 1005, 'Выборы мэра: Децимус Фурий', [IL], ['Децимус Хириус Фурий']),
      ev('v1', 1005, 'Гибель гладиатора Велеслава из Берсана', [IL, 'geo:bersan'], ['Велеслав']),
      ev('v2', 1005, 'Смерть Велеслава из Берсана', [IL], ['Велеслав из Берсана']),
    ])
    expect(r.map((e) => e.id)).toEqual(['p1', 'm2', 'v2'])
    expect(r[0].description).toContain('закрывает границы')
    expect(r.every((e) => e.title.length <= 90)).toBe(true)
  })
  it('XXIII и XXIV легионы остаются раздельными', () => {
    const r = dedupeEvents([
      ev('l3', 1005, 'Формирование XXIII легиона', ['geo:greyheld'], ['Октавий Опий']),
      ev('l4', 1005, 'Формирование XXIV легиона («женского»)', [IL, 'geo:greyheld'], ['Октавий Опий', 'Клара Фурия']),
    ])
    expect(r).toHaveLength(2)
  })
  it('985: смерть Нумерии и воцарение Йорика не склеиваются', () => {
    const r = dedupeEvents([
      ev('n', 985, 'Смерть Нумерии; роспуск и пересбор Драконьей стражи', [IL], ['Йорик', 'Морна Чистая']),
      ev('y', 985, 'Йорик становится императором', [IL], ['Йорик', 'Морна Чистая']),
    ])
    expect(r).toHaveLength(2)
  })
  it('убийство Мигеля с упоминанием Децимуса не склеивается с его мэрством', () => {
    const r = dedupeEvents([
      ev('a', 1005, 'Децимус Фурий — мэр Иллиора', [IL], ['Децимус Фурий']),
      ev(
        'b',
        1005,
        'Ассасин убивает Мигеля I в Наджире, город сдан с резнёй; коронация 12-летней Морены (регент Мендоза); Децимус Фурий — мэр Иллиора',
        [IL, 'geo:nadzhir'],
        ['Мигель I', 'Децимус Фурий'],
      ),
    ])
    expect(r).toHaveLength(2)
  })
})

describe('склейка на реальной хронике', () => {
  it('склеенные заголовки не длиннее 90 знаков, Иллиор 1005: одна чума и один мэр', () => {
    const all = (parse(readFileSync('data/events.yaml', 'utf8')) as any[])
      .filter((e) => e.visibility === 'public' && e.year != null)
      .map((e) => ({ ...e, places: e.places ?? [] }))
    const merged: string[] = []
    const out = dedupeEvents(all, (m) => merged.push(m.kept.title))
    expect(merged.length).toBeGreaterThan(0)
    expect(merged.filter((t) => t.length > 90)).toEqual([])
    const y = out.filter((e) => e.year === 1005)
    expect(y.filter((e) => /Огненная чума/.test(e.title))).toHaveLength(1)
    expect(y.filter((e) => /Децимус/.test(e.title) && /мэр/i.test(e.title) && e.title.length < 60)).toHaveLength(1)
    expect(y.filter((e) => /XXIII|XXIV/.test(e.title) && /Формирование/.test(e.title))).toHaveLength(2)
  })
})
