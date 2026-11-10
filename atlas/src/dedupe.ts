// Страховочная склейка дублей хроники на лету. Основные слияния делает scripts/import/build-chronicle.ts (MERGES),
// поэтому правило строгое: лучше оставить два события, чем потерять разные.
export type DedupeEv = {
  id: string
  year: number | null
  title: string
  places: string[]
  sources: string[]
  master?: boolean
  actors?: { name: string }[]
  description?: string
}
/** Заголовок длиннее этого при склейке уходит в description, остаётся короткий. */
export const MAX_TITLE = 90
/** Сходство названий (Жаккар по основам слов) для строгой склейки. */
const TITLE_SIM_STRICT = 0.8
/** Минимальная близость названий, когда места и участники совпадают целиком. */
const TITLE_SIM_LOOSE = 0.2
/** Склейка второго уровня применяется только к коротким заголовкам. */
const SHORT_TITLE_LEN = 60
/** Доля слов короткого заголовка, которые должны войти в длинный. */
const SUBSET_RATIO = 0.65
/** Нормализация названия: нижний регистр, без знаков, слова ≥3 букв без окончаний (основа 5 знаков), без «год/лет». */
export const titleStems = (title: string): string[] =>
  (
    title
      .toLowerCase()
      .replace(/ё/g, 'е')
      .match(/[а-я]{3,}/g) ?? []
  )
    .filter((w) => !/^(год|года|году|годы|лет)$/.test(w))
    .map((w) => w.slice(0, 5))
/** Сходство названий: коэффициент Жаккара по основам слов (0…1). */
export function titleSim(a: string, b: string): number {
  const x = new Set(titleStems(a)),
    y = new Set(titleStems(b))
  if (!x.size || !y.size) return 0
  const k = [...x].filter((w) => y.has(w)).length
  return k / (x.size + y.size - k)
}
const sameSet = (a: string[], b: string[]) => a.length > 0 && a.length === b.length && a.every((v) => b.includes(v))
const names = (e: DedupeEv) => [...new Set((e.actors ?? []).map((a) => a.name))]
const ROMAN = /^[ivxlc]+$/
/** Слова заголовка для склейки второго уровня: слова ≥3 букв и римские цифры (XXIII ≠ XXIV). */
const words = (t: string) =>
  (
    t
      .toLowerCase()
      .replace(/ё/g, 'е')
      .match(/[a-zа-я]+/g) ?? []
  ).filter((w) => (w.length >= 3 || ROMAN.test(w)) && !/^(год|года|году|годы|лет)$/.test(w))
const sameWord = (a: string, b: string) =>
  ROMAN.test(a) || ROMAN.test(b)
    ? a === b
    : Math.min(a.length, b.length) >= 3 &&
      a.slice(0, Math.min(4, a.length, b.length)) === b.slice(0, Math.min(4, a.length, b.length))
// «нежи|арно» — не служебные слова, а исключение под данные хроники: без него склеиваются разные события этих персонажей.
const GENERIC =
  /^(поход|война|войны|битва|смерть|гибель|правление|король|корол|королева|император|импер|выборы|союз|начало|конец|становится|город|земли|нежи|арно)/
const romans = (w: string[]) =>
  w
    .filter((x) => ROMAN.test(x))
    .sort()
    .join(',')
const firstName = (n: string) => n.toLowerCase().replace(/ё/g, 'е').split(/\s+/)[0].slice(0, 5)
const shareActor = (a: DedupeEv, b: DedupeEv) => {
  const s = new Set(names(a).map(firstName))
  return names(b).some((n) => s.has(firstName(n)))
}
/** Склейка второго уровня: тот же год, общее место и тот же предмет — либо одинаковое начало заголовка («Огненная чума …»), либо два коротких заголовка, где короткий почти целиком входит в другой, и есть общий участник. */
export function isDuplicate2(a: DedupeEv, b: DedupeEv): boolean {
  if (a.year !== b.year || !a.places.some((p) => b.places.includes(p))) return false
  const x = words(a.title),
    y = words(b.title)
  if (x.length < 2 || y.length < 2 || romans(x) !== romans(y)) return false
  if (sameWord(x[0], y[0]) && sameWord(x[1], y[1]) && !ROMAN.test(x[1])) return true
  if (a.title.length > SHORT_TITLE_LEN || b.title.length > SHORT_TITLE_LEN) return false
  const [s, l] = x.length <= y.length ? [x, y] : [y, x]
  const k = s.filter((w) => l.some((v) => sameWord(w, v))).length
  const named = s.filter((w) => !GENERIC.test(w) && l.some((v) => sameWord(w, v))).length // общие слова, кроме служебных («поход», «король»…)
  return k >= 2 && named >= 2 && k / s.length >= SUBSET_RATIO && shareActor(a, b)
}
/** Дубль: тот же год И (сходство названий ≥ TITLE_SIM_STRICT ИЛИ места и участники совпадают целиком при хоть какой-то близости названий) ИЛИ склейка второго уровня. */
export const isDuplicate1 = (a: DedupeEv, b: DedupeEv): boolean =>
  a.year === b.year &&
  (titleSim(a.title, b.title) >= TITLE_SIM_STRICT ||
    (sameSet(a.places, b.places) && sameSet(names(a), names(b)) && titleSim(a.title, b.title) >= TITLE_SIM_LOOSE))
export const isDuplicate = (a: DedupeEv, b: DedupeEv): boolean => isDuplicate1(a, b) || isDuplicate2(a, b)

export type Merge<T> = { kept: T; dropped: T }
/** Склейка дублей. Заголовок: длиннее — для сходных (≤ MAX_TITLE знаков), короткий — если длинный превышает MAX_TITLE или это склейка второго уровня; длинный уходит в description. Места/источники объединяются. onMerge — для отчёта. */
export function dedupeEvents<T extends DedupeEv>(list: T[], onMerge?: (m: Merge<T>) => void): T[] {
  const out: T[] = []
  for (const e of list) {
    const i = out.findIndex((o) => isDuplicate(o, e))
    if (i < 0) {
      out.push(e)
      continue
    }
    const o = out[i],
      lvl2 = !isDuplicate1(o, e)
    const [lo, sh] = e.title.length > o.title.length ? [e, o] : [o, e] // lo — длинный заголовок
    const [keep, other] = lvl2 || lo.title.length > MAX_TITLE ? [sh, lo] : [lo, sh]
    onMerge?.({ kept: keep, dropped: other })
    const desc = keep.description ?? other.description
    const note = other.title.length > keep.title.length && !(desc ?? '').includes(other.title) ? `${other.title}.` : ''
    out[i] = {
      ...keep,
      places: [...new Set([...keep.places, ...other.places])],
      sources: [...new Set([...keep.sources, ...other.sources])],
      master: keep.master || other.master || undefined,
      ...(note || desc ? { description: [note, desc].filter(Boolean).join(' ') } : {}),
    }
  }
  return out
}
