// Дорожка шкалы: canvas-линейка с ползунком года, отрезки эпох, список событий без места
// на карте и чипы эпох.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { SEGS, events, yearG, yearLabel } from '../events'
import { drawRuler } from './drawRuler'
import { EV_AT, EV_YEARS, onMapPoint, pluralEvents } from './eventIndex'
import { chipName, segColor, segText, segTextColor } from './segments'
import { PAGE_MULT } from './usePlayback'

/** Расстояние до засечки события, в пределах которого год прилипает к ней, px. */
const SNAP_PX = 3
const RULER_H = 26
const RULER_H_COARSE = 40
const DEFAULT_W = 600
const HINT_MS = 3500
const BUBBLE_EDGE_PX = 24
const DESC_MAX = 160

const shorten = (text: string) => (text.length > DESC_MAX ? text.slice(0, DESC_MAX - 3) + '…' : text)

type Props = {
  year: number
  setYear: (y: number) => void
  win: number
  d0: number
  d1: number
  era: string
  evOn: boolean
  master: boolean
  move: (dir: number, mult?: number) => void
  jumpToEvent: (dir: number) => void
}

export function TimelineTrack({ year, setYear, win, d0, d1, era, evOn, master, move, jumpToEvent }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [w, setW] = useState(DEFAULT_W)
  const [hover, setHover] = useState<number | null>(null)
  const [hint, setHint] = useState(false)
  const [dragX, setDragX] = useState<number | null>(null)
  const [noPlaceOpen, setNoPlaceOpen] = useState(false)
  const hinted = useRef(false)
  const pressed = useRef(false)
  const h = useMemo(() => (matchMedia('(pointer: coarse)').matches ? RULER_H_COARSE : RULER_H), [])

  const x2y = (x: number) => d0 + (x / w) * (d1 - d0)
  const y2x = (y: number) => ((y - d0) / (d1 - d0)) * w
  const clamp = (y: number) => Math.max(d0, Math.min(d1, y))

  useLayoutEffect(() => {
    const el = wrap.current!,
      ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    drawRuler(canvas.current!, { w, h, d0, d1, year, win, hover })
  }, [w, year, win, d0, d1, evOn, master, hover, h])

  /** Год под курсором; snap — прилипание к засечке события в пределах SNAP_PX. */
  const at = (e: PointerEvent, snap: boolean) => {
    const x = e.clientX - canvas.current!.getBoundingClientRect().left
    if (x >= w - SNAP_PX) return { y: d1, x, snapped: false }
    if (x <= SNAP_PX && !snap) return { y: d0, x, snapped: false }
    let y = Math.round(x2y(x)),
      snapped = false
    if (snap) {
      let best = Infinity
      for (const ey of EV_YEARS) {
        if (ey < d0 || ey > d1) continue
        const dx = Math.abs(y2x(ey) - x)
        if (dx <= SNAP_PX && dx < best) {
          best = dx
          y = ey
          snapped = true
        }
      }
    }
    return { y: clamp(y), x, snapped }
  }
  const pick = (e: PointerEvent, snap: boolean) => {
    const a = at(e, snap)
    setYear(a.y)
    setDragX(a.x)
  }

  const onSliderKey = (e: KeyboardEvent) => {
    if (e.altKey || e.metaKey || e.ctrlKey) return
    if (e.code === 'BracketRight' || e.code === 'BracketLeft') {
      e.preventDefault()
      e.stopPropagation()
      jumpToEvent(e.code === 'BracketRight' ? 1 : -1)
      return
    }
    const actions: Record<string, () => void> = {
      ArrowLeft: () => move(-1),
      ArrowDown: () => move(-1),
      ArrowRight: () => move(1),
      ArrowUp: () => move(1),
      PageDown: () => move(-1, PAGE_MULT),
      PageUp: () => move(1, PAGE_MULT),
      Home: () => setYear(d0),
      End: () => setYear(d1),
    }
    const act = actions[e.key]
    if (act) {
      e.preventDefault()
      e.stopPropagation()
      act()
    }
  }
  const onPointerEnter = () => {
    if (hinted.current) return
    hinted.current = true
    setHint(true)
    setTimeout(() => setHint(false), HINT_MS)
  }
  const onPointerDown = (e: PointerEvent) => {
    pressed.current = true
    setHint(false)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    pick(e, true)
  }
  const onPointerMove = (e: PointerEvent) => {
    if (pressed.current) {
      pick(e, false)
      return
    }
    const a = at(e, true)
    setHover(a.snapped ? a.y : null)
  }
  const release = () => {
    pressed.current = false
    setDragX(null)
  }

  // события окна без координат места: подсказка под шкалой со списком
  const noPlace = useMemo(
    () => (evOn ? events.filter((e) => Math.abs(e.year! - year) <= win && !onMapPoint(e)) : []),
    [evOn, year, win],
  )
  const goSeg = (name: string) => {
    const s = SEGS.find((x) => x.name === name)!
    setYear(Math.round((Math.max(s.from, d0) + Math.min(s.to, d1)) / 2))
  }
  const goEra = (s: (typeof SEGS)[number]) => setYear(Math.round((s.from + s.to) / 2))
  const visible = SEGS.filter((s) => s.to > d0 && s.from < d1)
  const evTitle = EV_AT.get(year)

  return (
    <div class="tl-rul" ref={wrap}>
      {hint && (
        <div class="tl-hint" role="note">
          Щёлкните по шкале, чтобы перейти к году
        </div>
      )}
      {dragX !== null && (
        <div class="tl-bubble" style={{ left: `${Math.max(BUBBLE_EDGE_PX, Math.min(w - BUBBLE_EDGE_PX, dragX))}px` }}>
          {yearG(year)}
        </div>
      )}
      <canvas
        ref={canvas}
        tabIndex={0}
        style={{ width: `${w}px`, height: `${h}px` }}
        role="slider"
        aria-label="Год"
        aria-orientation="horizontal"
        aria-valuemin={d0}
        aria-valuemax={d1}
        aria-valuenow={year}
        aria-valuetext={`${yearG(year)}, ${era}${evTitle ? `: ${evTitle}` : ''}`}
        onKeyDown={onSliderKey}
        onPointerEnter={onPointerEnter}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={() => setHover(null)}
      />
      <div class="tl-segs">
        {visible.map((s) => {
          const wpx = Math.max(2, y2x(Math.min(s.to, d1)) - y2x(Math.max(s.from, d0))),
            txt = segText(s, wpx)
          const cls = `${s.gap ? 'gap' : ''} ${txt !== '' ? 'lb' : ''} ${era === s.name ? 'cur' : ''}`
          const style = {
            left: `${y2x(Math.max(s.from, d0))}px`,
            width: `${wpx}px`,
            background: segColor(s),
            color: segTextColor(s),
          }
          return (
            <i
              class={cls}
              title={s.gap ? `${s.name}: сведений нет` : s.name}
              aria-label={s.name}
              style={style}
              onClick={() => goEra(s)}
            >
              {txt}
            </i>
          )
        })}
      </div>
      {noPlace.length > 0 && (
        <div class="tl-noplace" role="status">
          <span>
            {noPlace.length} {pluralEvents(noPlace.length)} без места на карте —{' '}
          </span>
          <button type="button" aria-expanded={noPlaceOpen} onClick={() => setNoPlaceOpen(!noPlaceOpen)}>
            {noPlaceOpen ? 'скрыть список' : 'открыть список'}
          </button>
          {noPlaceOpen && (
            <ul>
              {noPlace.map((e) => (
                <li>
                  <b>{yearLabel(e.year!)}</b> {e.title}
                  {e.description ? <small>{shorten(e.description)}</small> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div class="tl-chips">
        {visible
          .filter((s) => !s.gap)
          .map((s) => (
            <span class={era === s.name ? 'on' : ''} title={s.name} onClick={() => goSeg(s.name)}>
              <i style={{ background: segColor(s) }} />
              {chipName(s)}
            </span>
          ))}
      </div>
    </div>
  )
}
