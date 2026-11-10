// Типизированная шина событий окна между независимыми частями интерфейса (карта, панели, поиск, пресеты).
// Имена без префикса: в DOM событие называется `atlas:<имя>`. Новое событие — строка в Events.
export type DossierKind = 'person' | 'place' | 'org' | 'polity'

export type Events = {
  /** Год сменился (шлёт ядро). Без detail — читать год из хеша. */
  year: number
  /** Открыть досье в правой панели. */
  dossier: { t: DossierKind; id: string }
  /** Набор включённых слоёв целиком (пресеты); в хеш его пишет только панель слоёв. */
  layers: { ids: string[]; allGuilds?: boolean }
  /** Изменился фильтр типов событий — перерисовать значки. */
  evtypes: void
  /** Включить/выключить политику и ландшафт. */
  history: { politics: boolean; landscape: boolean }
  /** Политику нужно включить (из карточки государства). */
  'politics-on': void
  /** Показать уведомление, при необходимости с «Отменить». */
  toast: { text: string; undo?: () => void }
  /** Построить маршрут до места (карточка места → инструмент «Путь»). */
  'route-to': { place: string }
  /** Открыть сценарий по id. */
  'open-scenario': { id: string }
  /** Показать человека в графе связей. */
  'graph-focus': { id: string }
  /** Перелететь к месту и показать кольцо на точке. */
  flyto: { place: string }
  /** Состояние слоёв истории для остальных панелей (шлёт ядро хроники). */
  'history-state': { politics: boolean; landscape: boolean }
  /** Окно открыто/закрыто: регистрация в стеке Esc (ui/overlayStack). */
  overlay: { open: boolean; id: string; close?: () => void; rank?: number }
  /** Стек Esc открыл окно ранга rank (шлёт overlayStack). */
  'overlay-open': { rank: number; id: string }
  /** Показать справку. */
  help: void
  /** Показать приветственную карточку. */
  welcome: void
  /** Закрыть колонку инструментов. */
  'tools-close': void
}

const PREFIX = 'atlas:'

/** Отправить событие. Для событий без данных второй аргумент не нужен. */
export function emit<K extends keyof Events>(name: K, ...detail: Events[K] extends void ? [] : [Events[K]]): void {
  dispatchEvent(new CustomEvent(PREFIX + name, { detail: detail[0] }))
}

/** Подписаться на событие; возвращает функцию отписки (удобно прямо из useEffect). */
export function on<K extends keyof Events>(name: K, handler: (detail: Events[K]) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<Events[K]>).detail)
  addEventListener(PREFIX + name, listener)
  return () => removeEventListener(PREFIX + name, listener)
}
