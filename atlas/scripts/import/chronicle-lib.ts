// Чистые функции сборки хроники: склейка дублей, точность даты, слухи, смена владения.
export type R = Record<string, any>

const STOP = new Set([
  'на',
  'из',
  'при',
  'для',
  'над',
  'под',
  'как',
  'что',
  'его',
  'она',
  'они',
  'вне',
  'или',
  'без',
  'про',
  'все',
  'вся',
  'все',
  'это',
  'так',
  'уже',
  'ещё',
  'еще',
  'был',
  'была',
  'были',
  'после',
  'перед',
  'между',
])
// Слишком общие основы: один такой токен не повод склеивать события.
const GENERIC = new Set(['война', 'битва', 'основ', 'смерт', 'правл', 'созда', 'восст', 'догов', 'гибел', 'начал'])
const MONTH_RE = /(январ|феврал|март|апрел|ма[яй]|июн|июл|август|сентябр|октябр|ноябр|декабр)/i

export const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е')
export function stems(title: string): string[] {
  const out = norm(title)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w))
    .map((w) => w.slice(0, 5))
  return [...new Set(out)]
}
const monthsIn = (t: string) => new Set([...norm(t).matchAll(new RegExp(MONTH_RE, 'gi'))].map((m) => m[1].slice(0, 3)))

export function titleSimilar(a: string, b: string, placesA: string[] = [], placesB: string[] = []): boolean {
  const ma = monthsIn(a),
    mb = monthsIn(b)
  if (ma.size && mb.size && ![...ma].some((x) => mb.has(x))) return false // «Май 1005» ≠ «Июнь 1005»
  const sa = stems(a),
    sb = stems(b)
  if (!sa.length || !sb.length) return false
  const common = sa.filter((x) => sb.includes(x))
  const min = Math.min(sa.length, sb.length),
    union = new Set([...sa, ...sb]).size
  // слабое совпадение (два общих слова в длинном составном названии) — только если места пересекаются или у одной стороны мест нет
  if (
    common.length <= 2 &&
    Math.max(sa.length, sb.length) >= 5 &&
    placesA.length &&
    placesB.length &&
    !placesA.some((p) => placesB.includes(p))
  )
    return false
  if (common.length >= 2 && common.length / min >= 0.67) return true
  if (
    common.length >= 1 &&
    min === 1 &&
    !GENERIC.has(common[0]) &&
    common.length / min === 1 &&
    Math.max(sa.length, sb.length) <= 6
  )
    return true
  return common.length / union >= 0.5 && common.length >= 2
}

const fuzzy = (e: R) => e.date_precision === 'approx' || e.date_precision === 'decade'
export function yearsCompatible(a: R, b: R): boolean {
  if (a.year == null || b.year == null) return false
  if (a.year === b.year) return true
  return Math.abs(a.year - b.year) <= 5 && (fuzzy(a) || fuzzy(b))
}

export const richness = (e: R) =>
  (e.sources?.length ?? 0) * 3 +
  (e.description ? 2 : 0) +
  (e.places?.length ?? 0) +
  (e.confidence === 'canon' ? 1 : 0) +
  Math.min((e.title ?? '').length, 80) / 80

/** Жадная кластеризация вокруг «головы» (самой богатой записи): цепочек нет. Возвращает [голова, ...члены]. */
export function cluster(events: R[]): R[][] {
  const order = [...events].sort((a, b) => richness(b) - richness(a))
  const groups: R[][] = []
  const dated = order.filter((e) => e.year != null),
    undated = order.filter((e) => e.year == null)
  for (const e of dated) {
    const g = groups.find((g) => yearsCompatible(g[0], e) && titleSimilar(g[0].title, e.title, g[0].places, e.places))
    if (g) g.push(e)
    else groups.push([e])
  }
  for (const e of undated) {
    // без года: только по названию, в ту же группу, если однозначно
    const hits = groups.filter((g) => titleSimilar(g[0].title, e.title, g[0].places, e.places))
    if (hits.length === 1) hits[0].push(e)
    else groups.push([e])
  }
  return groups
}

const RANK: Record<string, number> = { approx: 1, decade: 2, year: 3, month: 4, day: 5 }
const MON = '(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)'
export function precisionOf(text: string | undefined, year: number | null): string {
  const t = (text ?? '').trim()
  if (year == null) return 'approx'
  if (!t) return 'year'
  if (/≈|~|около|примерно|прибл|вывод|между|\?|неизвестн|по слухам/i.test(t)) return 'approx'
  if (/\d0-е(?!\p{L})|\d0-х(?!\p{L})|десятилет/iu.test(t)) return 'decade'
  if (/\d{3,4}\s*[–—-]\s*\d{3,4}/.test(t)) return 'year' // диапазон лет: дата начала — год
  if (new RegExp(`(?<!до |после )\\b\\d{1,2}\\s+${MON}`, 'i').test(t) || /\d{1,2}\.\d{1,2}\.\d{2,4}/.test(t))
    return 'day'
  if (MONTH_RE.test(t) || /(?<!\p{L})(осень|зима|лето|весна|осенью|зимой|летом|весной)(?!\p{L})/iu.test(t))
    return 'month'
  return 'year'
}
export function mergedPrecision(head: R, members: R[]): string {
  if (head.date_precision === 'approx') return 'approx'
  let best = head.date_precision as string
  for (const m of members)
    if (m.year === head.year && m.date_precision !== 'approx' && RANK[m.date_precision] > RANK[best])
      best = m.date_precision
  return best
}

