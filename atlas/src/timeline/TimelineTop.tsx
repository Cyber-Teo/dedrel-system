// Верхняя строка шкалы: год и эпоха, подсказки, кнопки проигрывания и панель настроек.
import type { ComponentProps } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { yearLabel, yearTitle } from '../events'
import { readHistoryLayers } from '../layers/layerHash'
import { pluralEvents } from './eventIndex'
import { TimelineConfig } from './TimelineConfig'
import { on } from '../lib/bus'

/** Подложка нарисована по состоянию на 1005 г.; плашка о ней показывается вне окна 1000–1006. */
const BASE_YEAR = 1005
const BASE_NOTE_FROM = 1000
const BASE_NOTE_TO = 1006

type Props = ComponentProps<typeof TimelineConfig> & {
  era: string
  evOn: boolean
  evCount: number
  play: boolean
  togglePlay: () => void
  move: (dir: number) => void
  cfg: boolean
  setCfg: (v: boolean) => void
}

export function TimelineTop({ era, evOn, evCount, play, togglePlay, move, cfg, setCfg, ...config }: Props) {
  const { year, win } = config
  const gear = useRef<HTMLButtonElement>(null)
  const [politics, setPolitics] = useState(() => readHistoryLayers(location.hash).politics)

  useEffect(() => {
    return on('history-state', (d) => setPolitics(d.politics))
  }, [])
  // Esc закрывает настройки, фокус возвращается на шестерёнку
  useEffect(() => {
    if (!cfg) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      setCfg(false)
      gear.current?.focus()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [cfg])

  const baseNote = politics
    ? `Заливка государств — на выбранный год, а подписи и рисунок подложки нарисованы ` +
      `по состоянию на ${BASE_YEAR} г.`
    : `Политика выключена: подложка карты нарисована по состоянию на ${BASE_YEAR} г.`
  return (
    <div class="tl-top">
      <div class="tl-year">
        <b class="yr" title={yearTitle(year)}>
          {yearLabel(year)}
        </b>
        <span class="era">{era}</span>
        {evOn && (
          <span class="cnt" title="События хроники в окне вокруг выбранного года">
            в окне ±{win} лет: {evCount} {pluralEvents(evCount)}
          </span>
        )}
        {(year < BASE_NOTE_FROM || year > BASE_NOTE_TO) && (
          <span class="tl-base" title={baseNote}>
            подложка: {BASE_YEAR} г.
          </span>
        )}
      </div>
      <span class="tl-key" title="Штрихи на шкале — события хроники; цвет — тип события (легенда в ⚙)">
        <i />
        штрих — событие, цвет — тип
      </span>
      <div class="tl-btns">
        <button
          class={`tl-play ${play ? 'on' : ''}`}
          onClick={togglePlay}
          title="Играть / пауза (Пробел)"
          aria-label={play ? 'Пауза' : 'Играть'}
        >
          <span class="ic">{play ? '❚❚' : '▶'}</span>
          <span class="tx">{play ? ' Пауза' : ' Играть'}</span>
        </button>
        <button onClick={() => move(-1)} title="Назад на шаг ( [ )" aria-label="Назад на шаг">
          ‹
        </button>
        <button onClick={() => move(1)} title="Вперёд на шаг ( ] )" aria-label="Вперёд на шаг">
          ›
        </button>
        <button
          class="tl-gear"
          ref={gear}
          aria-expanded={cfg}
          aria-controls="tl-cfg"
          aria-label="Настройки шкалы"
          title="Шаг, скорость, отрезок, окно событий"
          onClick={() => setCfg(!cfg)}
        >
          ⚙
        </button>
      </div>
      <TimelineConfig {...config} />
    </div>
  )
}
