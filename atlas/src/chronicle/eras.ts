// Эпохи хроники и границы шкалы лет.
export const YEAR_MIN = -1700
export const YEAR_MAX = 1006
/** Год старта по умолчанию (мир на 7.11.1005; снимок карты — 1006). */
export const DEFAULT_YEAR = 1006

export const ERAS = [
  { name: 'Первые люди', from: -1700, to: -500 },
  { name: 'Великая война', from: -500, to: 1 },
  { name: 'Имперская эпоха', from: 1, to: 515 },
  { name: 'Смутные годы', from: 553, to: 823 },
  { name: 'Новое время', from: 843, to: 1006 },
]

export type Seg = { name: string; from: number; to: number; gap: boolean }

/** Эпохи и пробелы между ними одной лентой: пробел 515–553, пробел 823–843. */
export const SEGS: Seg[] = ERAS.flatMap((e, i): Seg[] => {
  const next = ERAS[i + 1]
  const own: Seg = { name: e.name, from: e.from, to: e.to, gap: false }
  return next && next.from > e.to
    ? [own, { name: `неизвестный период ${e.to}–${next.from}`, from: e.to, to: next.from, gap: true }]
    : [own]
})

export const eraOf = (y: number) => ERAS.find((e) => y >= e.from && y <= e.to)?.name ?? 'между эпохами'
