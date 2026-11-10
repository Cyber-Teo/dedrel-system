// Параметры ?welcome=0 (не показывать, для автотестов) и ?welcome=1 (показать принудительно).
// Приветственная карточка при первом заходе. После закрытия не появляется (localStorage dedrel-welcome=1); вызвать снова: событие welcome (lib/bus) или «?» → «Показать приветствие».
// Кнопки действуют через публичные функции пресетов и слоёв, код пресетов не меняется.
import { createPortal } from 'preact/compat'
import { useEffect, useRef, useState } from 'preact/hooks'
import { useOverlay } from './overlayStack'
import { store } from './panels'
import { WIKI_URL } from '../config'
import { isToolsSheet } from './breakpoints'
import { Ic } from './uiIcons'
import { on } from '../lib/bus'

export function Onboarding({ presetById, showEvents }: { presetById: (id: string) => void; showEvents: () => void }) {
  const [open, setOpen] = useState(() => {
    const q = new URLSearchParams(location.search),
      w = q.get('welcome')
    return w === '1' || (w !== '0' && q.get('tour') !== '1' && store.get('welcome') !== '1')
  })
  const ref = useRef<HTMLDivElement>(null)
  // after: 'search' (крестик/Esc) — фокус в поле поиска без раскрытия «Популярного»; 'map' (пресет) — фокус на карту
  const close = (after: 'search' | 'map' = 'search') => {
    store.set('welcome', '1')
    setOpen(false)
    setTimeout(() => {
      const vis = document.querySelector<HTMLInputElement>('#slot-search input')?.getClientRects().length
      if (after === 'map' || !vis) {
        ;(document.querySelector<HTMLElement>('#map canvas') ?? document.getElementById('map'))?.focus({
          preventScroll: true,
        })
        return
      }
      const inp = document.querySelector<HTMLInputElement>('#slot-search input')
      if (!inp) return
      document.body.classList.add('no-pop')
      inp.focus({ preventScroll: true })
      setTimeout(() => inp.setAttribute('aria-expanded', 'false'), 60)
      const off = () => {
        document.body.classList.remove('no-pop')
        inp.removeEventListener('pointerdown', off)
        inp.removeEventListener('input', off)
        inp.removeEventListener('keydown', off)
        inp.removeEventListener('blur', off)
      }
      inp.addEventListener('pointerdown', off)
      inp.addEventListener('input', off)
      inp.addEventListener('keydown', off)
      inp.addEventListener('blur', off)
    }, 30)
  }
  useOverlay(open, () => close(), 0)
  useEffect(() => {
    return on('welcome', () => setOpen(true))
  }, [])
  useEffect(() => {
    if (open) ref.current?.querySelector<HTMLElement>('h2')?.focus()
  }, [open])
  if (!open) return null
  const narrow = isToolsSheet()
  const go = (f: () => void) => () => {
    f()
    close('map')
  }
  const tour = () => {
    store.set('welcome', '1')
    location.assign(`${location.pathname}?tour=1${location.hash}`)
  }
  return createPortal(
    <div class="modal-ov welcome-ov" onClick={(e) => e.target === e.currentTarget && close()}>
      <div class="modal welcome" role="dialog" aria-modal="true" aria-labelledby="wl-h" ref={ref}>
        <div class="modal-head">
          <h2 id="wl-h" tabIndex={-1}>
            Атлас Дедрела
          </h2>
          <button
            type="button"
            class="x wl-skip"
            aria-label="Пропустить приветствие"
            title="Пропустить"
            onClick={() => close()}
          >
            ×
          </button>
        </div>
        <div class="wl-intro">
          <img class="wl-pic" src={`${import.meta.env.BASE_URL}icons/dragon.svg`} alt="" width="64" height="64" />
          <div>
            <p>Карта вымышленного мира Дедрела: государства, города, дороги и события за тысячелетия.</p>
            {!narrow && <p>Сверху — поиск и слои, слева — инструменты, внизу — время: год выбирается на линейке.</p>}
          </div>
        </div>
        <p>
          Год 1 — победа над Асмодеем, с него идёт летоисчисление. 1006 — условный текущий год карты: события вики
          доходят до 1005 г. Факты — из вики; границы между точками — вывод и гипотеза атласа, они помечены. Начните с
          готового вида или просто исследуйте карту.
        </p>
        <div class="wl-btns">
          <button type="button" onClick={go(() => presetById('politics-1006'))}>
            <Ic n="politics" size={22} />
            <span>Государства сегодня</span>
          </button>
          <button type="button" onClick={go(showEvents)}>
            <Ic n="quill" size={22} />
            <span>События последних лет</span>
          </button>
          <button type="button" onClick={go(() => presetById('great-war'))}>
            <Ic n="war" size={22} />
            <span>Великая война</span>
          </button>
          <button type="button" onClick={tour}>
            <Ic n="hourglass" size={22} />
            <span>Прогулка по эпохам</span>
          </button>
        </div>
        <p class="wl-wiki">
          <a class="wl-wikibtn" href={WIKI_URL} target="_blank" rel="noreferrer">
            Вики Дедрела ↗
          </a>
        </p>
      </div>
    </div>,
    document.body,
  )
}
