// Правки хроники поверх сборки: перетипирование по маске заголовка и короткие заголовки.
// Используется scripts/import/build-chronicle.ts (fixEvent на каждом событии) и как CLI: `tsx scripts/import/chronicle-fixes.ts` — применяет к data/events.yaml (идемпотентно).
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse, stringify } from 'yaml'

type R = Record<string, any>
/** Типы по маске заголовка; применяются только к type: other. Порядок важен. */
const RULES: [RegExp, string][] = [
  [/^Гибель последнего архидемона/, 'battle'],
  [/^Рождение/, 'birth'],
  [/^(Смерть|Гибель|Казнь|Самоубийство)/, 'death'],
  [/^(Дело|Процесс|Осуждение|Обвинение|Поимка|Покушение)/, 'trial'],
  [
    /^(Нападение на караван|Облава|Операция|Перехват|Удар у|Хулон в отряде|Подготовка отрядов|Эльфы (Этеля )?обучают|Опий нанимает|Уход наёмников)/,
    'battle',
  ],
  [/^(Первое упоминание|Первые записи|Самрунцы упоминают)/, 'discovery'],
  [/^(Заселение|Люди в Залесске|Исход фей|Феи затворяются)/, 'migration'],
  [/^(Ожидание конца света|Пророчества)/, 'religion'],
  [
    /^(Дипломатический визит|Дипломатическое|Лукас; дипломатическое|Путешествие Лукаса|Император Лукас в|Феи заключают союз|Феи выходят)/,
    'treaty',
  ],
  [
    /вето|[Уу]каз|^(Закон|Право|Выборы|Выбор|Появление должности|Опала|Обособление|Формальный глава|Негласная помощь|Закрытие коллегии|Судебная реформа)|избран|назначен|ректор|префект|[Аа]рхимаг|возглавляет Арканум|Эльфы Этеля начинают отдаляться|Залесье становится/,
    'politics',
  ],
  [/^(Очищено озеро|Очистка озера|Великая вырубка|Постройка домов|Установка Камня)/, 'economy'],
]
/** Явные правки заголовков (id → новый заголовок); длинное уходит в описание, если его там нет. */
const TITLES: Record<string, string> = {
  'ev:1005:xxiii_legion_opiev_vstaet_v_greyheld': 'XXIII легион Опиев встаёт в Грейхельде против сепаратизма Руна',
  'ev:985:smert_numerii_imperator_yorik_rospus': 'Смерть Нумерии; роспуск и пересбор Драконьей стражи',
}
const RETYPE_ANY: [RegExp, string][] = [[/^Закон о вето/, 'politics']]

export function fixEvent(e: R): R {
  if (TITLES[e.id] && e.title !== TITLES[e.id]) {
    const old = e.title
    e.title = TITLES[e.id]
    if (!String(e.description ?? '').includes(old)) e.description = `${old}.${e.description ? ' ' + e.description : ''}`
  }
  for (const [re, t] of RETYPE_ANY) if (re.test(e.title)) e.type = t
  if (e.type === 'other')
    for (const [re, t] of RULES)
      if (re.test(e.title)) {
        e.type = t
        break
      }
  return e
}

/** Слияния событий поверх сборки: запись absorb уходит в keep (места, источники, участники объединяются), absorb удаляется. Идемпотентно. */
const EVENT_MERGES: { keep: string; absorb: string[] }[] = [
  { keep: 'ev:573:perevorot_v_prefekture_gross', absorb: ['ev:573:perevorot_v_bersane_pri_bezdeystvii_'] },
]
const uniqBy = <T>(a: T[], k: (x: T) => string) => [...new Map(a.map((x) => [k(x), x])).values()]
export function mergeEvents(list: R[]): R[] {
  for (const m of EVENT_MERGES) {
    const keep = list.find((e) => e.id === m.keep)
    if (!keep) continue
    for (const id of m.absorb) {
      const o = list.find((e) => e.id === id)
      if (!o) continue
      keep.places = [...new Set([...(keep.places ?? []), ...(o.places ?? [])])]
      keep.sources = [...new Set([...(keep.sources ?? []), ...(o.sources ?? [])])]
      keep.actors = uniqBy([...(keep.actors ?? []), ...(o.actors ?? [])], (a) => a.name)
      list.splice(list.indexOf(o), 1)
    }
  }
  return list
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const f = 'data/events.yaml',
    src = readFileSync(f, 'utf8')
  const head = src.split('\n')[0]
  const list = mergeEvents((parse(src) as R[]).map(fixEvent))
  writeFileSync(f, head + '\n' + stringify(list, { lineWidth: 0 }))
  const cnt: Record<string, number> = {}
  for (const e of list) cnt[e.type] = (cnt[e.type] ?? 0) + 1
  console.log(cnt, 'other:', cnt.other, `${((100 * cnt.other) / list.length).toFixed(1)}%`)
}