const RUMOR =
  /по слух(ам|у)|(?<!\p{L})слух(и|ов|ах|а|у)?(?!\p{L})|ходят слух|(?<!\p{L})говорят(?!\p{L})|тайн\p{L}* цел/iu
export const isRumorEvent = (e: R) =>
  RUMOR.test(`${String(e.title ?? '').replace(/\([^)]*\)/g, '')} ${e.date_text ?? ''}`)

// ---------- смена владения ----------
export type PlaceRef = { id: string; name: string; aliases?: string[] }
const words = (s: string) =>
  norm(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => w.slice(0, 5) + Math.min(w.length, 9))
const wordOk = (h: string, n: string) => h.slice(0, 5) === n.slice(0, 5) && Math.abs(+h.slice(5) - +n.slice(5)) <= 1
const GENERIC_NAMES = new Set(['пустыня', 'северная', 'южная', 'граница', 'река', 'лес', 'гора', 'остров'])
function containsSeq(hay: string[], needle: string[]) {
  if (!needle.length) return false
  for (let i = 0; i + needle.length <= hay.length; i++) if (needle.every((w, j) => wordOk(hay[i + j], w))) return true
  return false
}
/** id мест, названных во фрагменте. Сначала места самого события, потом реестр (только длинные имена). */
export function resolvePlaces(fragment: string, own: PlaceRef[], all: PlaceRef[]): string[] {
  const hay = words(fragment)
  const hits: { id: string; len: number; key: string }[] = []
  const tryList = (list: PlaceRef[], minChars: number) => {
    for (const p of list) {
      for (const nm of [p.name, ...(p.aliases ?? [])]) {
        const base = nm.replace(/\s*\([^)]*\)/g, '')
        const key = words(base)
        if (
          key.join('').length < minChars + key.length * 1 ||
          (key.length === 1 && GENERIC_NAMES.has(norm(base).trim()))
        )
          continue
        const kk = key.join(' ')
        if (containsSeq(hay, key) && !hits.some((h) => h.id === p.id || h.key === kk))
          hits.push({ id: p.id, len: key.length, key: kk })
      }
    }
  }
  tryList(own, 4)
  tryList(all, 5)
  // вложенные имена («Берсан» внутри «Сфера Берсана…») не дублируем: оставляем самые длинные при пересечении id уже учтено
  return hits.sort((a, b) => b.len - a.len).map((h) => h.id)
}

