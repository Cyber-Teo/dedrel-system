// Содержимое карточек: чистые функции над текстовыми полями данных (без карты и интерфейса).
import { cleanNote, type Cleaned } from './clean'

export type Section = { title: string; items: Cleaned[] }
export type Fields = { shown: Section[]; more: Section[]; empty: string[]; plaques: string[] }

const EMPTY = /^(не указано|не указан[аоы]?|неизвестн\w*|нет данных|нет сведений|\?+|—|-)$/iu
export const isEmpty = (v?: string | null) => !v || !v.trim() || EMPTY.test(cleanNote(v).text)
/** «?» как значение → «—»: «?–1005» → «—–1005». */
export const dash = (v: string) => v.replace(/(^|[\s–-])\?+(?=$|[\s–-])/g, '$1—')

const POP = /жител|населен|тыс\.|млн|человек(?!\p{L})/iu
const POWER = /^(мэр|правител|князь|король|император(?!\p{L})|префект|градоначальник|глава(?!\p{L})|великий князь)/iu

/** Ключ для сравнения строк: без регистра и пунктуации («мэр Децимус…» = «Мэр Децимус…»). */
export const normKey = (t: string) =>
  t
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/** Темы «Показать ещё»: первое совпадение; ключевые слова с границей слева (?<!\p{L}), короткие основы — и справа («богатых» ≠ бог, «портал» ≠ порт). Скобки перед проверкой вырезаются. */
const L = '(?<!\\p{L})',
  R = '(?!\\p{L})'
export const GROUPS: [string, RegExp][] = [
  [
    'Культ и религия',
    new RegExp(
      `${L}(?:храм|культ${R}|культов|алтар|бог(?:а|и|ов|ам|ами|ах|у|ом|е)?${R}|церк|секта|сектант|религи|некромант|пантеон|жрец|ритуал)`,
      'iu',
    ),
  ],
  [
    'Власть',
    new RegExp(
      `${L}(?:мэр|император(?!ск)|сенат|управ(?:а|ы|е|у|ой)${R}|префект|правител|король|королев|князь|градоначальник|трон(?:а|у|ом|е)?${R})`,
      'iu',
    ),
  ],
  [
    'Стража и преступность',
    new RegExp(
      `${L}(?:страж|облав|преступ|тюрьм|казарм|легион|банд|убий|ассасин|капюшон|вендетт|вампир|авангард|невольнич|канализац|гарнизон)`,
      'iu',
    ),
  ],
  [
    'Гильдии и торговля',
    new RegExp(
      `${L}(?:гильди|торг|рынок|рынк|банк|монетн|таверн|бордел|порт(?:а|ы|ов|у|ом|е|ам|ах)?${R}|груз|аукцион|купц|кофе|верфи|цен(?:а|ы|у|е)${R}|караван)`,
      'iu',
    ),
  ],
  [
    'История',
    new RegExp(`${L}(?:революц|войн|упоминан|основан|Всесожжени|чум|поход)|\\d{1,4}\\s*г(?:\\.|ода?)?${R}`, 'iu'),
  ],
]
export const GROUP_REST = 'Места и здания'
export const GROUP_ORDER = [
  'Власть',
  'Органы власти',
  'Стража и преступность',
  'Гильдии и торговля',
  'Культ и религия',
  GROUP_REST,
  'История',
]
/** Запятые верхнего уровня (вне скобок и «ёлочек») — границы перечня. */
export function splitTop(t: string): string[] {
  const out: string[] = []
  let d = 0,
    cur = ''
  for (const ch of t) {
    if (ch === '(' || ch === '«') d++
    else if ((ch === ')' || ch === '»') && d > 0) d--
    if (ch === ',' && d === 0) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  out.push(cur.trim())
  return out.filter(Boolean)
}
export const groupOf = (t: string) => GROUPS.find(([, re]) => re.test(t.replace(/\([^)]*\)/g, ' ')))?.[0] ?? GROUP_REST
const COUNT_RE =
  /(\d+)\s+(таверн\p{L}*|бордел\p{L}*|рынк\p{L}*|храм\p{L}*|мост\p{L}*|порт\p{L}*|казарм\p{L}*|школ\p{L}*)/giu

