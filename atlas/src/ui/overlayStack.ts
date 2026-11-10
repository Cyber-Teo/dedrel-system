// КОНТРАКТ. Единый стек оверлеев и глобальный Esc.
// Esc закрывает по порядку: окно (rank 0: Гант/Связи/Схема) → карточка (1) → активный инструмент (2) → врезка (3) → меню/слои (4).
// Внутри одного ранга закрывается последний зарегистрированный.
// Из кода: const off = register(() => close(), 2); … off();   Из Preact-компонента: useOverlay(open, close, rank).
// Без импорта: emit('overlay', { open: true, id: 'моё-окно', close, rank: 0 }) и { open: false, id } при закрытии.
// Свои обработчики Esc в оверлеях не нужны — они мешают порядку.
import { useEffect, useRef } from 'preact/hooks'
import { emit, on } from '../lib/bus'

type Item = { id: string; close: () => void; rank: number; opener?: HTMLElement | null }
const items: Item[] = []
let seq = 0

// История браузера: пока открыт хоть один оверлей, в стеке истории лежит одна лишняя запись; «назад» закрывает верхний оверлей.
// Запись при открытии получает ТЕКУЩИЙ hash, но пока оверлей открыт, hash пишут через replaceState (слои, год, маршрут, камера) — в верхнюю запись.
// Поэтому актуальный hash (liveHash) запоминаем и при любом снятии записи (back/«назад») возвращаем его replaceState до слушателей hashchange.
let pushed = false,
  ignore = 0,
  liveHash = ''
function syncHash() {
  if (location.hash === liveHash) return
  history.replaceState(history.state, '', liveHash || location.pathname + location.search)
  dispatchEvent(new HashChangeEvent('hashchange'))
}
if (typeof history !== 'undefined' && typeof location !== 'undefined') {
  const rs = history.replaceState.bind(history)
  history.replaceState = (s, t, u) => {
    rs(s, t, u)
    liveHash = location.hash
  }
}
function ensurePush() {
  if (pushed || ignore > 0 || typeof history === 'undefined') return // пока откат записи (history.back) не завершён, новую запись не пишем: её добавит popstate
  pushed = true
  liveHash = location.hash
  history.pushState({ ...(history.state ?? {}), atlasOverlay: 1 }, '', location.href)
}
function afterRemove() {
  if (items.length || !pushed || typeof history === 'undefined') return
  // отложено: смена инструмента снимает один оверлей и тут же ставит другой, лишний back/push не нужен
  setTimeout(() => {
    if (items.length || !pushed) return
    pushed = false
    ignore++
    history.back()
  }, 0)
}

// Кнопка, по которой только что кликнули (клик с клавиатуры тоже): оверлей часто сам уводит фокус в своё поле раньше, чем регистрируется
let trig: { el: HTMLElement; t: number } | null = null
if (typeof document !== 'undefined')
  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>('button,[role="button"],a[href],summary')
      trig = el ? { el, t: performance.now() } : null
    },
    true,
  )
const openerNow = (): HTMLElement | null => {
  if (trig && performance.now() - trig.t < 1500 && trig.el.isConnected) return trig.el
  return document.activeElement instanceof HTMLElement && document.activeElement !== document.body
    ? document.activeElement
    : null
}

export function register(close: () => void, rank = 2, id = `o${++seq}`): () => void {
  unregister(id)
  ensurePush()
  items.push({ id, close, rank, opener: openerNow() })
  if (rank === 0) modalSync()
  if (typeof window !== 'undefined') emit('overlay-open', { rank, id })
  return () => unregister(id)
}
function unregister(id: string) {
  const i = items.findIndex((x) => x.id === id)
  if (i >= 0) {
    const [it] = items.splice(i, 1)
    afterRemove()
    if (it.rank === 0) modalSync(it)
    else softRestore(it)
  }
}
// Немодальные оверлеи (панель «Слои», меню «Ещё», флайаут рельса, карточка): после закрытия фокус — на кнопку, которая открыла.
// Только если фокус потерян (BODY — закрытый элемент был в фокусе) и ничей другой не взял его; смена инструмента (снял один, поставил другой) не затрагивается.
function softRestore(it: Item) {
  if (typeof document === 'undefined' || !it.opener) return
  setTimeout(() => {
    const a = document.activeElement
    if (a && a !== document.body && a.isConnected && a !== it.opener && (a as HTMLElement).getClientRects().length)
      return
    if (items.some((x) => x.opener === it.opener)) return
    restoreFocus(it.opener)
  }, 40)
}

