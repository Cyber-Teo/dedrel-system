// Колонка инструментов: рельс иконок + флайаут (десктоп), крестик листа на узком экране, меню «⋯» и кнопка-лупа в шапке.
import { INK_COLOR } from '../theme'
import { isToolsSheet } from '../ui/breakpoints'
import { byId } from '../ui/dom'
import { register } from '../ui/overlayStack'
import { store } from '../ui/panels'
import { toolGroupByDomId } from '../ui/toolGroup'
import { iconUrl } from '../ui/uiIcons'
import { emit } from '../lib/bus'

const RAIL_ICON_PX = 22
/** Ранг в стеке оверлеев: меню и флайауты закрываются последними. */
const MENU_RANK = 4

let flyOff: (() => void) | null = null

/** Открыть флайаут группы по DOM-id секции (#tg-<id>) или закрыть все. */
export function setFly(id: string | null) {
  flyOff?.()
  flyOff = null
  document.querySelectorAll<HTMLElement>('#tools .tg').forEach((g) => {
    const on = g.id === `tg-${id}`
    g.classList.toggle('open', on)
    g.querySelector('.tg-rail')?.setAttribute('aria-expanded', String(on))
  })
  store.set('fly', id ?? '')
  if (id) {
    flyOff = register(
      () => {
        // Esc: флайаут закрывается, фокус — на кнопку группы
        const rail = document.querySelector<HTMLElement>(`#tg-${id} .tg-rail`)
        setFly(null)
        rail?.focus({ preventScroll: true })
      },
      MENU_RANK,
      'fly',
    )
  }
}

function addRailButton(section: HTMLElement) {
  const domId = section.id.replace('tg-', '')
  const def = toolGroupByDomId(domId)
  const name = def?.title ?? domId
  const h2 = section.querySelector('h2')
  if (h2) h2.textContent = name
  section.querySelector<HTMLElement>('.tg-b')!.dataset.title = name

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'tg-rail'
  btn.title = name
  btn.setAttribute('aria-label', name)
  btn.setAttribute('aria-expanded', 'false')
  btn.setAttribute('aria-controls', section.id)
  const icon = document.createElement('i')
  icon.style.setProperty('--ic', iconUrl(def?.icon ?? 'layers', INK_COLOR, RAIL_ICON_PX))
  const tip = document.createElement('span')
  tip.className = 'tg-tip'
  tip.textContent = name
  tip.setAttribute('aria-hidden', 'true')
  btn.append(icon, tip)
  btn.onclick = () => setFly(section.classList.contains('open') ? null : domId)
  section.prepend(btn)
}

/** Крестик в шапке листа «Инструменты» (узкий экран). */
function addSheetHead() {
  const close = document.createElement('button')
  close.type = 'button'
  close.id = 'tools-x'
  close.setAttribute('aria-label', 'Закрыть инструменты')
  close.title = 'Закрыть'
  close.textContent = '×'
  close.onclick = () => emit('tools-close')
  const title = document.createElement('b')
  title.textContent = 'Инструменты'
  const head = document.createElement('div')
  head.id = 'tools-head'
  head.append(title, close)
  byId('tools').prepend(head)
}

export function installToolRail() {
  document.querySelectorAll<HTMLElement>('#tools .tg').forEach(addRailButton)
  const saved = store.get('fly')
  if (saved && !isToolsSheet() && toolGroupByDomId(saved)) setFly(saved)
  addSheetHead()
}

export type HeaderHosts = { moreBtnHost: HTMLElement; moreMenu: HTMLElement; searchBtnHost: HTMLElement }

/** Хосты в шапке: меню «⋯» (справка и режим мастера уходят в него) и кнопка-лупа (телефон), идущая в DOM сразу после бренда. */
export function installHeaderHosts(): HeaderHosts {
  const moreHost = document.createElement('div')
  moreHost.id = 'slot-more'
  const moreMenu = document.createElement('div')
  moreMenu.id = 'more-menu'
  moreMenu.hidden = true
  moreMenu.append(byId('slot-help'), byId('slot-master'))
  const moreBtnHost = document.createElement('span')
  moreHost.append(moreBtnHost, moreMenu)
  byId('slot-tools-btn').before(moreHost)

  const searchBtnHost = document.createElement('span')
  searchBtnHost.id = 'slot-searchbtn'
  searchBtnHost.style.display = 'contents'
  byId('slot-search').before(searchBtnHost)
  return { moreBtnHost, moreMenu, searchBtnHost }
}
