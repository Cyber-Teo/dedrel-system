import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { buildGraph, dijkstra, offEdge, planRoute, shipFallback, type Edge, type Pt } from './graph'
import { graphInput } from './load'
import {
  accusative,
  describeRoute,
  edgeDays,
  fmtTravel,
  hazardsAlong,
  placeLabel,
  placesAlong,
  splitDays,
  stopLabel,
  stopPin,
} from './travel'

const e = (to: string, km: number, cat: Edge['cat'] = 'paved', f = 1): Edge => ({ to, km, cat, f, geom: [] })

describe('dijkstra', () => {
  const adj: Record<string, Edge[]> = {
    a: [e('b', 10), e('c', 50)],
    b: [e('a', 10), e('c', 10)],
    c: [e('a', 50), e('b', 10), e('d', 5)],
    d: [e('c', 5)],
    z: [],
  }
  const nb = (id: string) => adj[id].map((x) => ({ to: x.to, w: x.km, edge: x }))
  it('берёт кратчайший путь в обход прямого', () => {
    const r = dijkstra('a', 'd', nb)!
    expect(r.steps.map((s) => s.to)).toEqual(['b', 'c', 'd'])
    expect(r.cost).toBe(25)
  })
  it('нет пути -> null', () => expect(dijkstra('a', 'z', nb)).toBeNull())
  it('не проходит рёбра с бесконечным весом', () => {
    expect(
      dijkstra('a', 'd', (id) => adj[id].map((x) => ({ to: x.to, w: x.to === 'b' ? Infinity : x.km, edge: x })))!.cost,
    ).toBe(55)
  })
})

describe('дни и часы', () => {
  it('верхом по тракту 50 км/сут', () => expect(edgeDays(e('x', 100), 'horse')).toBe(2))
  it('грунтовка ×0,8, телега 30 км/сут', () => expect(edgeDays(e('x', 120, 'gravel', 0.8), 'cart')).toBeCloseTo(5))
  it('море 10 км/ч, суша для грифона недоступна', () => {
    expect(edgeDays(e('x', 240, 'sea'), 'foot')).toBe(1)
    expect(edgeDays(e('x', 10), 'griffon')).toBe(Infinity)
  })
  it('формат без смешения часов', () => {
    expect(fmtTravel(10.9, [10])).toBe('≈10,9 сут (10 ч в пути в день)')
    expect(fmtTravel(5, [10, 24])).toBe('≈5,0 сут (на суше 10 ч, на воде 24 ч в пути в день)')
  })
  it('корабль по суше не ходит', () => expect(edgeDays(e('x', 10), 'ship')).toBe(Infinity))
  it('падеж: Ничья пустыня → Ничью пустыню', () => {
    expect(accusative('Ничья пустыня')).toBe('Ничью пустыню')
    expect(accusative('Лес Ужасов')).toBe('Лес Ужасов')
    expect(accusative('Друидова пуща')).toBe('Друидову пущу')
    expect(accusative('Долгое болото')).toBe('Долгое болото')
  })
  it('подпись места без пометок', () => {
    expect(placeLabel('Виларин (город)')).toBe('Виларин')
    expect(placeLabel('Иллиорская империя (маркер карты)')).toBe('Иллиорская империя')
  })
})

