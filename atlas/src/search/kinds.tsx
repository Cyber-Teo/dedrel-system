// Типы объектов поиска: русские подписи и значки (своё SVG, 24x24, контур currentColor, акцент золото).
import type { JSX } from 'preact'

export const KIND_RU: Record<string, string> = {
  city: 'город',
  capital: 'столица',
  fortress: 'крепость',
  region: 'регион',
  island: 'остров',
  river: 'река',
  port: 'порт',
  forest: 'лес',
  sea: 'море',
  ruin: 'руины',
  lake: 'озеро',
  school: 'школа',
  swamp: 'болото',
  mountains: 'горы',
  mine: 'шахта',
  desert: 'пустыня',
  temple: 'храм',
  village: 'деревня',
  country: 'страна',
}
/** Английские значения kind организаций из данных → русский. */
export const ORG_KIND_RU: Record<string, string> = {
  guild: 'гильдия',
  army: 'армия',
  school: 'школа',
  bank: 'банк',
  legislature: 'законодательный орган',
  administration: 'администрация',
  religion: 'религия',
  dynasty: 'династия',
  guard: 'стража',
  intelligence: 'разведка',
  nobility: 'знать',
  'caravan cartel': 'караванный картель',
  'city guard': 'городская стража',
  'noble family': 'знатный род',
  gang: 'банда',
}
export const orgKindRu = (k?: string) => (k ? (ORG_KIND_RU[k] ?? k) : '')

const G = '#b8892b'
const P: Record<string, string> = {
  city: '<path d="M4 20V10h5v10M9 20V6h6v14M15 20v-8h5v8M3 20h18"/><path class="g" d="M11 9h2M11 12h2"/>',
  capital:
    '<path d="M4 20h16M6 20V10l6-6 6 6v10"/><path class="g" d="m12 9 1 2 2.200.3-1.600 1.500.4 2.200-2-1.100-2 1.100.4-2.200L8.800 11.300 11 11z"/>',
  fortress: '<path d="M5 20V8h3v2h2V8h4v2h2V8h3v12zM3 20h18"/><path class="g" d="M10 20v-4a2 2 0 0 1 4 0v4"/>',
  region: '<path d="M4 7l5-3 6 3 5-3v13l-5 3-6-3-5 3z"/><path class="g" d="M9 4v13M15 7v13"/>',
  island: '<path d="M3 17c3-1 5-1 9 0s6 1 9 0M6 14c0-3 3-5 6-5s6 2 6 5"/><path class="g" d="M12 9V5l3 1.500"/>',
  river: '<path d="M4 6c4 0 4 4 8 4s4-4 8-4M4 13c4 0 4 4 8 4s4-4 8-4"/><path class="g" d="M4 20c4 0 4-2 8-2"/>',
  port: '<circle cx="12" cy="6" r="2"/><path d="M12 8v12M6 13H4a8 8 0 0 0 16 0h-2M8 11h8"/>',
  forest: '<path d="m12 3-5 7h3l-4 6h12l-4-6h3z"/><path class="g" d="M12 16v5"/>',
  sea: '<path d="M3 9c3-3 6 3 9 0s6 3 9 0M3 15c3-3 6 3 9 0s6 3 9 0"/><path class="g" d="M3 20c3-2 6 2 9 0s6 2 9 0"/>',
  ruin: '<path d="M5 20V9l3-2v5l3-2 2 3 3-3v10M3 20h18"/><path class="g" d="M16 7l1.500-3"/>',
  lake: '<ellipse cx="12" cy="13" rx="8" ry="5"/><path class="g" d="M8 13c2-1.500 6 1.500 8 0"/>',
  school: '<path d="M3 9l9-4 9 4-9 4z"/><path d="M7 11.500V16c3 2 7 2 10 0v-4.500"/><path class="g" d="M21 9v6"/>',
  swamp: '<path d="M3 18c3-1 5-1 9 0s6 1 9 0"/><path class="g" d="M8 17c0-5 1-8 1-9M12 17V6M16 17c0-4-1-6-1-8"/>',
  mountains: '<path d="m2 19 7-12 4 7 2-3 7 8z"/><path class="g" d="m9 7 2 4-2-1-2 1z"/>',
  mine: '<path d="M5 8c3-4 11-4 14 0M12 5v14"/><path class="g" d="m8 20 4-6 4 6"/>',
  desert: '<path d="M3 18c3-5 6-5 9-1 3-4 6-4 9 1"/><circle class="g" cx="17" cy="7" r="2.200"/>',
  temple: '<path d="M3 9l9-5 9 5zM5 9v9M9 9v9M15 9v9M19 9v9M3 20h18"/>',
  village: '<path d="M4 20v-8l5-4 5 4v8zM14 20v-6l4-3 3 3v6M3 20h18"/>',
  country: '<path d="M6 21V4"/><path class="g" d="M6 5h12l-2.500 4L18 13H6"/>',
  polity: '<path d="M6 21V4"/><path class="g" d="M6 5h12l-2.500 4L18 13H6"/>',
  era: '<path d="M7 4h10M7 20h10M8 4c0 5 8 5 8 8s-8 3-8 8M16 4c0 5-8 5-8 8s8 3 8 8"/>',
  person: '<circle cx="12" cy="8" r="3.500"/><path class="g" d="M5 20c1-4 4-6 7-6s6 2 7 6"/>',
  org: '<path d="M12 3 4 6v6c0 4 3 7 8 9 5-2 8-5 8-9V6z"/><path class="g" d="M9 12l2 2 4-4"/>',
  event: '<path d="M6 4h10l3 3v13H6z"/><path class="g" d="M9 10h7M9 14h7M9 17h4"/>',
  other: '<circle cx="12" cy="12" r="3"/><path class="g" d="M12 4v3M12 17v3M4 12h3M17 12h3"/>',
}
export const iconKey = (k?: string) => (k && P[k] ? k : 'other')

export function KindIcon({ k, size = 18 }: { k?: string; size?: number }): JSX.Element {
  const body = P[iconKey(k)].replace(/class="g"/g, `stroke="${G}"`)
  return (
    <svg
      class="kic"
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  )
}
