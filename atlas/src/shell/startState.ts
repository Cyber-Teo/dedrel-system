// Начальное состояние из адреса: вид карты и подложка (хеш), год и окно лет (хеш или ?year=, ?win=).
import { DEFAULT_YEAR } from '../chronicle/eras'
import { clampYear } from '../chronicle/yearFormat'
import { hashParams, parseHash, readYear } from '../hash'

/** Окно лет вокруг выбранного года по умолчанию (±). */
const DEFAULT_WIN = 5

export function readStartState() {
  const query = new URLSearchParams(location.search)
  return {
    view: parseHash(location.hash),
    hasView: hashParams().has('cx'),
    year: clampYear(readYear(location.hash) ?? +(query.get('year') ?? DEFAULT_YEAR)),
    win: +(query.get('win') ?? DEFAULT_WIN),
    master: query.has('master'),
  }
}