describe('граф', () => {
  const p = (id: string, x: number, y: number): Pt => ({ id, name: id, x, y })
  const g = buildGraph({
    places: [p('A', 0, 0), p('B', 400, 0), p('P', 0, 100), p('Q', 4000, 100)],
    roadNodes: [],
    roads: [
      {
        from: 'A',
        to: 'B',
        type: 'paved',
        geom: [
          [0, 0],
          [400, 0],
        ],
      },
    ],
    sea: [
      {
        id: 's',
        geom: [
          [0, 100],
          [2000, 400],
          [4000, 100],
        ],
      },
    ],
    rivers: [],
    terr: [
      {
        kind: 'swamp',
        name: 'Мшара',
        bbox: [100, -50, 300, 50],
        polys: [
          [
            [
              [100, -50],
              [300, -50],
              [300, 50],
              [100, 50],
            ],
          ],
        ],
      },
    ],
  })
  it('тракт 400 px = 100 км', () => expect(planRoute(g, p('A', 0, 0), p('B', 400, 0), 'horse')!.km).toBeCloseTo(100))
  it('грифон летит по прямой и не предупреждает о болоте', () => {
    const r = planRoute(g, p('A', 0, 0), p('B', 400, 0), 'griffon')!
    expect(r.days).toBeCloseTo(1)
    expect(r.warnings).toEqual([])
  })
  it('верхом по морю — с пересадкой на корабль; корабль без воды — пути нет, пешком до порта', () => {
    expect(planRoute(g, p('A', 0, 0), p('Q', 4000, 100), 'horse')!.transfer).toBe(true)
    expect(planRoute(g, p('A', 0, 0), p('P', 0, 100), 'ship')).toBeNull()
    const f = shipFallback(g, g.pts.get('A')!, g.pts.get('Q')!)
    expect(f.end).toBe('a')
    expect(f.port!.id).toBe('P')
  })
  it('корабль от внутреннего города: пешком до порта + море (составной путь)', () => {
    const r = planRoute(g, p('A', 0, 0), p('Q', 4000, 100), 'ship')!
    expect(r.composite).toBe(true)
    expect(r.byCat.sea).toBeTruthy()
    expect(r.byCat.off).toBeTruthy()
  })
  it('на другую сторону моря — морской переход, а не бездорожье', () => {
    const r = planRoute(g, p('A', 0, 0), p('Q', 4000, 100), 'horse')!
    expect(r.byCat.sea).toBeTruthy()
  })
  it('болото: бездорожье ×0,3, открытая местность ×0,7', () => {
    const swamp = offEdge(g.terr, p('X', 120, 0), p('Y', 280, 0))
    expect(swamp.f).toBeCloseTo(0.3)
    expect(swamp.terr).toEqual(['Мшара'])
    expect(offEdge(g.terr, p('X', 0, 200), p('Y', 200, 200)).f).toBeCloseTo(0.7)
  })
})

describe('реальные данные: Иллиор → Данир верхом', () => {
  const j = (f: string) => JSON.parse(readFileSync(`data/geo/${f}.geojson`, 'utf8'))
  const y = (f: string) => parse(readFileSync(`data/${f}.yaml`, 'utf8'))
  const { input, hazards } = graphInput({
    places: y('places'),
    roads: j('roads'),
    routes: j('routes'),
    rivers: j('rivers'),
    terrain: j('terrain'),
    hazards: y('hazards'),
  })
  const g = buildGraph(input)
  const f = (n: string) => [...g.pts.values()].find((q) => q.name === n)!
  it('≈545,7 км и ≈11 суток по тракту', () => {
    const r = planRoute(g, f('Иллиор'), f('Данир'), 'horse', hazards)!
    expect(r.km).toBeCloseTo(545.7, 0)
    expect(r.days).toBeGreaterThan(10.5)
    expect(r.days).toBeLessThan(11.5)
    expect(r.legs.map((l) => g.pts.get(l.to)!.name)).toEqual([
      'Висентия',
      'Стародраконья',
      'Берсан',
      'Колючка',
      'Аёндо',
      'Данир',
    ])
  })
  it('Иллиор → Махаратха — морем', () => {
    const r = planRoute(g, f('Иллиор'), f('Махаратха (город)'), 'horse', hazards)!
    expect(r.byCat.sea!.km).toBeGreaterThan(400)
  })
})

