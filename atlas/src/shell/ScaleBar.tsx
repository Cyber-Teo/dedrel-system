import { useEffect } from 'preact/hooks'
import { KM_PER_PX, screenPerPx } from '../geo/pixel'

/** Целевая ширина линейки масштаба, экранных px. */
const SCALE_BAR_PX = 120
/** Отступы от левого края до чипов слоёв: зазор шкалы и поля страницы. */
const CORNER_GAP_PX = 8 + 12

/** Круглое число км не больше km: 1, 2 или 5 × 10ⁿ. */
const niceKm = (km: number) => {
  const e = 10 ** Math.floor(Math.log10(km)),
    r = km / e
  return (r >= 5 ? 5 : r >= 2 ? 2 : 1) * e
}

export function ScaleBar({ zoom }: { zoom: number }) {
  const kmPerScreen = KM_PER_PX / screenPerPx(zoom)
  const barKm = niceKm(kmPerScreen * SCALE_BAR_PX)
  // единый нижний левый угол: ширина и высота шкалы -> переменные для чипов слоёв, тостов, легенды политики
  useEffect(() => {
    const scale = document.querySelector<HTMLElement>('.scale')
    if (!scale) return
    const root = document.documentElement.style
    root.setProperty('--corner-left', `${Math.ceil(scale.offsetWidth) + CORNER_GAP_PX}px`)
    root.setProperty('--scale-h', `${Math.ceil(scale.offsetHeight)}px`)
  }, [barKm, zoom])
  return (
    <div class="scale">
      <div style={{ width: `${barKm / kmPerScreen}px` }} />
      {barKm} км
    </div>
  )
}
