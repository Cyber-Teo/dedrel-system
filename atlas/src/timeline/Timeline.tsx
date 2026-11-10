// Временная линия: отрезки эпох, canvas-линейка событий, Play/пауза, шаг, скорость, цикл,
// зум по времени.
import { useEffect, useState } from 'preact/hooks'
import { ERAS, YEAR_MAX, YEAR_MIN } from '../events'
import { useMaster } from '../master'
import { segmentLabel } from './segments'
import { TimelineTop } from './TimelineTop'
import { TimelineTrack } from './TimelineTrack'
import { usePlayback } from './usePlayback'
import './timeline.css'

type Props = {
  year: number
  setYear: (y: number) => void
  win: number
  setWin: (w: number) => void
  evCount: number
  evOn: boolean
}

export function Timeline({ year, setYear, win, setWin, evCount, evOn }: Props) {
  const master = useMaster()
  const [scale, setScale] = useState('all') // 'all' или название эпохи: зум по времени
  const [cfg, setCfg] = useState(false)
  const seg = scale === 'all' ? null : ERAS.find((e) => e.name === scale)!
  const d0 = seg ? seg.from : YEAR_MIN
  const d1 = seg ? seg.to : YEAR_MAX
  const clamp = (y: number) => Math.max(d0, Math.min(d1, y))
  const playback = usePlayback({ year, setYear, d0, d1 })
  const era = segmentLabel(year)

  // зум по времени: год остаётся внутри отрезка
  useEffect(() => {
    if (year < d0 || year > d1) setYear(clamp(year))
  }, [scale])

  return (
    <div class={`tl ${cfg ? 'cfg' : ''}`}>
      <TimelineTop
        era={era}
        evOn={evOn}
        evCount={evCount}
        cfg={cfg}
        setCfg={setCfg}
        play={playback.play}
        togglePlay={playback.togglePlay}
        move={playback.move}
        year={year}
        setYear={setYear}
        clamp={clamp}
        win={win}
        setWin={setWin}
        step={playback.step}
        setStep={playback.setStep}
        speed={playback.speed}
        setSpeed={playback.setSpeed}
        loop={playback.loop}
        setLoop={playback.setLoop}
        scale={scale}
        setScale={setScale}
      />
      <TimelineTrack
        year={year}
        setYear={setYear}
        win={win}
        d0={d0}
        d1={d1}
        era={era}
        evOn={evOn}
        master={master}
        move={playback.move}
        jumpToEvent={playback.jumpToEvent}
      />
    </div>
  )
}
