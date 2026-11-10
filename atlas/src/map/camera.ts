// Камера: вид «вся карта», удержание центра внутри растра, отступы под панели, поведение при reduced-motion.
import { LngLat, type Map } from 'maplibre-gl'
import { DEFAULT_VIEW } from '../hash'
import { H, W, lngLatToPx, pxToLngLat, screenPerPx, zoomForScreenPerPx } from '../geo/pixel'
import { isPhone } from '../ui/breakpoints'

/** Зазор между низом области карты и нижним краем растра при «Вся карта». */
const FIT_GAP = 6
/** Отступ сверху под шапку: на телефоне меньше (портрет, карта заполняет высоту и двигается пальцем). */
const FIT_TOP = 36
const FIT_TOP_PHONE = 8
/** Сколько экранных px пустого поля допускается за краем растра. */
const SLACK = 32
/** Запас высоты окна, если #map ещё не измерен: шапка 48 px и шкала времени 150 px. */
const FALLBACK_CHROME_H = 48 + 150
/** Минимальный масштаб fitView: защита от нулевой высоты. */
const MIN_FIT_SPP = 0.01
const PAD_SETTLE_MS = 60
const PAD_EASE_MS = 250
/** Отступы меньше этого (px) не двигают камеру. */
const PAD_EPSILON = 2
/** Клик, после которого смена отступов удерживает кликнутую точку в видимой части. */
const CLICK_KEEP_MS = 3000
const SIDE_GAP = 16
const DEFAULT_SIDE_W = 320
const DEFAULT_SHEET_SHARE = 0.52

/** Нужно ли пересчитывать стартовый вид при изменении высоты шкалы времени (пока пользователь не двигал карту). */
export const fitState = { pending: false }

/** Отступы камеры под панели: справа — досье/слои (десктоп), снизу — шторка (узкий экран); центр карты всегда в видимой части. */
const camPad = { right: 0, bottom: 0 }
const fitTop = () => (isPhone() ? FIT_TOP_PHONE : FIT_TOP)

export const pad = () => ({ top: fitTop(), bottom: camPad.bottom, left: 0, right: camPad.right })

/**
 * Вид по умолчанию: вся суша по высоте карты. Центр — центр мира (H/2): отступ задан padding карты,
 * поэтому хеш не зависит от размера окна.
 */
export function fitView(): { center: [number, number]; zoom: number } {
  const hv = document.getElementById('map')?.clientHeight || innerHeight - FALLBACK_CHROME_H
  // cover по высоте на любой ширине: по горизонтали карту двигают, пустых полос над/под листом нет
  const spp = Math.max(MIN_FIT_SPP, (hv - fitTop() - FIT_GAP) / H)
  return { center: [DEFAULT_VIEW.center[0], H / 2], zoom: zoomForScreenPerPx(spp) }
}

/**
 * Центр (середина области внутри padding) держим так, чтобы за краем растра было не больше SLACK экранных px пустого поля;
 * если растр меньше области — по центру.
 */
export function clampCenter(ll: LngLat, z: number): LngLat {
  const el = document.getElementById('map')
  const [x, y] = lngLatToPx([ll.lng, ll.lat])
  const spp = screenPerPx(z),
    p = pad()
  const vw = (el?.clientWidth || innerWidth) - p.left - p.right
  const vh = (el?.clientHeight || innerHeight) - p.top - p.bottom
  const axis = (v: number, size: number, half: number, slack = SLACK) => {
    const lo = half - slack / spp,
      hi = size + SLACK / spp - half
    return lo > hi ? size / 2 : Math.max(lo, Math.min(hi, v))
  }
  // сверху пустое поле от нижнего края шапки не больше SLACK (padding.top уже часть его)
  const c = pxToLngLat([axis(x, W, vw / 2 / spp), axis(y, H, vh / 2 / spp, Math.max(0, SLACK - p.top))])
  return new LngLat(c[0], c[1])
}

/** Пока пользователь не двигал карту, стартовый вид пересчитывается при изменении высоты шкалы (она появляется после создания карты). */
export function trackUserMove(map: Map, hasView: boolean) {
  fitState.pending = !hasView
  map.on('movestart', (e) => {
    if ((e as { originalEvent?: unknown }).originalEvent) fitState.pending = false
  })
}

/** Следит за панелями (классы body) и окном: сдвигает отступы камеры, центр возвращает в границы растра. */
export function trackPanelPadding(map: Map) {
  let target: { ll: LngLat; t: number } | null = null,
    timer = 0
  map.on('click', (e) => {
    target = { ll: e.lngLat, t: performance.now() }
  })
  const apply = () => {
    const b = document.body,
      side = b.classList.contains('dossier-open') || b.classList.contains('layers-open')
    const dossier = document.getElementById('dossier')
    const right = !isPhone() && side ? (dossier?.getBoundingClientRect().width || DEFAULT_SIDE_W) + SIDE_GAP : 0
    const sheetH =
      parseFloat(b.style.getPropertyValue('--sheet-h')) ||
      dossier?.getBoundingClientRect().height ||
      innerHeight * DEFAULT_SHEET_SHARE
    const bottom = isPhone() && side ? Math.round(sheetH) : 0
    if (Math.abs(right - camPad.right) < PAD_EPSILON && Math.abs(bottom - camPad.bottom) < PAD_EPSILON) return
    camPad.right = right
    camPad.bottom = bottom
    const recent = target && performance.now() - target.t < CLICK_KEEP_MS && (right || bottom) ? target.ll : undefined
    // после смены padding центр возвращаем в границы растра
    map.easeTo({ padding: pad(), center: clampCenter(recent ?? map.getCenter(), map.getZoom()), duration: PAD_EASE_MS })
  }
  const schedule = () => {
    clearTimeout(timer)
    timer = window.setTimeout(apply, PAD_SETTLE_MS)
  }
  new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] })
  addEventListener('resize', schedule)
}

/** prefers-reduced-motion: камера прыгает без анимации; настройку читаем при каждом вызове (смена в системе действует без перезагрузки). */
export function respectReducedMotion(map: Map) {
  const mq = matchMedia('(prefers-reduced-motion: reduce)')
  let reduce = mq.matches
  mq.addEventListener('change', (e) => {
    reduce = e.matches
  })
  const fly = map.flyTo.bind(map),
    ease = map.easeTo.bind(map)
  map.flyTo = (o, d) => fly(reduce ? { ...o, duration: 0 } : o, d)
  map.easeTo = (o, d) => ease(reduce ? { ...o, duration: 0 } : o, d)
}
