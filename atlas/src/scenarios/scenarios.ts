import { loadData } from '../data/load'
import type { ScenarioT } from './schema'
import { yearG } from '../events'
import { MONTHS, MONTHS_NOM } from './sky'

/** Сценарии разобраны и проверены схемой при предсборке (scripts/build/data-json.ts). */
export const scenarios: ScenarioT[] = await loadData<ScenarioT[]>('scenarios')

/** «Апрель 1005 г.», «7 ноября 1005 г.», «конец марта 1005 г.» — год один раз. */
export function dateText(d: ScenarioT['steps'][number]['date']): string {
  let base: string
  if (d.label)
    base = /\d$/.test(d.label.trim()) ? `${d.label.trim()} г.` : d.label.trim() // «г.» — только после числа; «817 год», «около −320 года», «через неделю после…» как есть
  else if (d.month && !d.day) base = `${MONTHS_NOM[d.month - 1]} ${yearG(d.year)}`
  else base = [d.day, d.month ? MONTHS[d.month - 1] : null, yearG(d.year)].filter(Boolean).join(' ')
  base = base.charAt(0).toUpperCase() + base.slice(1)
  return [base, d.time].filter(Boolean).join(', ') + (d.note ? ` (${d.note})` : '')
}

const YEARS: Record<string, string> = {
  'maldred-east-88': '88–206',
  'great-war': '-500–1',
  'empire-growth': '206–1006',
}
/** Год сценария для бейджа и порядка: из id («arnost-672» → 672), у «Восточного похода» диапазон. */
export const scYear = (id: string) => YEARS[id] ?? /-(\d+)$/.exec(id)?.[1] ?? ''
/** Сценарии по году события (у «Огненной чумы» первый шаг — предыстория −320 г.); при равных годах — как в данных (сортировка стабильна). */
export const byTime: ScenarioT[] = [...scenarios].sort((a, b) => parseInt(scYear(a.id)) - parseInt(scYear(b.id)))
