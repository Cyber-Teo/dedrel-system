// Небесный календарь. Год — 12 месяцев по 30 дней. Периоды лун и кометы — из вики (knowledges/astronomy).
// Точка отсчёта фаз в источниках не названа: условно у всех трёх лун цикл начинается (новая луна) 1-го дня 1-го месяца 1 года.
export const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]
export const MONTHS_NOM = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
]

export type Moon = { name: string; period: number; note: string }
export const MOONS: Moon[] = [
  { name: 'Эилара', period: 25, note: 'крупная, хорошо видна невооружённым глазом; всегда повёрнута одной стороной' },
  { name: 'Бегун', period: 6, note: 'маленькая тёмная, плохо видна невооружённым глазом' },
  { name: 'Фао', period: 46, note: 'маленькая белая с тёмными пятнами; на рассвете и закате порой светит очень ярко' },
]

export type Comet = { name: string; found: number; every: number; last: number; note: string }
export const COMETS: Comet[] = [
  {
    name: 'Комета Олафа Берсанского',
    found: 256,
    every: 20,
    last: 996,
    note: 'пиво, сваренное во время пролёта, считается особенным',
  },
  {
    name: 'Комета архимага Орианы',
    found: 500,
    every: 55,
    last: 995,
    note: 'во время пролёта, как утверждала Ориана, можно усилить некоторые заклинания',
  },
]

/** Номер дня от 1-го числа 1-го месяца 1 года (до 1 года — отрицательный). */
export const dayIndex = (year: number, month: number, day: number) => (year - 1) * 360 + (month - 1) * 30 + (day - 1)

export type Phase = { cycleDay: number; frac: number; illum: number }
export function moonPhase(m: Moon, year: number, month: number, day: number): Phase {
  const cycleDay = ((dayIndex(year, month, day) % m.period) + m.period) % m.period
  const frac = cycleDay / m.period
  return { cycleDay, frac, illum: (1 - Math.cos(2 * Math.PI * frac)) / 2 }
}

export function phaseName(f: number): string {
  const i = Math.round(f * 8) % 8
  return ['новая', 'растущая', 'первая четверть', 'растущая', 'полная', 'убывающая', 'последняя четверть', 'убывающая'][
    i
  ]
}

export type CometNear = { comet: Comet; prev: number | null; next: number; now: boolean }
/** Ближайшие пролёты до года и после него. Даты пролётов в вики — только годы. */
export function nearestComets(year: number): CometNear[] {
  return COMETS.map((c) => {
    const k = Math.floor((year - c.last) / c.every) // номер последнего пролёта ≤ year относительно известного
    let prev: number | null = c.last + k * c.every
    let next = prev + c.every
    if (prev < c.found) {
      next = c.found
      prev = null
    }
    return { comet: c, prev, next, now: prev === year }
  })
}
