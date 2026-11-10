// Пресеты видов: набор слоёв + год + подложка одной кнопкой. Камеру ведёт PresetsUI (весь материк или bbox объектов, зум ≤1.3). Берутся только слои со status ready.
import { readYear, withYear } from '../hash'
import { yearG } from '../events'
import { readHistoryLayers, readLayerIds, withHistoryLayers } from '../layers/layerHash'
import { toast } from '../ui/toast'
import { closeTopDossier } from '../dossier'
import type { Mode } from '../hash'
import { emit } from '../lib/bus'

export type Preset = {
  id: string
  name: string
  label: string
  hint: string
  year: number
  layers: string[]
  politics: boolean
  landscape: boolean
  mode: Mode
  fit?: string
  allGuilds?: boolean
}

export const PRESETS: Preset[] = [
  {
    id: 'politics-1006',
    name: 'Политика',
    label: 'Политика на 1006 г.',
    hint: 'Государства на 1006 год: заливка цветом владельца, подписи.',
    year: 1006,
    layers: [],
    politics: true,
    landscape: false,
    mode: 'muted',
  },
  {
    id: 'great-war',
    name: 'Великая война',
    label: 'Великая война (−200)',
    hint: 'Год −200: Битва при Тарпете и Битва слепой мести, события рядом с этим годом отмечены на карте; государства и ландшафт — по сохранившимся сведениям, камера на весь материк. Походов этого времени в данных нет, поэтому слой походов не включается.',
    year: -200,
    layers: ['places-ranked', 'events'],
    politics: true,
    landscape: true,
    mode: 'muted',
  },
  {
    id: 'trade',
    name: 'Торговля',
    label: 'Торговля',
    hint: 'Торговые пути, ресурсы и города на 1006 год. Цены и валюты включаются отдельной кнопкой.',
    year: 1006,
    layers: ['trade-routes', 'resources', 'places-ranked'],
    politics: false,
    landscape: false,
    mode: 'drawn',
  },
  {
    id: 'magic',
    name: 'Магия и нежить',
    label: 'Магия и нежить',
    hint: 'Нежить, аномалии, школы магии и опасные зоны.',
    year: 1006,
    layers: ['undead', 'anomalies', 'schools', 'hazards'],
    politics: false,
    landscape: false,
    mode: 'drawn',
  },
  {
    id: 'faith',
    name: 'Вера',
    label: 'Вера',
    hint: 'Религии и святыни.',
    year: 1006,
    layers: ['religions', 'shrines'],
    politics: false,
    landscape: false,
    mode: 'drawn',
  },
  {
    id: 'underground',
    name: 'Гильдии и подполье',
    label: 'Гильдии и подполье',
    hint: 'Сферы влияния всех гильдий (штриховка по цветам, легенда рядом) и их штабы; камера наводится на штабы. Работорговля включается отдельно.',
    year: 1006,
    layers: ['guild-spheres', 'guild-hq'],
    politics: false,
    landscape: false,
    mode: 'muted',
    fit: 'guild-hq',
    allGuilds: true,
  },
  {
    id: 'traveler',
    name: 'Крепости и опасности',
    label: 'Крепости и опасности',
    hint: 'Крепости и опасные зоны. Слоя дорог в данных пока нет.',
    year: 1006,
    layers: ['fortresses', 'hazards'],
    politics: false,
    landscape: false,
    mode: 'drawn',
  },
]

export type ViewSnap = { layers: string[]; year: number | null; politics: boolean; landscape: boolean; mode: Mode }
const curMode = (): Mode =>
  document.querySelector('#slot-basemap button.on')?.getAttribute('aria-label')?.includes('приглушённая')
    ? 'muted'
    : 'drawn'
export const snapView = (): ViewSnap => ({
  layers: readLayerIds(location.hash),
  year: readYear(location.hash),
  ...readHistoryLayers(location.hash),
  mode: curMode(),
})

function put(
  layers: string[],
  year: number | null,
  hist: { politics: boolean; landscape: boolean },
  allGuilds = false,
) {
  // год и история — в хеш; слои — событием atlas:layers (хеш l= пишет только LayersUI, иначе его эффект затирает наш)
  let h = withHistoryLayers(location.hash, hist)
  if (year !== null) h = withYear(h, year)
  history.replaceState(null, '', h)
  dispatchEvent(new HashChangeEvent('hashchange'))
  emit('layers', { ids: layers, allGuilds })
  emit('history', { politics: hist.politics, landscape: hist.landscape })
}

/** Вернуть вид, снятый snapView(). */
export function restoreView(s: ViewSnap, setMode?: (m: Mode) => void) {
  closeTopDossier()
  put(s.layers, s.year, s)
  setMode?.(s.mode)
}

/** Применить пресет: слои и год — через хеш, история — событием, подложка — setMode. Возвращает снимок прежнего вида. */
export function applyPreset(
  p: Preset,
  readyIds: Set<string>,
  ctl: { setMode?: (m: Mode) => void; jump?: unknown },
  names: (id: string) => string = (id) => id,
): ViewSnap {
  const prev = snapView()
  const on = p.layers.filter((id) => readyIds.has(id))
  closeTopDossier()
  put(on, p.year, p, !!p.allGuilds)
  ctl.setMode?.(p.mode)
  const absent = p.layers.filter((id) => !readyIds.has(id))
  const what = [
    ...on.map(names),
    ...(p.politics ? ['Политика государств'] : []),
    ...(p.landscape ? ['ландшафт эпохи'] : []),
  ]
  const parts = [`${what.length ? what.join(' · ') : 'Слои не заданы'}, ${yearG(p.year)}`]
  if (absent.length) parts.push(`нет в данных: ${absent.map(names).join(', ')}`)
  parts.push(`подложка ${p.mode === 'muted' ? 'приглушена' : 'рисованная'}${prev.mode === p.mode ? ' (как была)' : ''}`)
  toast(parts.join(' · '), { undo: () => restoreView(prev, ctl.setMode) })
  return prev
}
