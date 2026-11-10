// КОНТРАКТ. Набор SVG-иконок интерфейса, своё SVG в стиле «чернила + золото» (лицензия проекта; game-icons.net не используется,
// поэтому атрибуции CC BY 3.0 здесь нет). Контур — currentColor (чернила), акцент — золото #b8892b.
// Компонент:  <Ic n="ruler" size={18} />      Строка data-URL для CSS/DOM:  iconUrl('ruler', '#2b1a0e')
// Имена — в IC ниже; новые иконки добавлять туда (viewBox 24x24, stroke 1.6, акцент class="g").
import type { JSX } from 'preact'

const G = '#b8892b'
const IC = {
  ruler: '<path d="M3 16 16 3l5 5L8 21z"/><path class="g" d="m7 12 2 2m1.5-5.5 2 2M14 5l2 2"/>',
  route:
    '<circle cx="6" cy="18" r="2.4"/><circle class="g" cx="18" cy="6" r="2.4"/><path d="M8 17c6 0 2-9 8-10" stroke-dasharray="2.5 2.5"/>',
  area: '<path d="M4 8 12 3l8 5-2 11H6z"/><path class="g" d="M9 11h6M8 15h8"/>',
  politics: '<path d="M4 20V5h13l-2 4 2 4H4"/><path class="g" d="M4 5v16"/>',
  landscape: '<path d="m2 19 6-9 4 5 3-4 7 8z"/><circle class="g" cx="17" cy="6" r="2"/>',
  states: '<path d="M5 6h14v12H5z"/><path class="g" d="M5 10h14M10 6v12"/>',
  scenarios: '<path d="M5 4h11l3 3v13H5z"/><path class="g" d="M8 10h8M8 14h8M8 17h5"/>',
  money: '<circle cx="12" cy="12" r="8.5"/><path class="g" d="M12 7v10M9.5 9.5c0-1.5 5-1.5 5 0s-5 1.5-5 3 5 1.5 5 0"/>',
  sky: '<path d="M18 14.5A7.5 7.5 0 1 1 10 5a6 6 0 0 0 8 9.5z"/><path class="g" d="m19 4 .8 1.7L21.5 6.5l-1.7.8L19 9l-.8-1.7-1.7-.8 1.7-.8z"/>',
  gantt: '<path d="M4 6h9M7 11h12M10 16h8"/><path class="g" d="M4 3v18"/>',
  links:
    '<circle cx="6" cy="7" r="2.4"/><circle cx="18" cy="8" r="2.4"/><circle class="g" cx="12" cy="18" r="2.4"/><path d="m8 8 8 0M7.5 9l3.5 7M16.5 10 13 16"/>',
  scheme: '<path d="M4 4h16v16H4z"/><path class="g" d="M4 12h16M12 4v16"/>',
  islands:
    '<ellipse cx="7" cy="16" rx="4" ry="2.4"/><ellipse class="g" cx="16" cy="9" rx="4" ry="2.4"/><path d="M2 21c3 1.5 6 1.5 9 0s6-1.5 9 0"/>',
  png: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle class="g" cx="12" cy="12" r="3.4"/><path d="M8 5l1.2-2h5.6L16 5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path class="g" d="m3 13 9 5 9-5"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/><path class="g" d="M12 8.5v4"/>',
  tools: '<path d="M14.5 5.5a4 4 0 0 0-5 5L3.5 16.5l4 4 6-6a4 4 0 0 0 5-5l-2.5 2.5-2.5-1 1-2.5z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path class="g" d="m15 15 6 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path class="g" d="M9.2 9.5a2.8 2.8 0 1 1 4.2 2.4c-.9.6-1.4 1-1.4 2.1M12 17.2v.1"/>',
  quill: '<path d="M20 4C12 4 7 9 6 17l-2 3 3-1c8-1 13-6 13-15z"/><path class="g" d="M9 15 16 8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><circle class="g" cx="12" cy="12" r="2"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  back: '<path d="m14 6-6 6 6 6"/>',
  windows:
    '<rect x="3" y="7" width="12" height="12" rx="1.5"/><path class="g" d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h8A1.5 1.5 0 0 1 20 4.5v8a1.5 1.5 0 0 1-1.5 1.5H15"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle class="g" cx="4.6" cy="6" r="1.3"/><circle class="g" cx="4.6" cy="12" r="1.3"/><circle class="g" cx="4.6" cy="18" r="1.3"/>',
  hourglass:
    '<path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/><path class="g" d="M9.5 18.5h5"/>',
  expand: '<path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7"/>',
  basemap: '<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path class="g" d="M9 4v13.5M15 6.5V20"/>',
  war: '<path d="m4 20 12-12M14 4h6v6M20 4l-5 5"/><path class="g" d="m4 20 3-1-2-2zM10 18l2 2"/>',
  faith: '<path d="M12 3v18M6 9h12"/><circle class="g" cx="12" cy="9" r="2.4"/>',
  magic:
    '<path d="m5 19 10-10M14 4l1 2.5L17.5 7.5 15 8.5 14 11l-1-2.5-2.5-1L13 6.5z"/><path class="g" d="M18 14v4M16 16h4"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle class="g" cx="12" cy="12" r="3"/>',
  fort: '<path d="M5 20V8l2-2 2 2V6l3-2 3 2v2l2-2 2 2v12z"/><path class="g" d="M10 20v-5h4v5M12 9v2"/>',
  crown: '<path d="m4 18 1.5-9 4 4L12 6l2.5 7 4-4L20 18z"/><path class="g" d="M4 21h16"/>',
  trade:
    '<path d="M12 4v16M5 20h14"/><path class="g" d="M5 8h14M5 8l-2.5 6a2.8 2.8 0 0 0 5 0zM19 8l-2.5 6a2.8 2.8 0 0 0 5 0z"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  emblem:
    '<circle cx="12" cy="12" r="10"/><circle class="g" cx="12" cy="12" r="6.5"/><path d="m12 5.5 1.6 5.4 5.4 1.1-5.4 1.1L12 18.5l-1.6-5.4L5 12l5.4-1.1z" class="g"/>',
} as const
export type IcName = keyof typeof IC

const svg = (n: IcName, color: string, size: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${IC[n].replace(/class="g"/g, `stroke="${G}"`)}</svg>`

export function Ic({ n, size = 18, class: cls = '' }: { n: IcName; size?: number; class?: string }): JSX.Element {
  return (
    <span
      class={`ic ${cls}`}
      aria-hidden="true"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg(n, 'currentColor', size) }}
    />
  )
}

/** data-URL картинки для CSS/DOM вне Preact. */
export const iconUrl = (n: IcName, color = '#2b1a0e', size = 20) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(svg(n, color, size))}")`
