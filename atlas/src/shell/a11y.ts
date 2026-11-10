// Доступность оболочки: ландмарк main вокруг карты, skip-ссылка и общий live-регион.
import { byId } from '../ui/dom'

/** Пауза между очисткой live-региона и новым текстом: без неё скринридер не повторит одинаковую фразу. */
const ANNOUNCE_DELAY_MS = 50

/**
 * Порядок Tab = порядок на экране: шапка → рейка → зум → карта (разметка держит карту раньше; позиции у всех fixed, z-index заданы).
 * Карта — ландмарк main, первый Tab после шапки — ссылка «К карте»; skip-ссылка первая в body.
 */
export function installA11y() {
  const map = byId('map')
  const main = document.createElement('main')
  main.id = 'main'
  main.setAttribute('aria-label', 'Карта')
  main.append(map)
  const anchor = document.getElementById('zoomc') ?? byId('tool-bar')
  anchor.after(main)
  main.after(byId('ui')) // #ui остаётся над картой

  const skip = document.createElement('a')
  skip.className = 'skip-link'
  skip.href = '#map'
  skip.textContent = 'К карте'
  skip.onclick = (e) => {
    e.preventDefault()
    ;(map.querySelector<HTMLElement>('canvas') ?? map).focus()
  }
  document.body.prepend(skip)

  const live = document.createElement('div')
  live.id = 'live'
  live.className = 'sr-only'
  live.setAttribute('role', 'status')
  live.setAttribute('aria-live', 'polite')
  document.body.append(live)
}

/** Озвучить смену состояния через live-регион. */
export function announce(text: string) {
  const live = document.getElementById('live')
  if (!live) return
  live.textContent = ''
  setTimeout(() => {
    live.textContent = text
  }, ANNOUNCE_DELAY_MS)
}