describe('дневные перегоны и места вдоль пути', () => {
  // прямая дорога 0..1200 px по x = 300 км; верхом 50 км/сут = 200 px/сут; всего 6 суток
  const leg = (days: number, x0: number, x1: number) => ({
    cat: 'paved' as const,
    days,
    geom: [
      [x0, 0],
      [x1, 0],
    ] as [number, number][],
  })
  const pl = (id: string, name: string, x: number, y: number, kind = 'city') => ({ id, name, x, y, kind })
  const places = [
    pl('A', 'Альфа', 210, 20),
    pl('F', 'Форт', 600, 8, 'fortress'),
    pl('B', 'Бета', 1000, 40),
    pl('Z', 'Конец', 1200, 0),
    pl('X', 'Море', 600, 900, 'sea'),
    pl('Far', 'Дальняя', 400, 400),
  ]
  it('3 суток -> 3 перегона, 2 промежуточных ночлега, последний в пункте назначения', () => {
    const st = splitDays([leg(3, 0, 600)], places, ['S'])
    expect(st.map((s) => s.day)).toEqual([1, 2, 3])
    expect(st.map((s) => Math.round(s.km))).toEqual([50, 100, 150])
    expect(st[0].place?.id).toBe('A')
    expect(st[0].placeKm).toBeLessThanOrEqual(15)
    expect(st[2].last).toBe(true)
    expect(stopPin(st[0])).toBe('день 1 · ночлег у Альфа')
  })
  it('расстояние и «на пути» для остановки совпадают в «По дням» и «По пути»', () => {
    const path = [
      [0, 0],
      [600, 0],
    ] as [number, number][]
    const ps = [pl('A', 'Альфа', 210, 20), pl('B', 'Бета', 400, 40), pl('N', 'Ближняя', 90, 60)]
    const st = splitDays([leg(3, 0, 600)], ps, ['S'])
    const al = placesAlong(path, ps, [])
    for (const s of st) {
      const pl2 = s.place ?? s.near
      if (!pl2) continue
      const o = al.find((a) => a.place.id === pl2.id)
      if (!o) continue
      expect(Math.round(s.place ? s.placeKm : s.nearKm)).toBe(Math.round(o.offKm))
      if (s.place && !s.last && s.placeKm >= 1) expect(stopLabel(s).includes('на пути')).toBe(o.onRoad)
    }
  })
  it('день делится по накопленным суткам через несколько рёбер (медленное ребро растягивает день)', () => {
    const st = splitDays([leg(0.5, 0, 100), leg(2, 100, 200)], places, [])
    expect(st).toHaveLength(3) // 2,5 сут -> 3 дня
    expect(st[0].x).toBeCloseTo(100 + ((0.5 * 100) / 2) * 1, 5) // 1 сут = 0,5 + 0,5 сут на втором ребре (1/4 его длины)
    expect(st[2].km).toBeCloseTo(50, 5) // 200 px * 0,25
  })
  it('нет места в 15 км: ночлег «в пути», ближайшее место названо', () => {
    const st = splitDays([leg(2, 0, 1200)], [pl('Far', 'Дальняя', 400, 400)], [])
    expect(st[0].place).toBeNull()
    expect(st[0].near?.id).toBe('Far')
    expect(stopLabel(st[0])).toContain('Дальняя')
  })
  it('нулевой и бесконечный путь -> нет дней', () => {
    expect(splitDays([], places)).toEqual([])
    expect(splitDays([leg(Infinity, 0, 1)], places)).toEqual([])
  })
  it('коридор: порядок вдоль пути, крепость отмечена, начало/конец и море исключены', () => {
    const r = placesAlong(
      [
        [0, 0],
        [1200, 0],
      ],
      places,
      ['A', 'Z'],
    )
    expect(r.map((o) => o.place.id)).toEqual(['F', 'B'])
    expect(r[0].fortress).toBe(true)
    expect(r[0].onRoad).toBe(true)
  })
  it('опасность с координатой попадает в радиус пути', () => {
    const hz = [
      { name: 'Арност', threat: 'нежить', x: 600, y: 60 },
      { name: 'Далеко', threat: 'х', x: 600, y: 900 },
    ]
    expect(
      hazardsAlong(
        [
          [0, 0],
          [1200, 0],
        ],
        hz,
      ).map((h) => h.name),
    ).toEqual(['Арност'])
  })
  it('описание содержит откуда, куда, День 1', () => {
    const st = splitDays([leg(3, 0, 600)], places, [])
    const t = describeRoute({
      from: 'Иллиор',
      to: 'Дагор',
      mode: 'horse',
      km: 150,
      days: 3,
      hpds: [10],
      stops: st,
      along: placesAlong(
        [
          [0, 0],
          [600, 0],
        ],
        places,
      ),
      warnings: ['Через лес'],
    })
    expect(t).toMatch(/Иллиор/)
    expect(t).toMatch(/Дагор/)
    expect(t).toMatch(/День 1/)
    expect(t).toMatch(/Опасности: Через лес/)
  })
})
describe('реальные данные: Иллиор → Дагор верхом по дням', () => {
  const j = (f: string) => JSON.parse(readFileSync(`data/geo/${f}.geojson`, 'utf8'))
  const y = (f: string) => parse(readFileSync(`data/${f}.yaml`, 'utf8'))
  const { input, hazards } = graphInput({
    places: y('places'),
    roads: j('roads'),
    routes: j('routes'),
    rivers: j('rivers'),
    terrain: j('terrain'),
    hazards: y('hazards'),
  })
  const g = buildGraph(input)
  const f = (n: string) => [...g.pts.values()].find((q) => q.name === n)!
  const a = f('Иллиор'),
    b = f('Дагор')
  const r = planRoute(g, a, b, 'horse', hazards)!
  it('3 дня, два ночлега в пути, последний — Дагор', () => {
    const st = splitDays(r.legs, g.pts.values(), [a.id, b.id])
    expect(st).toHaveLength(3)
    expect(st[2].place?.name).toBe('Дагор')
    expect(st.slice(0, 2).every((s) => s.near && s.nearKm > 0)).toBe(true)
  })
  it('по пути есть Селимбрия (в стороне от дороги, с расстоянием)', () => {
    const al = placesAlong(
      r.legs.flatMap((l) => l.geom),
      g.pts.values(),
      [a.id, b.id],
    )
    const s = al.find((o) => o.place.name === 'Селимбрия')
    expect(s).toBeTruthy()
    expect(s!.offKm).toBeGreaterThan(10)
  })
})

