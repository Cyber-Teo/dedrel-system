// Режим мастера: вход по паролю (cookie ставит /api/master), подгрузка мастер-данных и подмешивание их в events / реестр слоёв.
// В публичном бандле мастерских данных нет — они приходят только по GET /api/master с валидной cookie.
// Сборка без мастера (например, для Foundry): VITE_MASTER=off — вход, проверка сессии и запросы к API не выполняются.
import { useEffect, useState } from 'preact/hooks'
import { events, type Ev } from './events'
import { readLayerIds } from './layers/layerHash'
import { syncEventIndex } from './search/data'
import { built } from './layers/registry'
import type { LayerDef } from './layers/build'
import { store } from './ui/panels'
import { MasterDataSchema, type MasterEvent } from './lib/masterSchema'

/** Режим мастера включён в этой сборке. */
const ENABLED = import.meta.env.VITE_MASTER !== 'off'
const API = `${import.meta.env.BASE_URL}api/master`

/** Готовые слои; при входе мастера в него добавляется «Слухи и тайны». */
export const readyIds = new Set(built.layers.filter((l) => l.status === 'ready').map((l) => l.id))

export const RUMORS_LAYER = 'rumors'
const RUMORS_DEF: LayerDef = {
  id: RUMORS_LAYER,
  group: 'history',
  name: 'Слухи и тайны',
  control: 'toggle; только в режиме мастера',
  priority: 'P0',
  status: 'ready',
  data: null,
  icon: 'circle',
  color: '#7a2fa0', // как --master в style.css; значение уходит в paint MapLibre, где var() не работает
}

let on = false
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
/** Слои из ссылки, которые станут доступны только после входа (например rumors) — применяются при входе. */
export const wantedLayers = readLayerIds(location.hash)
export const isMaster = () => on

/** Убрать из общего списка событий все мастерские. */
function clearMasterEvents() {
  for (let i = events.length - 1; i >= 0; i--) if (events[i].master) events.splice(i, 1)
}

/** Подмешать мастерские события (только с годом) и держать список упорядоченным по году. */
function addMasterEvents(list: MasterEvent[]) {
  for (const e of list) if (e.year != null) events.push({ ...e, year: e.year, master: true } satisfies Ev)
  events.sort((a, b) => a.year! - b.year!)
}

function addRumorsLayer() {
  if (built.layers.some((l) => l.id === RUMORS_LAYER)) return
  const i = built.layers.findIndex((l) => l.id === 'events')
  built.layers.splice(i + 1, 0, RUMORS_DEF)
}

function removeRumorsLayer() {
  const i = built.layers.findIndex((l) => l.id === RUMORS_LAYER)
  if (i >= 0) built.layers.splice(i, 1)
}

function apply(raw: unknown): boolean {
  const parsed = MasterDataSchema.safeParse(raw)
  if (!parsed.success) return false
  clearMasterEvents()
  addMasterEvents(parsed.data.events)
  addRumorsLayer()
  readyIds.add(RUMORS_LAYER)
  on = true
  syncEventIndex()
  emit()
  return true
}

function reset() {
  clearMasterEvents()
  removeRumorsLayer()
  readyIds.delete(RUMORS_LAYER)
  on = false
  syncEventIndex()
  emit()
}

const FLAG = 'master'
/** Помнили ли мы вход: по флагу при загрузке страницы решаем, стоит ли пробовать восстановить сессию по cookie. */
const readFlag = () => store.get(FLAG) === '1'
const writeFlag = (v: boolean) => {
  store.set(FLAG, v ? '1' : '0')
}

const load = async () => {
  const r = await fetch(API, { credentials: 'same-origin' })
  if (!r.ok) {
    if (r.status === 401) writeFlag(false)
    return false
  }
  if (!apply(await r.json())) return false
  writeFlag(true)
  return true
}

/** Доступен ли /api/master. Запрос — только по нажатию «Мастер» (не при загрузке, чтобы в консоли не было 502/404). */
export async function probe(): Promise<boolean> {
  if (!ENABLED) return false
  try {
    const r = await fetch(API, { credentials: 'same-origin' })
    if (r.status === 401) return true
    if (r.status === 200 && (r.headers.get('content-type') ?? '').includes('json') && apply(await r.json())) {
      writeFlag(true)
      return true
    }
    return false
  } catch {
    return false
  }
}

/** Тихая попытка восстановить сессию по cookie при загрузке страницы. */
export const resume = () => (ENABLED && readFlag() ? load().catch(() => false) : Promise.resolve(false))

export async function login(password: string): Promise<string | null> {
  if (!ENABLED) return 'Режим мастера недоступен'
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (r.status === 429) return 'Слишком много попыток, подождите минуту'
    if (!r.ok) return r.status === 401 ? 'Неверный пароль' : 'Режим мастера недоступен'
    return (await load()) ? null : 'Не удалось загрузить данные мастера'
  } catch {
    return 'Нет связи с сервером'
  }
}

export async function logout() {
  try {
    await fetch(API, { method: 'DELETE' })
  } catch {
    /* cookie истечёт сама */
  }
  writeFlag(false)
  reset()
}

/** Перерисовка компонента при входе/выходе. */
export function useMaster(): boolean {
  const [, setN] = useState(0)
  useEffect(() => {
    const f = () => setN((n) => n + 1)
    subs.add(f)
    return () => {
      subs.delete(f)
    }
  }, [])
  return on
}
