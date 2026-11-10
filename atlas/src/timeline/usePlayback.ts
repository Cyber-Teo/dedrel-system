// Проигрывание шкалы: шаг, скорость, цикл, пауза и горячие клавиши перелистывания лет.
import { useEffect, useRef, useState } from 'preact/hooks'
import { EV_YEARS } from './eventIndex'

export const STEPS = [1, 5, 10, 25]
export const SPEEDS = [
  { n: '×1', ms: 600 },
  { n: '×2', ms: 300 },
  { n: '×4', ms: 150 },
  { n: '×8', ms: 75 },
]
const DEFAULT_STEP = 5
const DEFAULT_SPEED = 1
/** Множитель шага для PageUp/PageDown. */
export const PAGE_MULT = 10

type Opts = { year: number; setYear: (y: number) => void; d0: number; d1: number }

export function usePlayback({ year, setYear, d0, d1 }: Opts) {
  const [step, setStep] = useState(DEFAULT_STEP)
  const [speed, setSpeed] = useState(DEFAULT_SPEED)
  const [loop, setLoop] = useState(() => !matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [play, setPlay] = useState(false)
  // Актуальные значения для обработчиков, навешенных один раз (горячие клавиши, таймер).
  const st = useRef({ year, step, loop, d0, d1, play })
  st.current = { year, step, loop, d0, d1, play }

  const move = (dir: number, mult = 1) => {
    const { year: y, step: s, d0, d1 } = st.current
    setYear(Math.max(d0, Math.min(d1, y + dir * s * mult)))
  }

  useEffect(() => {
    if (!play) return
    const id = setInterval(() => {
      const { year: y, step: s, loop, d0, d1 } = st.current
      if (y + s <= d1) setYear(y + s)
      else if (loop) setYear(d0)
      else {
        setYear(d1)
        setPlay(false)
      }
    }, SPEEDS[speed].ms)
    return () => clearInterval(id)
  }, [play, speed])

  const togglePlay = () => {
    if (st.current.play) {
      setPlay(false)
      return
    } // не замыкание: горячая клавиша навешена один раз и видела бы play=false вечно
    if (st.current.year >= st.current.d1) setYear(st.current.d0) // на конце шкалы Play стартует с начала отрезка
    setPlay(true)
  }

  // стрелки принадлежат карте и сфокусированным элементам; год листают [ ] и Alt+←/→
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (/^(INPUT|SELECT|TEXTAREA|BUTTON|A|SUMMARY)$/.test(t.tagName) || t.isContentEditable || e.metaKey || e.ctrlKey)
        return
      const bracket = !e.altKey && (e.code === 'BracketLeft' || e.code === 'BracketRight')
      if (bracket) {
        e.preventDefault()
        move(e.code === 'BracketLeft' ? -1 : 1)
      } else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        move(e.key === 'ArrowLeft' ? -1 : 1)
      } else if (e.code === 'Space' && !e.altKey) {
        e.preventDefault()
        togglePlay()
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  /** Перейти к ближайшему году с событием в сторону dir внутри отрезка. */
  const jumpToEvent = (dir: number) => {
    const { year: y, d0, d1 } = st.current
    const target =
      dir > 0 ? EV_YEARS.find((v) => v > y && v <= d1) : [...EV_YEARS].reverse().find((v) => v < y && v >= d0)
    if (target !== undefined) setYear(target)
  }

  return { step, setStep, speed, setSpeed, loop, setLoop, play, move, togglePlay, jumpToEvent }
}
