// Включённые слои в хеше: l=a,b,c (ключ l; остальные ключи хеша не трогаем).
// Слои истории (politics, landscape) живут в том же ключе l, но ими управляет src/history/ui.tsx: LayersUI их не затирает.
export const HISTORY_LAYERS = ['politics', 'landscape'] as const
/** Набор по умолчанию: действует, пока в хеше нет ключа l. Пустой набор пишется явно как l=none. */
export const DEFAULT_LAYERS: readonly string[] = ['world-miniatures', 'places-ranked']
export const NONE = 'none'
export const hasLayerKey = (h: string): boolean => new URLSearchParams(h.replace(/^#/, '')).has('l')
const rawTokens = (h: string): string[] =>
  (new URLSearchParams(h.replace(/^#/, '')).get('l') ?? '').split(',').filter((t) => t && t !== NONE)
const tokens = (h: string): string[] => (hasLayerKey(h) ? rawTokens(h) : [...DEFAULT_LAYERS])
const put = (h: string, ids: string[]): string => {
  const p = new URLSearchParams(h.replace(/^#/, ''))
  p.delete('l')
  const rest = p.toString()
  return '#' + [rest, `l=${ids.length ? ids.join(',') : NONE}`].filter(Boolean).join('&')
}
export const readLayerIds = (h: string): string[] =>
  tokens(h).filter((t) => !(HISTORY_LAYERS as readonly string[]).includes(t))
export const readHistoryLayers = (h: string): { politics: boolean; landscape: boolean } => {
  const t = tokens(h)
  return { politics: t.includes('politics'), landscape: t.includes('landscape') }
}
const histTokens = (h: string) => tokens(h).filter((t) => (HISTORY_LAYERS as readonly string[]).includes(t))
export const withLayerIds = (h: string, ids: string[]): string => put(h, [...ids, ...histTokens(h)])
export const withHistoryLayers = (h: string, s: { politics: boolean; landscape: boolean }): string =>
  put(h, [...readLayerIds(h), ...HISTORY_LAYERS.filter((k) => s[k])])