// Государства с полигоном в data/geo/states-1006.geojson: алиасы из текста → каноническое имя + id государства.
export const POLITIES: { name: string; id?: string; re: RegExp }[] = [
  {
    name: 'Иллиорская империя',
    id: 'countries/illior_empire/index',
    re: /^(иллиорская империя|иллиорской империи|империя|империи|имперская|империю)$/,
  },
  { name: 'Иллиорский союз', re: /^иллиорский союз$/ },
  { name: 'Королевство Гросс', id: 'countries/gross/index', re: /^(королевство )?(гросс|гросса|гроссу)$/ },
  { name: 'Королевство Ройо', id: 'countries/rojo/index', re: /^(королевство )?ройо$/ },
  { name: 'Княжество Игни', id: 'countries/igni/index', re: /^(княжество )?игни$/ },
  { name: 'Княжество Энфорис', id: 'countries/enforis/index', re: /^(княжество )?(энфорис|энфориса|энфорису)$/ },
  {
    name: 'Вышневодское княжество',
    id: 'countries/vishnevodskoye_principality/index',
    re: /^(вышневодское княжество|вышневодск|вышневодска|вышневодцы)$/,
  },
  { name: 'Королевство Занра', id: 'countries/zanra/index', re: /^(королевство )?(занра|занры|занру)$/ },
  { name: 'Республика Дринрог', id: 'countries/drinrog/index', re: /^(республика )?(дринрог|дринрога)$/ },
  { name: 'Этель', id: 'countries/ethel/index', re: /^(этель|этеля)$/ },
  { name: 'Залесское княжество', id: 'countries/zalessk/index', re: /^(залесское княжество|залесск|залесска)$/ },
  { name: 'Земли Хрэлл', id: 'countries/khrell/index', re: /^(земли хрэлл|хрэлл|хрэлла)$/ },
  { name: 'Арност', id: 'countries/arnost/index', re: /^(арност|арноста|арностом)$/ },
  { name: 'Махаратха', id: 'countries/makharatkha/index', re: /^(махаратха|махаратхи|махаратху)$/ },
  { name: 'Бастионный союз', id: 'countries/bastion_union/index', re: /^бастионный союз$/ },
  { name: 'Друидова пуща', id: 'countries/druid_s_grove/index', re: /^(друидова пуща|пуща|пущи)$/ },
]
export const polityId = (name: string): string | undefined => POLITIES.find((p) => p.name === name)?.id
const CASE: Record<string, string> = { иллиора: 'Иллиор', олигархии: 'Олигархия', элке: 'Элка', джоку: 'Джок' }
export const polityName = (s: string) => {
  const t = s.trim().replace(/^(де-факто|официально|временно)\s+/i, '')
  const k = norm(t)
  if (CASE[k]) return CASE[k]
  for (const p of POLITIES) if (p.re.test(k)) return p.name
  return t.charAt(0).toUpperCase() + t.slice(1)
}
const ADV = '(?:навсегда |официально |де-факто |временно |фактически )?'
const GAIN = new RegExp(
  `^(.{2,40}?)\\s+${ADV}(получает|получил[аи]?|приобрета[её]т|приобрела|приобрёл|берёт|захватывает|получили)\\s+(.+)$`,
  'i',
)
const LOSS = new RegExp(`^(.{2,40}?)\\s+${ADV}(теряет|потеряла|потеряли|потерял|лишается)\\s+(.+)$`, 'i')
const LOSS_PRON = /^(.{2,40}?)\s+лишилось\s+их$/i
const LEAVE = /^(.+?)\s+(?:выходят?|выходит|отпадают?|отделя(?:ется|ются)|уходят?)\s+(?:из|от)\s+(империи|союза)$/i
const LEAVE2 = /^(.+?)\s+отделены\s+от\s+(империи)$/i
const JOIN = /^(.+?)\s+(?:входит|входят|вступает|вступают)\s+в\s+(Иллиорский союз|империю)/i
const JOIN2 = /^(.+?)\s+в\s+(Иллиорском союзе)/i
const TO = /^(.+?)\s+(?:переходит|перешёл|перешла)\s+(?:к|под власть)\s+(.+)$/i
const AT = /^(.+?)\s+(?:у|к)\s+(Игни|Джоку|[А-ЯЁ][а-яё]+)$/
const DASH = /^(?:весь\s+)?(.+?)\s+[—–-]\s+(Игни)$/i

export type Holder = { polity: string; polity_id?: string; places: string[] }
export const addHolder = (list: Holder[], polity: string, places: string[], allowEmpty = false) => {
  if ((!places.length && !allowEmpty) || !polity || polity.split(/\s+/).length > 4) return
  const ex = list.find((x) => x.polity === polity)
  if (ex) ex.places = [...new Set([...ex.places, ...places])]
  else {
    const id = polityId(polity)
    list.push(id ? { polity, polity_id: id, places } : { polity, places })
  }
}

export function parseTerritory(
  text: string,
  own: PlaceRef[],
  all: PlaceRef[],
): { gains: Holder[]; losses: Holder[]; note: string } {
  const gains: Holder[] = [],
    losses: Holder[] = []
  const add = (list: Holder[], polity: string, places: string[]) => addHolder(list, polity, places)
  let last: string[] = []
  for (const raw of text.split(/;\s*/)) {
    const clause = raw.replace(/\s*\([^)]*\)/g, '').trim()
    let m: RegExpMatchArray | null
    const res = (s: string) => resolvePlaces(s, own, all)
    if ((m = clause.match(LOSS_PRON))) {
      add(losses, polityName(m[1]), last)
      continue
    }
    if ((m = clause.match(GAIN))) {
      const p = res(m[3])
      add(gains, polityName(m[1]), p)
      last = p
      continue
    }
    if ((m = clause.match(LOSS))) {
      const p = res(m[3])
      add(losses, polityName(m[1]), p)
      last = p
      continue
    }
    if ((m = clause.match(LEAVE) ?? clause.match(LEAVE2))) {
      const p = res(m[1])
      add(losses, 'Иллиорская империя', p)
      last = p
      continue
    }
    if ((m = clause.match(JOIN) ?? clause.match(JOIN2))) {
      const p = res(m[1])
      add(gains, /союз/i.test(m[2]) ? 'Иллиорский союз' : 'Иллиорская империя', p)
      last = p
      continue
    }
    if ((m = clause.match(TO))) {
      const p = res(m[1])
      add(gains, polityName(m[2]), p)
      last = p
      continue
    }
    if ((m = clause.match(DASH))) {
      const p = res(m[1])
      add(gains, polityName(m[2]), p)
      last = p
      continue
    }
    if ((m = clause.match(AT)) && !/^(не|без)/i.test(clause)) {
      const p = res(m[1])
      add(gains, polityName(m[2]), p)
      last = p
      continue
    }
  }
  return { gains, losses, note: text }
}
