// Образы «моделек» для MapLibre: фишка на столе (значок с тенью и знаменем), крестик битвы, регистрация образа m|ключ|f|цвет.
import type { Map } from 'maplibre-gl'
import { warn } from '../lib/log'
import { loadSvg, loadedSvg } from './icons'

/** Моделька рисуется крупно и показывается с этим масштабом пикселей: чёткая на ретине. */
export const MODEL_PIXEL_RATIO = 3

/** Фишка на столе: тень-эллипс, значок, при необходимости зеркально и со знаменем цвета государства. Имя образа: m|ключ|f|цвет. */
export function renderModel(key: string, flip: boolean, flag: string | null, size = 144): HTMLCanvasElement | null {
  const im = loadedSvg(key)
  if (!im) return null
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!,
    s = size
  const sh = g.createRadialGradient(s * 0.5, s * 0.86, 2, s * 0.5, s * 0.86, s * 0.36)
  sh.addColorStop(0, 'rgba(35,22,8,.62)')
  sh.addColorStop(1, 'rgba(35,22,8,0)')
  g.save()
  g.translate(0, s * 0.86)
  g.scale(1, 0.26)
  g.translate(0, -s * 0.86)
  g.fillStyle = sh
  g.beginPath()
  g.arc(s * 0.5, s * 0.86, s * 0.36, 0, Math.PI * 2)
  g.fill()
  g.restore()
  g.save()
  if (flip) {
    g.translate(s, 0)
    g.scale(-1, 1)
  }
  g.shadowColor = 'rgba(43,26,14,.55)'
  g.shadowBlur = s * 0.03
  g.shadowOffsetY = s * 0.02
  g.drawImage(im, s * 0.03, -s * 0.04, s * 0.94, s * 0.94)
  g.restore()
  if (flag) {
    g.strokeStyle = '#2b2118'
    g.lineWidth = s * 0.03
    g.beginPath()
    g.moveTo(s * 0.74, s * 0.06)
    g.lineTo(s * 0.74, s * 0.46)
    g.stroke()
    g.fillStyle = flag
    g.beginPath()
    g.moveTo(s * 0.74, s * 0.06)
    g.lineTo(s * 0.97, s * 0.14)
    g.lineTo(s * 0.74, s * 0.24)
    g.closePath()
    g.fill()
    g.lineWidth = s * 0.02
    g.stroke()
  }
  return c
}
/** Крестик битвы в конце похода. */
export function crossImage(size = 64): ImageData {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  g.lineCap = 'round'
  for (const [w, col] of [
    [size * 0.26, '#f2e9d8'],
    [size * 0.14, '#7a1f1a'],
  ] as const) {
    g.lineWidth = w
    g.strokeStyle = col
    g.beginPath()
    g.moveTo(size * 0.22, size * 0.22)
    g.lineTo(size * 0.78, size * 0.78)
    g.moveTo(size * 0.78, size * 0.22)
    g.lineTo(size * 0.22, size * 0.78)
    g.stroke()
  }
  return g.getImageData(0, 0, size, size)
}

/**
 * Образ m|ключ|f|цвет должен существовать до того, как точка попадёт в источник (иначе MapLibre пишет «Image could not be loaded»).
 * false — SVG ещё грузится; после загрузки вызывается onLoaded.
 */
export function ensureModelImg(map: Map, id: string, onLoaded?: () => void): boolean {
  if (map.hasImage(id)) return true
  const [pre, key, f, col] = id.split('|')
  if (pre !== 'm') return true
  if (!loadedSvg(key)) {
    loadSvg(key)
      .then(() => onLoaded && setTimeout(onLoaded, 0))
      .catch((e) => warn('models: значок', key, e))
    return false
  }
  const c = renderModel(key, f === 'f', col && col !== '-' ? col : null)
  if (!c) return false
  map.addImage(id, c.getContext('2d')!.getImageData(0, 0, c.width, c.height), { pixelRatio: MODEL_PIXEL_RATIO })
  return true
}

/** Добавляет образ m|ключ|f|цвет, дождавшись SVG; для разрешателя недостающих образов. */
export async function addModelImage(map: Map, id: string): Promise<void> {
  const [pre, key, f, col] = id.split('|')
  if (pre !== 'm' || map.hasImage(id)) return
  await loadSvg(key).catch((e) => warn('models: значок', key, e))
  const c = renderModel(key, f === 'f', col && col !== '-' ? col : null)
  if (!c || map.hasImage(id)) return
  map.addImage(id, c.getContext('2d')!.getImageData(0, 0, c.width, c.height), { pixelRatio: MODEL_PIXEL_RATIO })
}
