// Служебные пометки автора данных («(вывод: …)», «— расхождение») не показываются в тексте:
// они превращаются в признак derived (бейдж «вывод») и сноски notes.
export type Cleaned = { text: string; derived: boolean; notes: string[] }

const MARKER = /\s*\((?:как [^()]*?в )?вывод(?:\s+из|\s+по)?(?::|\s)?\s*([^()]*)\)/giu
/** Служебные координаты «маркер lat=4388.0, long=6416.2» — сырые числа, не для человека. */
const COORDS = /(?:маркер\s+)?lat\s*=\s*-?[\d.]+\s*,?\s*long\s*=\s*-?[\d.]+/giu
const DISAGREE = /\s*[—–;,]\s*расхождение/iu

export function cleanNote(raw: string | undefined | null): Cleaned {
  let s = String(raw ?? '').replace(COORDS, ''),
    derived = false
  const notes: string[] = []
  s = s.replace(MARKER, (_m, inner: string) => {
    derived = true
    const t = inner.trim().replace(/[.;:]+$/, '')
    if (t) notes.push(t)
    return ''
  })
  s = s.replace(/(^|[;.]\s*)вывод:\s*/giu, (_m, p: string) => {
    derived = true
    return p
  })
  s = s.replace(/;\s*вывод:\s*/giu, () => {
    derived = true
    return '; '
  })
  if (DISAGREE.test(s)) {
    s = s.replace(DISAGREE, '')
    notes.push('источники расходятся')
  }
  s = s
    .replace(/\s+([.,;])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/[;,]\s*$/, '')
    .replace(/^[;,.\s]+/, '')
    .trim()
  return { text: s, derived, notes }
}

/** Служебные слова, которых не должно остаться в показываемом тексте. */
export const SERVICE_RE =
  /\(\s*(?:как [^()]*в )?вывод|(?:^|[;.]\s*)вывод\s*:|расхождени|errata|прежняя точка|исправлена по растру|маркер карты|Положение не указано/iu
