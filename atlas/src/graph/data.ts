// Данные окна «Связи»: relations.yaml + досье людей. Дом/страна — по полю affiliation человека.
import { loadData } from '../data/load'
import { personBy } from '../search/data'

export const TYPES = ['родство', 'брак', 'союз', 'вражда', 'покровительство', 'служба', 'betrayal'] as const
export type RelType = (typeof TYPES)[number]
export type Rel = { a: string; b: string; type: RelType; note: string; sources: string[]; confidence: string }
/** Подпись типа связи (в данных тип betrayal — латиницей). */
export const TYPE_RU = (t: RelType) => (t === 'betrayal' ? 'предательство' : t)
export const relations: Rel[] = (await loadData<Rel[]>('relations')) ?? []

export const TYPE_STYLE: Record<RelType, { color: string; dash: string; width: number }> = {
  родство: { color: '#8a6d3b', dash: '', width: 2 },
  брак: { color: '#c0392b', dash: '', width: 3.2 },
  союз: { color: '#2e7d32', dash: '', width: 2.2 },
  вражда: { color: '#111111', dash: '6 4', width: 2.4 },
  покровительство: { color: '#1f5fa8', dash: '', width: 2.2 },
  служба: { color: '#7b3fa0', dash: '2 4', width: 2.4 },
  betrayal: { color: '#e0116b', dash: '1 3', width: 3.4 },
}

// порядок важен: сначала дома, затем страны
const GROUPS: [string, RegExp, string][] = [
  ['Тарквинии', /Тарквини/, '#b5322b'],
  ['Фурии', /Фури/, '#d97b1c'],
  ['Опии', /Опи/, '#c9a11a'],
  ['Клавдии', /Клавди/, '#7a9a2a'],
  ['Юнии', /Юни/, '#2d9a6a'],
  ['Кезон-Эбуции', /Кезон/, '#2aa0a8'],
  ['Папирии', /Папири/, '#3a78b8'],
  ['Эмилии', /Эмили/, '#5a58c4'],
  ['Лариции', /Лариц/, '#8a56c0'],
  ['Нумиции', /Нумиц/, '#b24fa8'],
  ['Сульпиции', /Сульпиц/, '#c24f7a'],
  ['Ройо', /Ройо|Калатрав|Деламот|Веласкез|Тафалл/, '#a8472b'],
  ['Игни и Махаратха', /Игни|Махарат|Асмод|демон/, '#8a6d1f'],
  ['Энфорис', /Энфорис/, '#2f7f8f'],
  ['Церковь Звёзд', /Церковь Звёзд/, '#6a7f9a'],
]
export const OTHER = 'Прочие'
export const OTHER_COLOR = '#8b8577'
export const groupOf = (aff?: string) => GROUPS.find((g) => aff && g[1].test(aff))?.[0] ?? OTHER
export const groupColor = (g: string) => GROUPS.find((x) => x[0] === g)?.[2] ?? OTHER_COLOR
export const GROUP_NAMES = [...GROUPS.map((g) => g[0]), OTHER]

export type RoleKind = 'rule' | 'war' | 'magic' | 'church' | 'trade' | 'house'
export const ROLE_RU: Record<RoleKind, string> = {
  rule: 'правитель',
  war: 'воин',
  magic: 'маг',
  church: 'духовенство',
  trade: 'торговец / мастер',
  house: 'член дома',
}
export const roleOf = (role?: string): RoleKind => {
  const r = (role ?? '').toLowerCase()
  if (/император|король|королев|раджа|махарадж|князь|правител|регент|царь|сенатор|глава государ/.test(r)) return 'rule'
  if (/маг|колдун|волшеб|чародей|жрец.*магии|архимаг|демон/.test(r)) return 'magic'
  if (/патриарх|епископ|жрец|священ|монах|кардинал|святой|отшельник|целитель|аббат/.test(r)) return 'church'
  if (/генерал|воин|командующ|командир|рыцар|наёмни|капитан|комендант|кастелян|легион|маршал|полковник|стратег/.test(r))
    return 'war'
  if (/купец|торгов|гильдмастер|ремесленн|банк|мастер|кузнец|управляющ/.test(r)) return 'trade'
  return 'house'
}
/** Приблизительный год жизни по строке years (для фильтра по эпохе); null — не определить. */
export function yearOfPerson(years?: string, role?: string): number | null {
  const t = (years ?? '').replace(/[−–—]/g, '-')
  if (/наст|сейчас|в 1005|до 1005/.test(t) || /^\s*1005/.test(t)) return 1005
  const rom = t.match(/\b([IVX]+)\b/)
  if (/конец|начало|середина/.test(t) && rom) {
    const v: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 }
    if (v[rom[1]]) return (v[rom[1]] - 1) * 100 + 80
  }
  const m = t.match(/(?:^|[^\d])(-?\d{1,4})/)
  if (m) return Number(m[1])
  if (/Смутные/.test(t + (role ?? ''))) return 700
  return null
}

export type GNode = {
  id: string
  name: string
  group: string
  deg: number
  role: RoleKind
  roleText: string
  years: string
  yr: number | null
  aff: string
}
export function buildNodes(rels: Rel[]): GNode[] {
  const deg = new Map<string, number>()
  for (const r of rels) for (const id of [r.a, r.b]) deg.set(id, (deg.get(id) ?? 0) + 1)
  return [...deg].map(([id, d]) => {
    const p = personBy.get(id)
    return {
      id,
      name: p?.name ?? id.split('/').pop()!.replace(/_/g, ' '),
      group: groupOf(p?.affiliation),
      deg: d,
      role: roleOf(p?.role),
      roleText: p?.role ?? '',
      years: p?.years ?? '',
      yr: yearOfPerson(p?.years, p?.role),
      aff: p?.affiliation ?? '',
    }
  })
}
export const allNodes = buildNodes(relations)
