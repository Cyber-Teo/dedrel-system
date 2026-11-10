// Гербы столиц: кольцо с гербом государства (или щитом его цвета) на точке столицы; герб виден, пока государство живо.
import type { GeoJSONSource, Map } from 'maplibre-gl'
import { loadImage } from '../lib/image'
import { pxToLngLat } from '../geo/pixel'
import { coatUrl } from '../history/coats'
import { aliveAt, polities } from '../history/polities'
import { EMPTY_FC, type PointFeature } from '../lib/coords'
import { MODEL_PIXEL_RATIO } from './modelImage'
import { setCoatCapitals } from './icons'

export type PlaceRow = { id: string; name: string; kind: string; x?: number; y?: number }
export type Capital = { place: string; state: string }
type Owners = { polities?: Record<string, { name?: string; color?: string }> }
type CoatProps = { icon: string; state: string; name: string }
export type Coat = PointFeature<CoatProps>

const DEFAULT_COAT_COLOR = '#7a1f1a'

const SHIELD = (g: CanvasRenderingContext2D, w: number, h: number, pad: number) => {
  g.beginPath()
  g.moveTo(pad, pad + 4)
  g.lineTo(w / 2, pad)
  g.lineTo(w - pad, pad + 4)
  g.lineTo(w - pad, h * 0.52)
  g.quadraticCurveTo(w - pad, h * 0.84, w / 2, h - pad)
  g.quadraticCurveTo(pad, h * 0.84, pad, h * 0.52)
  g.closePath()
}
/** Столица: кольцо одного диаметра (все столицы одинаковы) + герб внутри (contain); без герба — щит цвета государства, без буквы. */
export function shieldImage(img: HTMLImageElement | null, color: string): ImageData {
  const S = 96,
    c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!,
    m = S / 2,
    R = 41
  g.shadowColor = 'rgba(43,26,14,.45)'
  g.shadowBlur = 4
  g.beginPath()
  g.arc(m, m, R, 0, Math.PI * 2)
  g.fillStyle = '#f2e9d8'
  g.fill()
  g.shadowBlur = 0
  g.lineWidth = 5
  g.strokeStyle = '#2b1a0e'
  g.stroke()
  g.lineWidth = 2
  g.strokeStyle = color
  g.beginPath()
  g.arc(m, m, R - 4.5, 0, Math.PI * 2)
  g.stroke()
  const box = 52
  if (img) {
    const r = Math.min(box / img.width, box / img.height)
    g.drawImage(img, m - (img.width * r) / 2, m - (img.height * r) / 2, img.width * r, img.height * r)
  } else {
    const w = 36,
      h = 42
    g.save()
    g.translate(m - w / 2, m - h / 2)
    SHIELD(g, w, h, 1)
    g.fillStyle = color
    g.fill()
    g.lineWidth = 2.5
    g.strokeStyle = '#2b1a0e'
    g.stroke()
    g.restore()
  }
  return g.getImageData(0, 0, S, S)
}

/** Гербы только у государств, живых в год year; у государства без записи в списке (неизвестного) герб остаётся. */
export function liveCoats<T extends { properties: { state: string } }>(coats: T[], year: number): T[] {
  const byId = new globalThis.Map(polities.map((q) => [q.id, q]))
  return coats.filter((c) => {
    const q = byId.get(c.properties.state)
    return !q || aliveAt(q, year)
  })
}

/** Образы гербов и точки столиц; возвращает функцию показа гербов на год. */
export async function buildCoats(
  map: Map,
  byId: globalThis.Map<string, PlaceRow>,
  caps: Capital[],
  owners: Owners,
): Promise<(year: number) => void> {
  const coats: Coat[] = []
  const capKeys: { state: string; key: string }[] = []
  for (const c of caps) {
    const p = byId.get(c.place),
      pol = owners.polities?.[c.state]
    if (p?.x === undefined || p.y === undefined) continue
    const name = String(pol?.name ?? p.name),
      url = coatUrl(c.state),
      img = url ? await loadImage(url).catch(() => null) : null,
      id = `cc|${c.state}`
    if (!map.hasImage(id))
      map.addImage(id, shieldImage(img, pol?.color ?? DEFAULT_COAT_COLOR), { pixelRatio: MODEL_PIXEL_RATIO })
    coats.push({
      type: 'Feature',
      properties: { icon: id, state: c.state, name },
      geometry: { type: 'Point', coordinates: pxToLngLat([p.x, p.y]) },
    })
    capKeys.push({ state: c.state, key: `places-ranked:${c.place}` })
  }
  return (year) => {
    const live = new Set(liveCoats(coats, year).map((f) => f.properties.state))
    setCoatCapitals(capKeys.filter((k) => live.has(k.state)).map((k) => k.key))
    const src = map.getSource('capital-coats') as GeoJSONSource | undefined
    src?.setData({ ...EMPTY_FC, features: coats.filter((f) => live.has(f.properties.state)) } as never)
  }
}