/** Закрыть верхний оверлей; true, если что-то закрыто. */
export function closeTop(): boolean {
  if (!items.length) return false
  let best = items.length - 1
  for (let i = items.length - 1; i >= 0; i--) if (items[i].rank < items[best].rank) best = i
  const it = items[best]
  items.splice(best, 1)
  it.close()
  afterRemove()
  if (it.rank === 0) modalSync(it)
  else softRestore(it)
  return true
}

// Модальные окна (rank 0): inert на всё, что не окно; Tab/Shift+Tab держится внутри; при закрытии фокус возвращается на кнопку-открывашку.
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
let inerted: HTMLElement[] = []
const topDialog = (): HTMLElement | null => {
  const d = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')]
  return d[d.length - 1] ?? null
}
const visible = (el: HTMLElement) => el.getClientRects().length > 0
function setInert(dlg: HTMLElement | null) {
  for (const e of inerted) e.inert = false
  inerted = []
  if (!dlg) return
  const roots = [...document.body.children, ...(document.getElementById('ui')?.children ?? [])] as HTMLElement[]
  for (const r of roots) {
    if (
      r === dlg ||
      r.contains(dlg) ||
      dlg.contains(r) ||
      r.id === 'toasts' ||
      r.id === 'ui' ||
      /^(SCRIPT|STYLE)$/.test(r.tagName)
    )
      continue
    r.inert = true
    inerted.push(r)
  }
}
function focusIn(dlg: HTMLElement) {
  if (dlg.contains(document.activeElement)) return
  const t =
    dlg.querySelector<HTMLElement>('h2[tabindex], h3[tabindex], [data-autofocus]') ??
    dlg.querySelector<HTMLElement>(FOCUSABLE)
  t?.focus({ preventScroll: true })
}
function restoreFocus(opener?: HTMLElement | null) {
  if (!opener || !opener.isConnected) return
  if (!visible(opener)) {
    // кнопка в закрытом флайауте/листе инструментов: раскрываем группу
    const g = opener.closest<HTMLElement>('.tg')
    const rail = g?.querySelector<HTMLElement>('.tg-rail')
    if (rail && visible(rail) && rail.getAttribute('aria-expanded') !== 'true') rail.click()
    if (!visible(opener)) {
      ;(document.querySelector<HTMLElement>('#slot-tools-btn button, #tools .tg-rail') ?? document.body).focus({
        preventScroll: true,
      })
      return
    }
  }
  opener.focus({ preventScroll: true })
}
function modalSync(closed?: Item) {
  if (typeof document === 'undefined') return
  setTimeout(() => {
    const open = items.some((x) => x.rank === 0),
      dlg = open ? topDialog() : null
    setInert(dlg)
    if (dlg) focusIn(dlg)
    else if (closed && !items.some((x) => x.rank === 0)) {
      restoreFocus(closed.opener)
    }
  }, 0)
}

/** Хук: пока open — оверлей в стеке. */
export function useOverlay(open: boolean, close: () => void, rank = 2) {
  const ref = useRef(close)
  ref.current = close
  useEffect(() => (open ? register(() => ref.current(), rank) : undefined), [open, rank])
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignore > 0) {
      ignore--
      syncHash()
      if (!ignore && items.length) ensurePush()
      return
    }
    if (!pushed) return
    pushed = false // запись уже снята браузером
    syncHash()
    closeTop()
    if (items.length) ensurePush()
  })
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && items.some((x) => x.rank === 0)) {
      const dlg = topDialog()
      if (!dlg) return
      const f = [...dlg.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => visible(el) && !el.closest('[inert]'))
      if (!f.length) {
        e.preventDefault()
        return
      }
      const a = document.activeElement as HTMLElement | null,
        first = f[0],
        last = f[f.length - 1]
      if (!a || !dlg.contains(a)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && (a === first || (a.tabIndex === -1 && f.indexOf(a) < 0))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && a === last) {
        e.preventDefault()
        first.focus()
      }
      return
    }
    if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return
    const t = e.target as HTMLElement | null
    if (t && t.closest?.('.sbox') && (t as HTMLInputElement).value) return // Esc в поиске сначала гасит выдачу
    if (closeTop()) e.preventDefault()
  })
  on('overlay', (d) => {
    if (!d || !d.id) return
    if (d.open && d.close) register(d.close, d.rank ?? 2, d.id)
    else unregister(d.id)
  })
}
