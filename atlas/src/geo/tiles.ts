// Адреса растровой подложки. Относительно страницы, а не origin: атлас может жить в подкаталоге (BASE_URL).
import type { Mode } from '../hash'

/** Выше этого зума тайлов нет, MapLibre растягивает последний уровень. */
export const TILE_MAX_ZOOM = 6
export const TILE_SIZE = 256

/** Шаблон адреса тайлов подложки; {z}/{x}/{y} подставляет MapLibre, поэтому они добавляются после разбора URL. */
export const tileUrls = (mode: Mode): string[] => [
  new URL(`${import.meta.env.BASE_URL}tiles/${mode}/`, location.href).href + '{z}/{x}/{y}.webp',
]
