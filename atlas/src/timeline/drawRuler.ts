// Canvas-линейка шкалы: засечки круглых лет, штрихи событий, окно ±win, текущий год.
import { yearLabel } from '../events'
import { INK_COLOR, MASTER_COLOR, TL_DEFAULT_STROKE, TL_GOLD, TL_LABEL, TL_PAPER } from '../theme'
import { EV_YEARS, MASTER_YEARS, YEAR_COLOR } from './eventIndex'

/** Варианты шага подписей лет; выбирается первый, при котором подписи не слипаются. */
const TICKS = [10, 25, 50, 100, 200, 250, 500, 1000]
const MIN_LABEL_PX = 56
const LABEL_FONT = '11px Literata, Georgia, serif'
const LABEL_BASELINE = 26
const TICK_TOP = 17
const GRID_TOP = 21
/** Столетние линии рисуются, если шаг подписей крупнее и 100 лет занимают не меньше стольких px. */
const CENTURY_MIN_PX = 4
const EVENT_STROKE_BASE = 7
const EVENT_STROKE_PER_EVENT = 3
const EVENT_STROKE_MAX = 18

export type RulerOpts = {
  w: number
  h: number
  d0: number
  d1: number
  year: number
  win: number
  hover: number | null
}

export function drawRuler(c: HTMLCanvasElement, { w, h, d0, d1, year, win, hover }: RulerOpts) {
  const dpr = devicePixelRatio || 1
  c.width = w * dpr
  c.height = h * dpr
  const g = c.getContext('2d')!
  g.scale(dpr, dpr)
  g.clearRect(0, 0, w, h)
  g.fillStyle = TL_PAPER
  g.fillRect(0, 0, w, h)

  const y2x = (y: number) => ((y - d0) / (d1 - d0)) * w
  const crisp = (y: number) => Math.round(y2x(y)) + 0.5
  const line = (x: number, y0: number, y1: number) => {
    g.beginPath()
    g.moveTo(x, y0)
    g.lineTo(x, y1)
    g.stroke()
  }

  // круглые даты: шаг подбираем так, чтобы подписи не слипались
  const pxPer = (t: number) => (t / (d1 - d0)) * w
  const tick = TICKS.find((t) => pxPer(t) >= MIN_LABEL_PX) ?? TICKS[TICKS.length - 1]
  g.font = LABEL_FONT
  g.fillStyle = TL_LABEL
  g.strokeStyle = TL_GOLD + '88'
  g.lineWidth = 1
  if (tick > 100 && pxPer(100) >= CENTURY_MIN_PX) {
    g.strokeStyle = TL_GOLD + '44'
    for (let y = Math.ceil(d0 / 100) * 100; y <= d1; y += 100) line(crisp(y), GRID_TOP, h)
    g.strokeStyle = TL_GOLD + '88'
  }
  let lastEnd = -Infinity
  for (let y = Math.ceil(d0 / tick) * tick; y <= d1; y += tick) {
    const x = crisp(y)
    line(x, TICK_TOP, h)
    const label = yearLabel(y),
      tw = g.measureText(label).width
    if (x + 2 + tw <= w && x + 2 >= lastEnd + 4) {
      g.fillText(label, x + 2, LABEL_BASELINE)
      lastEnd = x + 2 + tw
    }
  }

  // события: штрих на год, выше при нескольких
  const count = new Map<number, number>()
  for (const y of EV_YEARS) if (y >= d0 && y <= d1) count.set(y, (count.get(y) ?? 0) + 1)
  for (const [y, n] of count) {
    const near = Math.abs(y - year) <= win
    g.strokeStyle = MASTER_YEARS.has(y) ? MASTER_COLOR : (YEAR_COLOR.get(y) ?? TL_DEFAULT_STROKE)
    g.lineWidth = near || MASTER_YEARS.has(y) ? 2.5 : 1.5
    line(crisp(y), 0, Math.min(EVENT_STROKE_MAX, EVENT_STROKE_BASE + n * EVENT_STROKE_PER_EVENT))
  }

  // окно ±win и текущий год
  g.fillStyle = TL_GOLD + '33'
  g.fillRect(y2x(year - win), 0, Math.max(1, y2x(year + win) - y2x(year - win)), h)
  if (hover !== null && count.has(hover)) {
    g.strokeStyle = INK_COLOR
    g.lineWidth = 3
    line(crisp(hover), 0, 20)
  }
  const xc = y2x(year)
  g.fillStyle = INK_COLOR
  g.fillRect(xc - 1, 0, 2, h)
  g.beginPath()
  g.moveTo(xc - 5, 0)
  g.lineTo(xc + 5, 0)
  g.lineTo(xc, 6)
  g.fill()
}
