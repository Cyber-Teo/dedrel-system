import { MAX_ZOOM, MIN_ZOOM, type Px } from './geo/pixel'
import { normalizeYear } from './chronicle/yearFormat'

export type Mode = 'drawn' | 'muted'
export type View = { center: Px; zoom: number; mode: Mode }

export const DEFAULT_VIEW: View = { center: [3960, 2980], zoom: 1.5, mode: 'drawn' }

/** Параметры хеша адресной строки (без ведущего «#»). Единственное место разбора хеша. */
export const hashParams = (h: string = location.hash): URLSearchParams => new URLSearchParams(h.replace(/^#/, ''))

export function parseHash(h: string): View {
  const p = hashParams(h)
  const x = Number(p.get('cx')),
    y = Number(p.get('cy')),
    z = Number(p.get('z'))
  const ok = p.has('cx') && p.has('cy') && p.has('z') && [x, y, z].every(Number.isFinite)
  return {
    center: ok ? [x, y] : DEFAULT_VIEW.center,
    zoom: ok ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z)) : DEFAULT_VIEW.zoom,
    mode: p.get('m') === 'muted' ? 'muted' : 'drawn',
  }
}

/** Единый сериализатор: запятые и двоеточия в значениях (l=a,b; ключи вида id:state) не кодируются. */
export const ser = (p: URLSearchParams | string): string =>
  '#' + p.toString().replace(/%2C/gi, ',').replace(/%3A/gi, ':')

// Центр карты — cx, cy; год — y (см. withYear). Чужие ключи хеша (например l — включённые слои) сохраняются как есть.
export function formatHash(v: View, current = typeof location === 'undefined' ? '' : location.hash): string {
  const own = `cx=${Math.round(v.center[0])}&cy=${Math.round(v.center[1])}&z=${v.zoom.toFixed(2)}&m=${v.mode}`
  const rest = hashParams(current)
  for (const k of ['cx', 'cy', 'z', 'm']) rest.delete(k)
  const l = rest.get('l')
  rest.delete('l')
  return '#' + [own, ser(rest).slice(1), l ? `l=${l}` : ''].filter(Boolean).join('&')
}

/** Год в хеше: y=500 (ключ y; остальные ключи не трогаем). */
export function readYear(h: string): number | null {
  const v = hashParams(h).get('y')
  return v !== null && v !== '' && Number.isFinite(Number(v)) ? normalizeYear(Math.round(Number(v))) : null
}
export function withYear(h: string, year: number): string {
  const p = hashParams(h)
  p.set('y', String(year))
  return ser(p)
}
