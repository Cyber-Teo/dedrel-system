// Кнопки шапки, которые портируются в слоты index.html: подложка, «⋯», поиск (телефон), «Инструменты».
import { createPortal } from 'preact/compat'
import type { Mode } from '../hash'
import { isNarrow } from '../ui/breakpoints'
import { byId } from '../ui/dom'
import { Ic } from '../ui/uiIcons'

const modeName = (m: Mode) => (m === 'drawn' ? 'рисованная' : 'приглушённая')

type Props = {
  mode: Mode
  onMode: (m: Mode) => void
  moreOpen: boolean
  onMore: () => void
  moreBtnHost: HTMLElement
  searchOpen: boolean
  onSearch: () => void
  searchBtnHost: HTMLElement
  toolsOpen: boolean
  onTools: () => void
}

export function HeaderButtons(p: Props) {
  const next: Mode = p.mode === 'drawn' ? 'muted' : 'drawn'
  const baseTitle =
    p.mode === 'drawn'
      ? 'Подложка: рисованная (карта мира как нарисована автором). Нажмите: приглушённая, чтобы читались цвета политики'
      : 'Подложка: приглушённая (бледный фон). Нажмите: рисованная'
  return (
    <>
      {createPortal(
        <button
          type="button"
          id="basemap-btn"
          class="hbtn"
          aria-label={`Подложка: ${modeName(p.mode)}. Переключить`}
          title={baseTitle}
          onClick={() => p.onMode(next)}
        >
          <i class={`bsw ${p.mode}`} aria-hidden="true" />
          <span class="bl">Подложка: {modeName(p.mode)}</span>
          <span class="hcap">Фон</span>
        </button>,
        byId('slot-basemap'),
      )}
      {createPortal(
        <button
          type="button"
          id="more-btn"
          class="hbtn"
          aria-expanded={p.moreOpen}
          aria-controls="more-menu"
          aria-label="Ещё: справка, режим мастера"
          title="Ещё: справка, режим мастера"
          onClick={p.onMore}
        >
          <Ic n="more" size={20} />
          <span class="hcap">Ещё</span>
        </button>,
        p.moreBtnHost,
      )}
      {createPortal(
        <button
          type="button"
          id="search-btn"
          class="hbtn"
          aria-label="Поиск"
          aria-keyshortcuts="/"
          tabIndex={isNarrow() ? undefined : -1}
          aria-expanded={p.searchOpen}
          title="Поиск (/)"
          onClick={p.onSearch}
        >
          <Ic n="search" size={22} />
          <span class="hcap">Поиск</span>
        </button>,
        p.searchBtnHost,
      )}
      {createPortal(
        <button
          type="button"
          class={`tools-btn ${p.toolsOpen ? 'on' : ''}`}
          aria-expanded={p.toolsOpen}
          aria-controls="tools"
          aria-label="Инструменты"
          title="Инструменты: измерения, готовые наборы, списки"
          onClick={p.onTools}
        >
          <Ic n="tools" />
          <span class="bl">Инструменты</span>
          <span class="hcap">Инструменты</span>
        </button>,
        byId('slot-tools-btn'),
      )}
    </>
  )
}
