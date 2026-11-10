// Настройки шкалы (шестерёнка): год, шаг, скорость, цикл, отрезок, окно событий
// и легенда цветов штрихов.
import { useState } from 'preact/hooks'
import { ERAS, EVENT_GROUPS, yearLabel } from '../events'
import { normalizeYear } from '../chronicle/yearFormat'
import { MASTER_COLOR } from '../theme'
import { SPEEDS, STEPS } from './usePlayback'

/** Пределы окна событий, лет. */
const WIN_MIN = 0
const WIN_MAX = 100

type Props = {
  year: number
  setYear: (y: number) => void
  clamp: (y: number) => number
  win: number
  setWin: (w: number) => void
  step: number
  setStep: (s: number) => void
  speed: number
  setSpeed: (s: number) => void
  loop: boolean
  setLoop: (v: boolean) => void
  scale: string
  setScale: (s: string) => void
}

const inputValue = (e: Event) => (e.target as HTMLInputElement).value

export function TimelineConfig(p: Props) {
  const [yearDraft, setYearDraft] = useState<string | null>(null)
  const [winDraft, setWinDraft] = useState<string | null>(null)

  const commitYear = () => {
    if (yearDraft === null) return
    const v = Number(yearDraft.replace(/[−–—]/g, '-').trim())
    if (yearDraft.trim() !== '' && Number.isFinite(v)) p.setYear(p.clamp(normalizeYear(Math.round(v))))
    setYearDraft(null)
  }
  const commitWin = () => {
    if (winDraft === null) return
    const v = Number(winDraft)
    if (winDraft.trim() !== '' && Number.isFinite(v)) p.setWin(Math.max(WIN_MIN, Math.min(WIN_MAX, Math.round(v))))
    setWinDraft(null)
  }
  const yearFocus = (e: FocusEvent) => {
    setYearDraft(yearLabel(p.year))
    ;(e.target as HTMLInputElement).select()
  }
  const yearKey = (e: KeyboardEvent) => {
    const input = e.target as HTMLInputElement
    if (e.key === 'Enter') {
      commitYear()
      input.blur()
    } else if (e.key === 'Escape') {
      setYearDraft(null)
      input.blur()
    }
    e.stopPropagation()
  }
  const winKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') commitWin()
    e.stopPropagation()
  }

  return (
    <div class="tl-ctl" id="tl-cfg" role="group" aria-label="Настройки шкалы">
      <label title="Введите год и нажмите Enter">
        Год{' '}
        <input
          class="tl-yin"
          type="text"
          inputMode="text"
          size={6}
          value={yearDraft ?? yearLabel(p.year)}
          aria-label="Год"
          onFocus={yearFocus}
          onInput={(e) => setYearDraft(inputValue(e))}
          onKeyDown={yearKey}
          onBlur={() => setYearDraft(null)}
        />
      </label>
      <label>
        шаг (лет){' '}
        <select value={p.step} onChange={(e) => p.setStep(+inputValue(e))}>
          {STEPS.map((s) => (
            <option value={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        скорость{' '}
        <select value={p.speed} onChange={(e) => p.setSpeed(+inputValue(e))}>
          {SPEEDS.map((s, i) => (
            <option value={i}>{s.n}</option>
          ))}
        </select>
      </label>
      <button
        class={`tl-loop ${p.loop ? 'on' : ''}`}
        aria-pressed={p.loop}
        title="Зациклить: после конца отрезка начать сначала"
        onClick={() => p.setLoop(!p.loop)}
      >
        ↻ зациклить
      </button>
      <label>
        отрезок{' '}
        <select value={p.scale} onChange={(e) => p.setScale(inputValue(e))}>
          <option value="all">вся история</option>
          {ERAS.map((e) => (
            <option value={e.name}>{e.name}</option>
          ))}
        </select>
      </label>
      <label title={`Сколько лет вокруг выбранного года показывать события (${WIN_MIN}–${WIN_MAX})`}>
        окно событий ±{' '}
        <input
          type="number"
          min={WIN_MIN}
          max={WIN_MAX}
          value={winDraft ?? String(p.win)}
          aria-label="Окно событий, лет"
          onInput={(e) => setWinDraft(inputValue(e))}
          onBlur={commitWin}
          onKeyDown={winKey}
        />{' '}
        лет
      </label>
      <div class="tl-groups" aria-label="Цвета штрихов по типу события">
        {EVENT_GROUPS.map((g) => (
          <span>
            <i style={{ background: g.color }} />
            {g.label}
          </span>
        ))}
        <span>
          <i style={{ background: MASTER_COLOR }} />
          слухи мастера
        </span>
      </div>
    </div>
  )
}
