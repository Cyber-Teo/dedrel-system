// Отрезки шкалы: эпохи и пробелы между ними, их цвета и подписи.
import { ERAS, SEGS, eraOf, type Seg } from '../events'

const SEG_COLORS = ['#c9a44c', '#8c1c13', '#5a3b1c', '#6e6a3a', '#3f4f5a']
const GAP_COLOR = '#b9ad8e'
/** Светлые заливки, на которых подпись тёмная. */
const DARK_TXT = new Set(['#c9a44c', GAP_COLOR])
const LABEL_TEXT_DARK = '#2b1a0e'
const LABEL_TEXT_LIGHT = '#fff6dc'
/** Средняя ширина символа подписи, px. */
const CHAR_PX = 6.4

export const segColor = (s: Seg) =>
  s.gap ? GAP_COLOR : SEG_COLORS[ERAS.findIndex((e) => e.name === s.name) % SEG_COLORS.length]
export const segTextColor = (s: Seg) => (DARK_TXT.has(segColor(s)) ? LABEL_TEXT_DARK : LABEL_TEXT_LIGHT)

/** Подпись отрезка под ширину: полная → сокращённая («Нов. время»); короче трёх символов не показываем (инициалы и «?» ничего не говорят). */
export function segText(s: Seg, wpx: number): string {
  if (s.gap) return ''
  if (wpx >= s.name.length * CHAR_PX + 10) return s.name
  const [a, ...rest] = s.name.split(' ')
  const short = rest.length ? `${a.slice(0, 3)}. ${rest.join(' ')}` : a.slice(0, 4) + '.'
  return wpx >= short.length * CHAR_PX + 8 && short.length >= 3 ? short : ''
}

/** Короткое имя безымянного промежутка для чипов: «неизв. 515–553». */
export const chipName = (s: Seg) => (s.gap ? s.name.replace('неизвестный период', 'неизв.') : s.name)

export const segmentLabel = (y: number) => SEGS.find((s) => y >= s.from && y <= s.to && !s.gap)?.name ?? eraOf(y)
