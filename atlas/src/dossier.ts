// КОНТРАКТ. Правая панель «досье» — стек карточек в слоте #dossier (подробности — atlas/docs/architecture.md).
//   useDossier(name, open, close, key?, opts?) — владелец карточки. Новая карточка сворачивает прежнюю, если у той есть
//   opts.collapse (плашка opts.label() в #tool-bar), иначе закрывает её через close().
//   closeTopDossier() — закрыть верхнюю карточку (Esc и кнопка «Назад»).
import { useEffect, useRef, useState } from 'preact/hooks'
import { h, render } from 'preact'
import { register } from './ui/overlayStack'
import { DosBar } from './ui/DosBar'
import { slots } from './ui/dom'
import { isPhone } from './ui/breakpoints'

type Opts = { collapse?: (c: boolean) => void; label?: () => string }
type Entry = { name: string; ref: { current: { close: () => void } & Opts }; collapsed: boolean }
const stack: Entry[] = []
/** Сигнатура последней отрисовки плашек свёрнутых карточек: без изменений DOM не трогаем. */
let lastSig = ''

export const dossierSlot = () => slots.dossier

function visibleCards(): HTMLElement[] {
  return [...dossierSlot().children].filter(
    (c) => !c.classList.contains('dos-bar') && !(c as HTMLElement).hidden,
  ) as HTMLElement[]
}

function sync() {
  const slot = dossierSlot()
  let bar = slot.querySelector<HTMLElement>(':scope > .dos-bar')
  if (!bar) {
    bar = document.createElement('div')
    bar.className = 'dos-bar'
    slot.prepend(bar)
  }
  const folded = stack.filter((e) => e.collapsed)
  const below = folded[folded.length - 1]
  const layers = document.body.classList.contains('layers-open')
  const label = below ? '‹ Назад' : layers ? '‹ К слоям' : ''
  const showBack = !!label && stack.length > 0 && !stack[stack.length - 1].collapsed
  const sig = `${showBack ? label : ''}|${folded.map((e) => e.ref.current.label?.() ?? e.name).join(';')}`
  if (sig !== lastSig) {
    lastSig = sig
    renderPills(folded)
  }
  document.body.classList.toggle('dossier-open', visibleCards().length > 0)
  const cards = visibleCards(),
    heading = cards[cards.length - 1]?.querySelector('h2, h3, h4')
  render(
    h(DosBar, {
      backLabel: showBack ? label : '',
      backTitle: below ? 'Вернуться к свёрнутой карточке' : 'Вернуться к панели слоёв',
      onBack: () => {
        closeTopDossier()
      },
      folded: document.body.classList.contains('dos-folded'),
      onFold: () => setFolded(!document.body.classList.contains('dos-folded')),
      title: (heading?.textContent ?? '').replace(/[✕×]/g, '').trim(),
    }),
    bar,
  )
}

/** Свернуть панель в ленту 60px с заголовком (только широкий экран; --side-w = 60px, поэтому карта и cardPadding уходят от ленты сами). */
function setFolded(v: boolean) {
  document.body.classList.toggle('dos-folded', v)
  sync()
}

/** Плашки свёрнутых карточек в #tool-bar. */
function renderPills(folded: Entry[]) {
  const tb = slots.toolBar
  tb.querySelectorAll('.pill').forEach((p) => p.remove())
  for (const e of folded) {
    const p = document.createElement('button')
    p.type = 'button'
    p.className = 'pill'
    p.textContent = `${e.ref.current.label?.() ?? e.name} ⤢`
    p.title = 'Развернуть'
    p.onclick = () => {
      const top = stack[stack.length - 1]
      if (top && top !== e) top.ref.current.close()
      expand(e)
    }
    tb.appendChild(p)
  }
}

function expand(e: Entry) {
  e.collapsed = false
  e.ref.current.collapse?.(false)
  sync()
}

