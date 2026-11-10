import { describe, expect, it } from 'vitest'
import { COMETS, MOONS, dayIndex, moonPhase, nearestComets, phaseName } from './sky'

describe('календарь 12×30', () => {
  it('индекс дня', () => {
    expect(dayIndex(1, 1, 1)).toBe(0)
    expect(dayIndex(1, 2, 1)).toBe(30)
    expect(dayIndex(2, 1, 1)).toBe(360)
    expect(dayIndex(1, 12, 30)).toBe(359)
  })
})

describe('фазы лун', () => {
  it('периоды из вики: Эилара 25, Бегун 6, Фао 46', () => {
    expect(MOONS.map((m) => [m.name, m.period])).toEqual([
      ['Эилара', 25],
      ['Бегун', 6],
      ['Фао', 46],
    ])
  })
  it('через период фаза та же', () => {
    for (const m of MOONS) {
      const a = moonPhase(m, 100, 3, 7),
        b = moonPhase(m, ...addDays(100, 3, 7, m.period))
      expect(b.cycleDay).toBe(a.cycleDay)
      expect(b.frac).toBeCloseTo(a.frac, 9)
    }
  })
  it('новолуние в начале цикла, полнолуние на половине', () => {
    const e = MOONS[0]
    expect(moonPhase(e, 1, 1, 1)).toMatchObject({ cycleDay: 0, illum: 0 })
    expect(phaseName(moonPhase(e, 1, 1, 1).frac)).toBe('новая')
    const half = moonPhase(MOONS[1], 1, 1, 4) // Бегун: 3 дня от начала = половина из 6
    expect(half.illum).toBeCloseTo(1, 9)
    expect(phaseName(half.frac)).toBe('полная')
  })
  it('до нашей эры не ломается (отрицательный остаток)', () => {
    const p = moonPhase(MOONS[0], -500, 5, 5)
    expect(p.cycleDay).toBeGreaterThanOrEqual(0)
    expect(p.cycleDay).toBeLessThan(25)
  })
})

describe('кометы', () => {
  it('Олаф: 996, раз в 20 лет, открыта в 256', () => {
    const o = COMETS[0]
    expect(nearestComets(1005).find((c) => c.comet === o)).toMatchObject({ prev: 996, next: 1016 })
    expect(nearestComets(996).find((c) => c.comet === o)).toMatchObject({ prev: 996, next: 1016, now: true })
  })
  it('Ориана: 995, раз в 55 лет', () => {
    expect(nearestComets(1005).find((c) => c.comet === COMETS[1])).toMatchObject({ prev: 995, next: 1050 })
  })
  it('до открытия пролётов нет', () => {
    expect(nearestComets(300).find((c) => c.comet === COMETS[1])).toMatchObject({ prev: null, next: 500 })
    expect(nearestComets(100).find((c) => c.comet === COMETS[0])).toMatchObject({ prev: null, next: 256 })
  })
})

function addDays(y: number, m: number, d: number, n: number): [number, number, number] {
  const t = (y - 1) * 360 + (m - 1) * 30 + (d - 1) + n
  return [Math.floor(t / 360) + 1, Math.floor((t % 360) / 30) + 1, (t % 30) + 1]
}