/** Разбор hint/facts места по подзаголовкам. Первый кусок facts — описание на странице места, остальные — упоминания в других статьях (под «Показать ещё», по темам). */
export function placeFields(hint?: string, facts?: string, extra: string[] = [], kindText = ''): Fields {
  const shown: Section[] = [],
    more: Section[] = [],
    empty: string[] = [],
    plaques: string[] = []
  const h = isEmpty(hint) ? null : cleanNote(hint)
  if (h?.text) shown.push({ title: 'Положение и рельеф', items: [h] })
  else empty.push('Положение и рельеф')
  const pieces = [...(facts ? facts.split(' | ') : []), ...extra.flatMap((x) => x.split(' | '))]
    .map((p) => p.trim())
    .filter(Boolean)
  // атомы: по «|» и «;»; цифровые факты («26 таверн») уходят в плашки
  const atoms: { c: Cleaned; first: boolean }[] = []
  pieces.forEach((piece, i) => {
    for (const cl of piece.split(/;\s+/)) {
      let c = cleanNote(cl)
      if (!c.text || isEmpty(c.text)) continue
      const found = [...c.text.matchAll(COUNT_RE)]
      if (found.length) {
        for (const m of found) plaques.push(`${m[1]} ${m[2].toLowerCase()}`)
        const left = c.text
          .replace(COUNT_RE, '')
          .replace(/^\s*(здесь|там)\s+/iu, '')
          .replace(/[\s,]+и\s*$/u, '')
          .replace(/[\s,]+/g, ' ')
          .replace(/^[\s,]+|[\s,]+$/g, '')
        if (left.length < 3) continue
        c = { ...c, text: left }
      }
      atoms.push({ c, first: i === 0 })
    }
  })
  // дубли: равные по ключу и строки, целиком вошедшие началом в более длинную («Дворец Основателя со шпилем» ⊂ «Дворец Основателя со шпилем (залил…)»)
  const keys = atoms.map((a) => normKey(a.c.text)),
    kindKey = normKey(kindText)
  const keep = atoms.filter(
    (_, i) =>
      !!keys[i] &&
      keys[i] !== kindKey &&
      keys.indexOf(keys[i]) === i &&
      !keys.some((k, j) => j !== i && k.length > keys[i].length && k.startsWith(keys[i] + ' ')),
  )
  const pop: Cleaned[] = [],
    power: Cleaned[] = [],
    main: Cleaned[] = [],
    rest: { c: Cleaned; g: string }[] = []
  for (const { c, first } of keep) {
    if (POP.test(c.text) && c.text.length < 120) pop.push(c)
    else if (POWER.test(c.text) && c.text.length < 120) power.push(c)
    else if (first) main.push(c)
    else {
      // перечень делим по запятым до классификации; соседние части одной темы склеиваем обратно
      const runs: { g: string; t: string[] }[] = []
      for (const part of splitTop(c.text)) {
        const g = groupOf(part),
          l = runs[runs.length - 1]
        if (l && l.g === g) l.t.push(part)
        else runs.push({ g, t: [part] })
      }
      for (const r of runs) rest.push({ c: { ...c, text: r.t.join(', ') }, g: r.g })
    }
  }
  if (pop.length) shown.push({ title: 'Население', items: pop })
  else empty.push('Население')
  if (power.length) shown.push({ title: 'Власть', items: power })
  else empty.push('Власть')
  if (main.length) {
    // длинный текст: первые ~320 знаков в карточке, остальное под «Показать ещё»
    let n = 0
    const head: Cleaned[] = [],
      tail: Cleaned[] = []
    for (const c of main) {
      if (n < 320) {
        head.push(c)
        n += c.text.length
      } else tail.push(c)
    }
    shown.push({ title: 'Описание', items: head })
    if (tail.length) rest.unshift(...tail.map((c) => ({ c, g: 'Описание, продолжение' })))
  } else empty.push('Описание')
  // «Власть» в карточке уже есть (мэр) — в «ещё» та же тема называется «Органы власти»: один заголовок на имя
  const hasPower = shown.some((s) => s.title === 'Власть')
  for (const r of rest) if (r.g === 'Власть' && hasPower) r.g = 'Органы власти'
  for (const g of ['Описание, продолжение', ...GROUP_ORDER]) {
    const items = rest.filter((r) => r.g === g).map((r) => r.c)
    if (items.length) more.push({ title: g, items })
  }
  return { shown, more, empty, plaques: [...new Set(plaques)] }
}

/** Годы жизни/правления из вики-строки: «?–1005» → «—–1005»; пусто → null. */
export const yearsText = (y?: string) => (isEmpty(y) ? null : dash(y!))

/** Первый год из строки хроники: «560/562» → 560, «135–140» → 135, «−71» → −71, «?» → null. */
export function firstYear(s: string): number | null {
  const m = /^\s*[≈~]?\s*([-−–])?\s*(\d{1,4})/.exec(s)
  return m ? (m[1] ? -Number(m[2]) : Number(m[2])) : null
}

/** Срок правления из строк хроники: «560/562» + «?» → «с 560/562»; «?» + «июль 1005» → «до июля 1005»; оба неизвестны → «даты не указаны». */
export function spanText(from: string, to: string): string {
  const f = dash(from.trim()),
    t = dash(to.trim()),
    fu = isEmpty(f) || f === '—',
    tu = isEmpty(t) || t === '—' || /^—\s*\(/.test(t)
  if (fu && tu) return 'даты не указаны'
  if (tu) return `с ${f}`
  return fu ? `до ${t}` : `${f}–${t}`
}
