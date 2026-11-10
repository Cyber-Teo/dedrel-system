// КОНТРАКТ. Тост-уведомления о побочных эффектах (смена подложки/года пресетом, политикой, сценарием).
// Из своего кода:   import { toast } from '../ui/toast';   toast('Подложка: приглушённая', { undo: () => setMode('drawn') })
// Из любого места без импорта:  emit('toast', { text: '…', undo: () => {…} })  // lib/bus
// Плашка по центру карты над шкалой времени (bottom от --dock-h/--sheet-h), z-index ниже рейки; задевает чипы слоёв/легенду/масштаб — поднимается над ними. До двух строк без «…», role=status; держится 4 с (с «Отменить» — 8 с), пауза при наведении/фокусе;
// новый тост заменяет прежний; открытие окна (оверлей ранга 0) гасит тост. «Отменить» вызывает undo и гасит тост.
// Длинный перечень после двоеточия («Слои: А, Б, В…») сокращается до «…и ещё N».
import { isCompact } from './breakpoints'
import { on } from '../lib/bus'

export const TOAST_MS = 4000
export const TOAST_UNDO_MS = 8000 // тост с «Отменить» живёт дольше: успеть прочитать и дойти Tab-ом
let host: HTMLElement | null = null
let timer = 0

function getHost(): HTMLElement {
  if (host && host.isConnected) return host
  host = document.createElement('div')
  host.id = 'toasts'
  host.setAttribute('role', 'status')
  host.setAttribute('aria-live', 'polite')
  document.body.appendChild(host)
  return host
}

function shorten(text: string): string {
  const max = isCompact() ? 100 : 150
  if (text.length <= max) return text
  const i = text.indexOf(': ')
  if (i < 0) return text
  const head = text.slice(0, i + 2),
    items = text.slice(i + 2).split(', ')
  if (items.length < 2) return text
  let out = head,
    n = 0
  for (const it of items) {
    const next = out + (n ? ', ' : '') + it
    if (next.length + 14 > max && n > 0) break
    out = next
    n++
  }
  return n >= items.length ? text : `${out} …и ещё ${items.length - n}`
}

export function toast(text: string, opts: { undo?: () => void } = {}): void {
  if (document.querySelector('[role="dialog"][aria-modal="true"]')) return // пока открыта модалка (приветствие), тостов нет
  const h = getHost()
  clearTimeout(timer)
  h.replaceChildren()
  const box = document.createElement('div')
  box.className = 'toast'
  const span = document.createElement('span')
  span.textContent = shorten(text)
  span.title = text
  box.appendChild(span)
  const hide = () => {
    clearTimeout(timer)
    h.replaceChildren()
  }
  if (opts.undo) {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = 'Отменить'
    b.onclick = () => {
      const u = opts.undo!
      hide()
      u()
    }
    box.appendChild(b)
  }
  h.appendChild(box)
  // CSS ставит тост над шкалой времени по центру; если он пересекает чипы слоёв, легенду, масштаб или кнопки зума — поднимаем над ними
  const place = () => {
    h.style.bottom = ''
    for (let i = 0; i < 4; i++) {
      const r = box.getBoundingClientRect()
      let lift = 0
      for (const el of document.querySelectorAll<HTMLElement>(
        '.scale, .al-legend, .hist-legend, #zoomc, #tools, #tool-bar',
      )) {
        const o = el.getBoundingClientRect()
        if (o.width > 0 && o.height > 0 && r.left < o.right && r.right > o.left && r.top < o.bottom && r.bottom > o.top)
          lift = Math.max(lift, r.bottom - o.top + 8)
      }
      if (!lift) break
      h.style.bottom = `${Math.round(parseFloat(getComputedStyle(h).bottom) + lift)}px`
    }
  }
  place()
  for (const ms of [150, 500, 1200])
    setTimeout(() => {
      if (h.contains(box)) place()
    }, ms) // чипы и легенда появляются после пресета
  const arm = () => {
    clearTimeout(timer)
    timer = window.setTimeout(hide, opts.undo ? TOAST_UNDO_MS : TOAST_MS)
  }
  box.addEventListener('mouseenter', () => clearTimeout(timer))
  box.addEventListener('mouseleave', arm)
  box.addEventListener('focusin', () => clearTimeout(timer))
  box.addEventListener('focusout', arm)
  arm()
}

if (typeof window !== 'undefined') {
  on('overlay-open', (d) => {
    if (d.rank === 0) {
      clearTimeout(timer)
      host?.replaceChildren()
    }
  })
  on('toast', (d) => {
    if (d && typeof d.text === 'string') toast(d.text, { undo: d.undo })
  })
}
