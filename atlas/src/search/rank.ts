// Нормализация и ранжирование поиска: чистые функции, без данных и карты.
export type Group = 'place' | 'polity' | 'person' | 'org' | 'event'
export type Entry = {
  id: string
  group: Group
  name: string
  aliases: string[]
  sub: string
  year?: number
  icon?: string
  kind?: string
  conf?: string
  nomap?: boolean
}
export type Hit = { entry: Entry; score: number; via?: string }

/** Нижний регистр, ё→е, всё кроме букв и цифр — пробел. */
export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/** Год из запроса по исходной строке (до norm, иначе минус теряется): «-500», «−500», «500 до победы» → −500; «1005» → 1005. */
export function parseYear(raw: string): number | null {
  const m =
    /^\s*([-−–—])?\s*(\d{1,4})\s*(до\s+победы(?:\s+над\s+асмодеем)?|до\s+п\.?|до\s+н\.?\s*э\.?|г\.?|года?)?\s*$/i.exec(
      raw,
    )
  if (!m) return null
  const n = Number(m[2]),
    before = !!m[1] || (!!m[3] && /^до/i.test(m[3]))
  return before ? -n : n
}

export const GROUP_ORDER: Group[] = ['place', 'polity', 'person', 'org', 'event']
const GROUP_BONUS: Record<Group, number> = { place: 25, polity: 30, person: 25, org: 15, event: 0 }
export const GROUP_NAME: Record<Group, string> = {
  place: 'Места',
  polity: 'Государства',
  person: 'Люди',
  org: 'Организации',
  event: 'События',
}

/** Оценка одного текста: все слова запроса должны входить; 100 — полное совпадение, 80 — начало, 60 — начало слова, 40 — вхождение. */
function scoreText(text: string, q: string, words: string[]): number {
  if (text === q) return 100
  const tw = text.split(' ')
  let sum = 0
  for (const w of words) {
    if (tw.includes(w)) sum += 60
    else if (tw.some((t) => t.startsWith(w))) sum += 55
    else if (text.includes(w)) sum += 40
    else return 0
  }
  const base = sum / words.length
  return text.startsWith(q) ? Math.max(base, 80) : base
}

/** Название государства без типа в начале («Королевство Гросс» → «гросс»): запрос «Гросс» — это оно, а не регион. */
const POLITY_TYPE = /^(королевство|княжество|республика|герцогство|царство|халифат|союз)\s+/
const polityCore = (name: string) => norm(name.replace(/\s*\(.*?\)/g, '')).replace(POLITY_TYPE, '')
/** Регионы-дубли («Гросс», «Центральный Гросс», «Центральный регион Гросс») имеют общий ключ: без слов «регион» и «центральный». */
const regionKey = (name: string) =>
  norm(name)
    .split(' ')
    .filter((w) => !/^(регион|центральн\p{L}*)$/u.test(w))
    .join(' ')

/** Все совпадения по группам (без обрезки), группы — по лучшей оценке, внутри — по оценке; повторы (группа+имя+подпись) убраны. */
export function searchGroups(index: Entry[], query: string): { group: Group; hits: Hit[] }[] {
  const q = norm(query)
  if (!q) return []
  const words = q.split(' ')
  const asYear = parseYear(query)
  const hits: Hit[] = []
  for (const entry of index) {
    let best = scoreText(norm(entry.name), q, words),
      via: string | undefined
    for (const a of entry.aliases) {
      // человек, найденный лишь по прозвищу/связи («Некромант» для запроса «Арност»), ниже государства и места
      const s = scoreText(norm(a), q, words) - 5 - (entry.group === 'person' ? 20 : 0)
      if (s > best) {
        best = s
        via = a
      }
    }
    if (entry.group === 'polity') {
      const c = polityCore(entry.name)
      if (c === q && POLITY_TYPE.test(norm(entry.name))) best = Math.max(best, 100)
    }
    if (asYear !== null && entry.group === 'event' && entry.year === asYear) best = Math.max(best, 50)
    // люди с годом (один род): при равной оценке — по началу правления; иначе короткое имя выше
    const tie =
      entry.group === 'person' && entry.year !== undefined
        ? (entry.year + 2000) / 1e5
        : Math.min(entry.name.length, 60) / 100
    if (best > 0) hits.push({ entry, score: best - tie - (entry.nomap ? 20 : 0), via })
  }
  hits.sort((a, b) => b.score - a.score)
  // повторы: одна и та же запись; событие с тем же названием и годом; место и организация с тем же названием и видом («Иллиорская коллегия бардов») — остаётся место (оно на карте)
  const seen = new Set<string>(),
    placeKinds = new Set(
      hits.filter((h) => h.entry.group === 'place' && h.entry.kind).map((h) => `${norm(h.entry.name)}|${h.entry.kind}`),
    )
  const uniq = hits.filter((h) => {
    const e = h.entry
    if (e.group === 'place' && e.kind === 'region') {
      const rk = `region|${regionKey(e.name)}`
      if (seen.has(rk)) return false
      seen.add(rk)
    }
    if (e.group === 'org' && e.kind && placeKinds.has(`${norm(e.name)}|${e.kind}`)) return false
    const k = e.group === 'event' ? `event|${norm(e.name)}|${e.year}` : `${e.id}|${e.group}|${norm(e.name)}|${e.sub}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  const groups = GROUP_ORDER.map((g) => ({ group: g, hits: uniq.filter((h) => h.entry.group === g) })).filter(
    (g) => g.hits.length,
  )
  // группа с лучшей оценкой — первая (при равенстве — порядок GROUP_ORDER)
  return groups.sort((a, b) => b.hits[0].score + GROUP_BONUS[b.group] - (a.hits[0].score + GROUP_BONUS[a.group]))
}

export function search(index: Entry[], query: string, perGroup = 6): Hit[] {
  return searchGroups(index, query).flatMap((g) => g.hits.slice(0, perGroup))
}
