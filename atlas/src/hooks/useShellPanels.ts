// Панели шапки: лист «Инструменты», поиск (лупа на телефоне) и меню «⋯». На узком экране открыта одна панель за раз.
import type { Map } from 'maplibre-gl'
import { useEffect, useState } from 'preact/hooks'
import { setFly } from '../shell/toolRail'
import { isNarrow, isToolsSheet } from '../ui/breakpoints'
import { byId } from '../ui/dom'
import { useOverlay } from '../ui/overlayStack'
import { announcePanel, onPanel } from '../ui/panels'
import { on } from '../lib/bus'

/** Ранг в стеке оверлеев для меню и листов (закрываются последними). */
const MENU_RANK = 4
const SEARCH_INPUT = '#slot-search input'

type Opts = { map: Map; moreMenu: HTMLElement; master: boolean; activeToolId: string | undefined }

export function useShellPanels({ map, moreMenu, master, activeToolId }: Opts) {
  const [toolsOpen, setToolsOpenRaw] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const closeTools = () => setToolsOpenRaw(false)
  const setToolsOpen = (v: boolean) => {
    setToolsOpenRaw(v)
    if (v) announcePanel('tools')
  }

  // инструмент выбран на узком экране: лист закрывается, чтобы первый тап по карте ставил точку А
  useEffect(() => {
    if (activeToolId && isToolsSheet()) closeTools()
  }, [activeToolId])
  useEffect(() => on('tools-close', closeTools), [])
  useEffect(
    () =>
      onPanel((p) => {
        if (p !== 'tools') closeTools()
      }),
    [],
  )
  // тап по карте закрывает меню и поиск
  useEffect(() => {
    const f = () => {
      closeTools()
      setSearchOpen(false)
    }
    map.on('mousedown', f)
    map.on('touchstart', f)
    return () => {
      map.off('mousedown', f)
      map.off('touchstart', f)
    }
  }, [map])
  useEffect(() => {
    document.body.classList.toggle('search-open', searchOpen)
    if (searchOpen) document.querySelector<HTMLInputElement>(SEARCH_INPUT)?.focus()
  }, [searchOpen])
  useEffect(() => {
    document.body.classList.toggle('tools-open', toolsOpen)
  }, [toolsOpen])
  useOverlay(toolsOpen && isToolsSheet(), closeTools, MENU_RANK)
  useOverlay(searchOpen, () => setSearchOpen(false), MENU_RANK)

  // «/» — поиск
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key !== '/' || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || e.metaKey || e.ctrlKey) return
      e.preventDefault()
      if (isNarrow()) setSearchOpen(true)
      else document.querySelector<HTMLInputElement>(SEARCH_INPUT)?.focus()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  // «⋯» и автозакрытие колонки после запуска инструмента/набора/окна
  useEffect(() => {
    moreMenu.hidden = !moreOpen
    document.getElementById('more-btn')?.setAttribute('aria-expanded', String(moreOpen))
  }, [moreOpen])
  useOverlay(moreOpen, () => setMoreOpen(false), MENU_RANK)
  useEffect(() => {
    const tools = byId('tools'),
      canvas = map.getCanvas()
    const pointerDown = (e: Event) => {
      if (!(e.target as HTMLElement).closest?.('#slot-more')) setMoreOpen(false)
    }
    const click = (e: Event) => {
      if ((e.target as HTMLElement).closest?.('#help-btn')) setMoreOpen(false)
    }
    const toolsClick = (e: Event) => {
      const b = (e.target as HTMLElement).closest?.('.tg-b button')
      if (!b || b.closest('.exp-opt') || b.matches('.pre-reset')) return
      setTimeout(() => {
        if (isToolsSheet()) closeTools()
        else setFly(null)
      }, 0)
    }
    const canvasDown = (e: Event) => {
      if (!isToolsSheet() && !(e.target as HTMLElement).closest?.('#tools')) setFly(null)
    }
    document.addEventListener('pointerdown', pointerDown)
    document.addEventListener('click', click)
    tools.addEventListener('click', toolsClick)
    canvas.addEventListener('pointerdown', canvasDown)
    return () => {
      document.removeEventListener('pointerdown', pointerDown)
      document.removeEventListener('click', click)
      tools.removeEventListener('click', toolsClick)
      canvas.removeEventListener('pointerdown', canvasDown)
    }
  }, [map])
  useEffect(() => {
    document.getElementById('more-btn')?.classList.toggle('dot', master)
  }, [master])

  return { toolsOpen, setToolsOpen, closeTools, searchOpen, setSearchOpen, moreOpen, setMoreOpen }
}
