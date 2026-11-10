// КОНТРАКТ. Группы колонки инструментов (разметка в index.html, #tg-*). Компоненты портируют кнопки так:
//   createPortal(<ToolBtn …/>, toolGroup('measure'))
// Группы: measure «Измерить», hist «Время и политика» (слои истории), views «Готовые наборы»,
// ref «Списки» (справочники и список государств), win «Окна», export «Экспорт».
// Прежний id 'time' оставлен для совместимости и указывает в «Списки» (так «Государства» оказываются там, где им место).
// Подсказки/счётчики инструментов в колонку НЕ вставлять — для них контейнер #tool-bar над картой (toolBar()).
import type { iconUrl } from './uiIcons'
import { byId, slots } from './dom'

export type ToolGroupId = 'measure' | 'hist' | 'time' | 'views' | 'ref' | 'win' | 'export'

export type ToolGroupDef = {
  id: Exclude<ToolGroupId, 'time'>
  /** Суффикс id секции в index.html (#tg-<domId>); у «hist» разметка исторически называется time. */
  domId: string
  icon: Parameters<typeof iconUrl>[0]
  title: string
}

/** Единственный реестр групп: порядок кнопок рейки, DOM-id секций, иконки и подписи. */
export const TOOL_GROUPS: readonly ToolGroupDef[] = [
  { id: 'measure', domId: 'measure', icon: 'ruler', title: 'Измерить' },
  { id: 'hist', domId: 'time', icon: 'hourglass', title: 'Время и политика' },
  { id: 'views', domId: 'views', icon: 'star', title: 'Готовые наборы' },
  { id: 'ref', domId: 'ref', icon: 'list', title: 'Списки' },
  { id: 'win', domId: 'win', icon: 'windows', title: 'Окна' },
  { id: 'export', domId: 'export', icon: 'png', title: 'Экспорт' },
]

/** Устаревший id → актуальная группа. */
const LEGACY: Partial<Record<ToolGroupId, ToolGroupDef['id']>> = { time: 'ref' }

export const toolGroupDef = (id: ToolGroupId): ToolGroupDef => {
  const real = LEGACY[id] ?? (id as ToolGroupDef['id'])
  return TOOL_GROUPS.find((g) => g.id === real)!
}

/** Секция группы по DOM-id из разметки (#tg-<domId>) — для рейки инструментов. */
export const toolGroupByDomId = (domId: string): ToolGroupDef | undefined => TOOL_GROUPS.find((g) => g.domId === domId)

export const toolGroup = (id: ToolGroupId): HTMLElement => {
  const sel = byId(`tg-${toolGroupDef(id).domId}`).querySelector<HTMLElement>('.tg-b')
  if (!sel) throw new Error(`В секции #tg-${toolGroupDef(id).domId} нет контейнера .tg-b`)
  return sel
}

export const toolBar = (): HTMLElement => slots.toolBar
