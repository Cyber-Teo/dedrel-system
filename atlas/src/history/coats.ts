// Гербы и флаги государств (data/coats.yaml → public/coats/*.webp). Источник картинок — dedrel.teo.uy, CC BY-NC 4.0.
// coatUrl(ownerId) — адрес картинки или null (нет файла или владелец её не подтвердил: confirmed: false); тогда рисуется щит-заглушка.
// <Coat id size color name> — герб size px либо щит цвета color с инициалом name.
import { h } from 'preact'
import { loadData } from '../data/load'

type CoatRec = { file: string; original?: string; page?: string; kind?: 'coat' | 'flag'; confirmed?: boolean }
const coats = await loadData<Record<string, CoatRec>>('coats')

export const COATS_ATTRIBUTION =
  'Гербы и флаги государств — по материалам вики мира dedrel.teo.uy, лицензия CC BY-NC 4.0.'

export function coatUrl(ownerId: string): string | null {
  const c = coats[ownerId]
  return c && c.confirmed !== false ? `${import.meta.env?.BASE_URL ?? '/'}${c.file}` : null
}

/** Цвет текста на заливке: тёмный на светлой, светлый на тёмной. */
const ink = (hex: string) => {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16),
    l = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return l > 150 ? '#2b1a0e' : '#fff6dc'
}
const initial = (name?: string) =>
  (name ?? '')
    .replace(
      /^(Королевство|Княжество|Республика|Страна|Земли|Край|Побережье|Плато|Бастионный|Вышневодское|Залесское)\s+/i,
      '',
    )
    .trim()
    .charAt(0)
    .toUpperCase() || '·'

/** Щит-заглушка: цвет заливки государства и инициал названия. */
export function Shield({ size = 18, color = '#999', name }: { size?: number; color?: string; name?: string }) {
  return h(
    'svg',
    {
      class: 'coat coat-shield',
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      role: 'img',
      'aria-label': 'щит-заглушка',
      style: { width: `${size}px`, height: `${size}px` },
    },
    h('path', {
      d: 'M3 2.5h18v9.5c0 5.2-3.6 8.4-9 10-5.4-1.6-9-4.8-9-10z',
      fill: color,
      stroke: '#2b1a0e',
      'stroke-opacity': '.55',
      'stroke-width': '1.2',
    }),
    h(
      'text',
      {
        x: 12,
        y: 14.5,
        'text-anchor': 'middle',
        'font-size': 11,
        'font-weight': 700,
        'font-family': 'Georgia, serif',
        fill: ink(color),
      },
      initial(name),
    ),
  )
}

export function Coat({
  id,
  size = 18,
  color,
  name,
}: {
  id?: string | null
  size?: number
  color?: string
  name?: string
}) {
  const u = id ? coatUrl(id) : null
  return u
    ? h('img', {
        class: 'coat',
        src: u,
        width: size,
        height: size,
        alt: '',
        loading: 'lazy',
        decoding: 'async',
        style: { width: `${size}px`, height: `${size}px` },
      })
    : h(Shield, { size, color, name })
}
