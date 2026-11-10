// Формат лет: года 0 нет, отрицательные годы — до победы над Асмодеем.
import { YEAR_MAX, YEAR_MIN } from './eras'

/** Года 0 нет: 0 читаем как 1 н. э. */
export const normalizeYear = (y: number) => (y === 0 ? 1 : y)

/** Год в пределах шкалы, без нуля. */
export const clampYear = (y: number) => normalizeYear(Math.max(YEAR_MIN, Math.min(YEAR_MAX, y)))

/** Единый короткий формат года: «−300», «1005». Пояснение — yearTitle. */
export const yearLabel = (y: number) => {
  const n = normalizeYear(y)
  return n < 0 ? `−${-n}` : String(n)
}

export const yearTitle = (y: number) => {
  const n = normalizeYear(y)
  return n < 0 ? `${-n} до победы над Асмодеем` : n >= YEAR_MAX ? `${n} год, наше время` : `${n} год`
}

/** Год для связного текста: «в 1005 г.», «−300 г.». */
export const yearG = (y: number) => `${yearLabel(y)} г.`

/** Диапазон: «−500 – 1», «818 – н. в.» (правая граница ≥ YEAR_MAX — «наше время»). */
export const rangeLabel = (a: number, b: number) => `${yearLabel(a)} – ${b >= YEAR_MAX ? 'н. в.' : yearLabel(b)}`