function activate(name: string, ref: Entry['ref']) {
  let e = stack.find((x) => x.name === name)
  const idx = e ? stack.indexOf(e) : -1
  if (e && idx === stack.length - 1) {
    e.ref = ref
    return
  }
  if (e) stack.splice(idx, 1)
  e = { name, ref, collapsed: false }
  for (const o of [...stack]) {
    if (o.ref.current.collapse) {
      o.collapsed = true
      o.ref.current.collapse(true)
    } else {
      stack.splice(stack.indexOf(o), 1)
      o.ref.current.close()
    }
  }
  stack.push(e)
  sync()
}

function deactivate(name: string) {
  const i = stack.findIndex((x) => x.name === name)
  if (i < 0) return
  stack.splice(i, 1)
  const top = stack[stack.length - 1]
  if (top && top.collapsed) expand(top)
  else sync()
}

export function closeTopDossier(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  top.ref.current.close()
  return true
}

/** Хозяин карточки: open — есть что показывать; close — закрыть; key — смена содержимого. */
export function useDossier(name: string, open: boolean, close: () => void, key: unknown = open, opts: Opts = {}) {
  const ref = useRef({ close, ...opts })
  ref.current = { close, ...opts }
  useEffect(() => {
    if (open) activate(name, ref)
    else deactivate(name)
  }, [open, key])
  useEffect(() => () => deactivate(name), [])
}

/** Открыта ли сейчас хоть одна карточка (для вёрстки шторки). */
export function useDossierOpen(): boolean {
  const [o, set] = useState(false)
  useEffect(() => {
    const f = () => set(document.body.classList.contains('dossier-open'))
    const ob = new MutationObserver(f)
    ob.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    f()
    return () => ob.disconnect()
  }, [])
  return o
}

// --- слежение за слотом: фокус, ARIA, Esc, класс body ---
if (typeof document !== 'undefined') {
  const slot = dossierSlot()
  slot.setAttribute('role', 'complementary')
  slot.setAttribute('aria-label', 'Карточка')
  let opener: HTMLElement | null = null
  let wasOpen = false
  let unreg: (() => void) | null = null
  const check = () => {
    const cards = visibleCards()
    const open = cards.length > 0
    document.body.classList.toggle('dossier-open', open)
    if (open && !wasOpen) {
      document.body.classList.remove('dos-folded')
      opener =
        document.activeElement instanceof HTMLElement &&
        !slot.contains(document.activeElement) &&
        document.activeElement !== document.body
          ? document.activeElement
          : null
      unreg = register(
        () => {
          if (!closeTopDossier()) {
            /* нечего закрывать */
          }
        },
        1,
        'dossier',
      )
    }
    if (open) {
      const card = cards[cards.length - 1]
      const h = card.querySelector<HTMLElement>('h3, h4, h2')
      if (h && card.dataset.focused !== '1') {
        card.dataset.focused = '1'
        h.tabIndex = -1
        h.focus({ preventScroll: true })
      }
      card.querySelectorAll<HTMLElement>('button.x').forEach((b) => {
        b.setAttribute('aria-label', 'Закрыть')
        if (!b.title) b.title = 'Закрыть'
      })
    }
    if (!open && wasOpen) {
      unreg?.()
      unreg = null
      if (
        opener &&
        opener.isConnected &&
        (document.activeElement === document.body || slot.contains(document.activeElement))
      )
        opener.focus({ preventScroll: true })
      opener = null
    }
    wasOpen = open
  }
  new MutationObserver(() => {
    check()
    sync()
  }).observe(slot, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] })
  new MutationObserver(() => sync()).observe(document.body, { attributes: true, attributeFilter: ['class'] })
}

// Реальная высота шторки досье на узком экране -> --sheet-h (шкала, чипы слоёв и тосты поднимаются ровно над ней)
if (typeof document !== 'undefined' && typeof ResizeObserver !== 'undefined') {
  const slot = dossierSlot()
  const upd = () => {
    const h =
      isPhone() && document.body.classList.contains('dossier-open')
        ? Math.round(slot.getBoundingClientRect().height)
        : 0
    if (h > 0) document.body.style.setProperty('--sheet-h', `${h}px`)
    else document.body.style.removeProperty('--sheet-h')
  }
  new ResizeObserver(upd).observe(slot)
  new MutationObserver(upd).observe(document.body, { attributes: true, attributeFilter: ['class'] })
  addEventListener('resize', upd)
}
