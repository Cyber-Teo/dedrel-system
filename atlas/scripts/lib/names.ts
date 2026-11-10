// Чистые функции сопоставления названий: газеттир ↔ реестр ↔ вики.
const PREFIX = /^(?:р|г|о|оз|п-ов|пос|гора|мыс)\.\s*/

/** Нормализация: ё→е, регистр, без мягких переносов, без префикса «р.»/«г.»/«о.» и хвоста в скобках. */
export function normName(s: string): string {
  let t = s
    .replace(/[\u00ad\u200b]/g, '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .trim()
  t = t.replace(PREFIX, '').replace(/\s*\([^)]*\)\s*$/, '')
  return t.replace(/[^\p{L}\p{N}?]+/gu, ' ').trim()
}

export function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[n]
}

/** «?» в подписи растра — неразобранный кусок (1+ букв). Подходит ли полное имя `full` под образец. */
export function wildcardMatch(pattern: string, full: string): boolean {
  if (!pattern.includes('?')) return pattern === full
  const re = pattern
    .split(/\?+/)
    .map((p) => p.replace(/[.*+^${}()|[\]\\]/g, '\\$&'))
    .join('.+')
  return new RegExp(`^${re}$`).test(full)
}

const CLASS: Record<string, string> = {
  city: 's',
  capital: 's',
  fortress: 's',
  port: 's',
  village: 's',
  ruin: 's',
  school: 's',
  temple: 's',
  mine: 's',
  region: 'a',
  country: 'a',
  country_label: 'a',
}
// 3 — тот же вид, 2 — тот же класс (поселение/область), 1 — нейтральный «other», 0 — несовместимо
export const kscore = (gk: string, pk: string) =>
  gk === pk ? 3 : CLASS[gk] && CLASS[gk] === CLASS[pk] ? 2 : pk === 'other' || gk === 'other' ? 1 : 0
export const cls = (k: string) => CLASS[k] ?? k