describe('ночлеги: зона нежити и дубли', () => {
  const j = (f: string) => JSON.parse(readFileSync(`data/geo/${f}.geojson`, 'utf8'))
  const y = (f: string) => parse(readFileSync(`data/${f}.yaml`, 'utf8'))
  const { input, hazards, hazardPts } = graphInput({
    places: y('places'),
    roads: j('roads'),
    routes: j('routes'),
    rivers: j('rivers'),
    terrain: j('terrain'),
    hazards: y('hazards'),
  })
  const g = buildGraph(input)
  const f = (n: string) => [...g.pts.values()].find((q) => q.name === n)!
  const run = (from: string, to: string, mode: 'horse' | 'foot') => {
    const a = f(from),
      b = f(to),
      r = planRoute(g, a, b, mode, hazards)!
    return {
      r,
      a,
      b,
      st: splitDays(r.legs, g.pts.values(), [a.id, b.id], hazardPts),
      al: placesAlong(
        r.legs.flatMap((l) => l.geom),
        g.pts.values(),
        [a.id, b.id],
        40,
        hazardPts,
      ),
    }
  }
  it('Иллиор → Вышневодск верхом: ночлега в Нордхельде нет, в «По пути» он с ⚠', () => {
    const { st, al } = run('Иллиор', 'Вышневодск', 'horse')
    expect(st.filter((s) => !s.last).some((s) => s.place?.name === 'Нордхельд')).toBe(false)
    const n = al.find((o) => o.place.name === 'Нордхельд')
    if (n) expect(n.unsafe).toBe(true)
  })
  it('Иллиор → Виларин пешком: Камераска одна, ночлег не повторяется подряд', () => {
    const { st, al } = run('Иллиор', 'Виларин', 'foot')
    expect(al.filter((o) => /Камерас/.test(o.place.name)).length).toBeLessThanOrEqual(1)
    const ids = st.filter((s) => !s.last && s.place).map((s) => s.place!.id)
    ids.forEach((id, i) => {
      if (i) expect(id).not.toBe(ids[i - 1])
    })
  })
  it('зона нежити в синтетике: ночлег переносится, подпись с ⚠', () => {
    const leg = {
      cat: 'paved' as const,
      days: 2,
      geom: [
        [0, 0],
        [400, 0],
      ] as [number, number][],
    }
    const ps = [
      { id: 'N', name: 'Руина', x: 200, y: 0, kind: 'city' },
      { id: 'S', name: 'Целое', x: 250, y: 0, kind: 'city' },
    ]
    const st = splitDays([leg], ps, [], [{ name: 'Зона', threat: 'нежить', x: 200, y: 0, placeId: 'N' }])
    expect(st[0].place?.id).toBe('S')
    expect(st[0].avoided?.id).toBe('N')
  })
})
