// Кнопки слоёв истории («Политика по годам», «Ландшафт по эпохам»), легенда политики и плашки.
// Состояние слоёв — в хеше (l=…politics,landscape); год — из ползунка хроники.
import { createPortal } from 'preact/compat'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Map, MapSourceDataEvent } from 'maplibre-gl'
import type { Mode } from '../hash'
import { CONFIDENCE_RU, yearG, yearLabel } from '../events'
import { PRESETS } from '../presets/presets'
import { readHistoryLayers, withHistoryLayers } from '../layers/layerHash'
import { setLandscape } from './landscape'
import { Coat, coatUrl } from './coats'
import { lngLatToPx } from '../geo/pixel'
import { highlightPolity, labelName, polityBounds, setPolOpacity, setPolitics } from './politics'
import { areasAt, confidenceCounts, loadCells, polities, shiftsBetween, unownedAt } from './polities'
import { listShifts, readCmp, withCmp, YEAR_END, type Shift } from './owners'
import { emit, on } from '../lib/bus'
import { CloseBtn } from '../ui/CloseBtn'
import './history.css'

const FRAMES = [
  { f: 0, n: 'начало года', t: 'Состояние на 1 января 1005: Игни ещё не заняли Западный берег' },
  { f: 0.5, n: 'лето', t: 'К июлю 1005 Игни занимают весь Западный берег' },
  { f: 0.85, n: '7 ноября', t: '7 ноября 1005 подписан мир; осенью образуется Бастионный союз' },
]
const baseMode = (map: Map): Mode =>
  ((map.getSource('base') as unknown as { tiles?: string[] })?.tiles?.[0] ?? '').includes('/muted/') ? 'muted' : 'drawn'
const toast = (text: string, undo?: () => void) => emit('toast', { text, undo })

// допустимые годы сравнения: от начала хроники до последнего события вики
const YEAR_MIN = -1685,
  YEAR_MAX = 1005
type Row = { name: string; color: string; ids: string[]; area: number; pts: [number, number][] }

export function HistoryToggles({ map, year, setMode }: { map: Map; year: number; setMode?: (m: Mode) => void }) {
  const init = useMemo(() => readHistoryLayers(location.hash), [])
  const [pol, setPol] = useState(init.politics),
    [land, setLand] = useState(init.landscape)
  const [frac, setFrac] = useState(YEAR_END)
  const [base, setBase] = useState<Mode>(() => baseMode(map))
  const [plate, setPlate] = useState(false),
    plateSeen = useRef(false),
    [none, setNone] = useState(false)
  const [legOpen, setLegOpen] = useState(false),
    legRef = useRef<HTMLDetailsElement>(null)
  const [rows, setRows] = useState<Row[]>([]),
    [vtick, setVtick] = useState(0)
  const [hl, setHl] = useState<string | null>(null),
    [moreShifts, setMoreShifts] = useState(false)
  const [cmp, setCmp] = useState<number | null>(() => readCmp(location.hash)),
    [cmpDraft, setCmpDraft] = useState<string | null>(null)
  const [cmpErr, setCmpErr] = useState(false),
    focusCmp = useRef(false)
  const [shifts, setShifts] = useState<Shift[]>([]),
    [unowned, setUnowned] = useState({ area: 0, ids: [] as string[] })
  const y = year === 1005 ? frac : YEAR_END
  const short = innerHeight <= 760 // низкое окно: блок штриховки и список переходов свёрнуты

  useEffect(() => {
    const f = (e: MapSourceDataEvent) => {
      if (e.sourceId === 'base') setBase(baseMode(map))
    }
    map.on('sourcedata', f)
    return () => {
      map.off('sourcedata', f)
    }
  }, [])
  useEffect(() => {
    if (year !== 1005) setFrac(YEAR_END)
  }, [year])

  const applyPol = (on: boolean) => {
    if (on !== pol) setPol(on)
  }
  useEffect(() => {
    history.replaceState(
      null,
      '',
      withCmp(withHistoryLayers(location.hash, { politics: pol, landscape: land }), pol ? cmp : null),
    )
    emit('history-state', { politics: pol, landscape: land })
  }, [pol, land, cmp])
  useEffect(() => {
    setPolitics(map, pol, year, y, cmp)
  }, [pol, year, y, cmp])
  useEffect(() => {
    setPolOpacity(map, base, year)
  }, [pol, base, year])
  useEffect(() => {
    setLandscape(map, land, year, base)
  }, [land, year, base])
  // «назад»/правка адреса: политика, ландшафт и сравнение следуют за хешем
  useEffect(() => {
    const f = () => {
      const h = readHistoryLayers(location.hash),
        c = h.politics ? readCmp(location.hash) : null
      setPol(h.politics)
      setLand(h.landscape)
      setCmp(c)
      setCmpDraft(null)
    }
    addEventListener('hashchange', f)
    addEventListener('popstate', f)
    return () => {
      removeEventListener('hashchange', f)
      removeEventListener('popstate', f)
    }
  }, [])

  useEffect(() => {
    if (!pol) {
      setRows([])
      setShifts([])
      setUnowned({ area: 0, ids: [] })
      setNone(false)
      highlightPolity(map, null)
      setHl(null)
      return
    }
    let dead = false
    loadCells().then((cells) => {
      if (dead) return
      const byName = new globalThis.Map<string, Row>()
      for (const [id, a] of areasAt(cells, year, y)) {
        const p = polities.find((q) => q.id === id)
        if (!p) continue
        const e =
          byName.get(p.name) ??
          byName.set(p.name, { name: p.name, color: p.color, ids: [], area: 0, pts: [] }).get(p.name)!
        e.ids.push(id)
        e.area += a.area
        for (const cid of a.ids) {
          const c = cells.get(cid)
          if (c) e.pts.push(c.centroid)
        }
      }
      const r = [...byName.values()].sort((a, b) => b.area - a.area)
      setRows(r)
      setNone(!r.length)
      setUnowned(unownedAt(cells, year, y))
      setShifts(cmp === null ? [] : shiftsBetween(cells, cmp, year))
      if (hl && !r.some((x) => x.name === hl)) {
        setHl(null)
        highlightPolity(map, null)
      } else if (hl) highlightPolity(map, r.find((x) => x.name === hl)!.ids)
    })
    return () => {
      dead = true
    }
  }, [pol, year, y, cmp])

  useEffect(() => {
    return on('politics-on', () => applyPol(true))
  })
  // пресеты видов переключают слои истории через событие atlas:history
  useEffect(() => {
    return on('history', (d) => {
      applyPol(d.politics)
      setLand(d.landscape)
    })
  })

  const pick = async (r: { name: string; ids: string[] }) => {
    if (hl === r.name) {
      setHl(null)
      highlightPolity(map, null)
      return
    }
    setHl(r.name)
    await highlightPolity(map, r.ids)
    const b = await polityBounds(map, r.ids, year, y)
    if (b) map.fitBounds(b, { padding: 90, maxZoom: 4, duration: 600 })
  }
  const outside = year < 1000 || year > 1006
  // плашка про подложку 1005 — один раз за сессию и только при выключенной политике; дальше — бейдж в доке
  useEffect(() => {
    if (outside && !pol) {
      if (!plateSeen.current) {
        plateSeen.current = true
        setPlate(true)
      }
    } else setPlate(false)
  }, [outside, pol])
  // плашка гаснет сама через 6 с и закрывается по Esc
  useEffect(() => {
    if (!plate) return
    const t = setTimeout(() => setPlate(false), 6000),
      k = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setPlate(false)
      }
    addEventListener('keydown', k)
    return () => {
      clearTimeout(t)
      removeEventListener('keydown', k)
    }
  }, [plate])
  // легенда политики сама раскрывается только на экране шире 1600 px (ниже — свёрнута в чип, чтобы не закрывать запад карты) и не в сценарии; дальше — чип «Политика, год ▾»
  const legAuto = useRef(false),
    inSc = () => document.body.classList.contains('dossier-open') || document.body.classList.contains('sc-sheet')
  useEffect(() => {
    if (pol && !legAuto.current) {
      legAuto.current = true
      if (innerWidth > 1600 && !inSc()) setLegOpen(true)
    }
  }, [pol])
  // ссылка со сравнением (cmp=год) открывает панель сразу: переходы видны без клика
  useEffect(() => {
    if (pol && cmp !== null && !inSc() && innerWidth > 640) setLegOpen(true)
  }, [pol, cmp !== null])
  // сценарий (досье справа / шторка) всегда сворачивает легенду
  useEffect(() => {
    const mo = new MutationObserver(() => {
      if (inSc()) setLegOpen(false)
    })
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [])
  // раскрытая легенда показывает только государства в кадре
  useEffect(() => {
    const f = () => setVtick((n) => n + 1)
    map.on('moveend', f)
    return () => {
      map.off('moveend', f)
    }
  }, [])
  const shown = useMemo(() => {
    if (!legOpen) return rows
    const b = map.getBounds(),
      [x0, y1] = lngLatToPx([b.getWest(), b.getSouth()]),
      [x1, y0] = lngLatToPx([b.getEast(), b.getNorth()])
    return rows.filter((r) => r.name === hl || r.pts.some(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1))
  }, [rows, legOpen, vtick, hl])
  const hlRow = rows.find((r) => r.name === hl)
  const lst = useMemo(() => listShifts(shifts), [shifts]),
    conf = useMemo(() => (pol ? confidenceCounts(year, y) : null), [pol, year, y])
  const commitCmp = () => {
    if (cmpDraft === null) return
    const v = Number(cmpDraft.replace(/[−–—]/g, '-').trim())
    // нечисловой ввод или год вне диапазона не принимается молча: поле помечается, а в aria-live сообщается допустимый диапазон
    if (cmpDraft.trim() !== '' && Number.isFinite(v) && v >= YEAR_MIN && v <= YEAR_MAX) {
      setCmp(v === 0 ? 1 : Math.round(v))
      setCmpErr(false)
      setCmpDraft(null)
    } else setCmpErr(true)
  }
  useEffect(() => {
    if (cmp !== null && focusCmp.current) {
      focusCmp.current = false
      document.querySelector<HTMLInputElement>('.hl-cy')?.focus({ preventScroll: true })
    }
  }, [cmp])
  useEffect(() => {
    if (cmp === null) setCmpErr(false)
  }, [cmp])
  // высота легенды — в CSS-переменную: панель слоёв ложится над ней в общий стек
  useEffect(() => {
    const root = document.documentElement.style
    if (!pol || !legRef.current) {
      root.removeProperty('--hl-h')
      return
    }
    const el = legRef.current,
      ro = new ResizeObserver(() => root.setProperty('--hl-h', `${el.offsetHeight + 8}px`))
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.removeProperty('--hl-h')
    }
  }, [pol])
  // кнопка не спорит с видом: вид с политикой держит слой, выключить его — «Сбросить вид»
  const userToggle = () => {
    if (pol) {
      const lbl = document.querySelector('.pre-list .tb.on .tbl')?.textContent ?? ''
      const held = PRESETS.find((p) => p.label === lbl && p.politics)
      if (held) {
        toast(`Политика остаётся включённой: её держит вид «${held.label}». Чтобы выключить — «Сбросить вид».`)
        return
      }
    }
    applyPol(!pol)
    if (pol) toast('Политика выключена')
  }
  return (
    <>
      <button
        class={pol ? 'on' : ''}
        onClick={userToggle}
        aria-pressed={pol}
        title="Границы государств на выбранный год (включено — заливка и подписи государств)"
      >
        Государства на карте
      </button>
      <button
        class={land ? 'on' : ''}
        onClick={() => setLand(!land)}
        aria-pressed={land}
        title="Море и болота, которых ещё нет в выбранный год"
      >
        Ландшафт по эпохам
      </button>
      {createPortal(
        <>
          {pol && (
            <details
              class="hist-legend"
              ref={legRef}
              open={legOpen}
              onToggle={(e) => setLegOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary>
                {hlRow && (
                  <Coat
                    id={hlRow.ids.find((i) => coatUrl(i))}
                    size={24}
                    color={hlRow.color}
                    name={labelName(hlRow.name)}
                  />
                )}
                Политика, {yearG(year)}
              </summary>
              <div class="hl-body">
                {year === 1005 && (
                  <div class="hl-fr" role="group" aria-label="Кадр внутри 1005 года">
                    {FRAMES.map((f) => (
                      <button class={frac === f.f ? 'on' : ''} title={f.t} onClick={() => setFrac(f.f)}>
                        {f.n}
                      </button>
                    ))}
                  </div>
                )}
                <details class="hl-key" open={!short}>
                  <summary>Что значит штриховка</summary>
                  <p class={`hl-note${cmp !== null ? ' hl-note-cmp' : ''}`}>
                    Штриховка — вывод или гипотеза; серое — нет данных.
                  </p>
                  {conf && (
                    <p
                      class="hl-count"
                      title="Клетки года с владельцем по достоверности; сумма равна числу закрашенных клеток"
                    >
                      факт {conf.canon} · вывод {conf.derived} · гипотеза {conf.speculative}{' '}
                      <small>(всего {conf.total})</small>
                    </p>
                  )}
                  <div class="hl-conf">
                    {(['canon', 'derived', 'speculative', 'none'] as const).map((c) => (
                      <span title={CONFIDENCE_RU[c].title}>
                        <i class={`sw ${c}`} />
                        {CONFIDENCE_RU[c].label}
                      </span>
                    ))}
                  </div>
                </details>
                {base === 'drawn' && setMode && (
                  <button
                    class="hl-mute"
                    title="Заливка политики прозрачнее поверх рисованной подложки; кнопка переключает подложку на приглушённую"
                    onClick={() => setMode('muted')}
                  >
                    Приглушить подложку
                  </button>
                )}
                {(year < 1000 || year > 1006) && <p class="hl-note hl-baked">Подписи подложки — на 1005 г.</p>}
                <div class="hl-cmp">
                  {cmp === null ? (
                    <button
                      class="hl-cmp-on"
                      title="Показать штриховкой участки, сменившие владельца между двумя годами"
                      onClick={() => {
                        focusCmp.current = true
                        setCmp(Math.max(YEAR_MIN, Math.min(YEAR_MAX, year - 100)))
                      }}
                    >
                      Сравнить с другим годом…
                    </button>
                  ) : (
                    <>
                      <label>
                        Сравнить с{' '}
                        <input
                          class="hl-cy"
                          type="text"
                          inputMode="text"
                          size={6}
                          aria-label="Год для сравнения"
                          value={cmpDraft ?? yearLabel(cmp)}
                          onFocus={(e) => {
                            setCmpDraft(yearLabel(cmp))
                            ;(e.target as HTMLInputElement).select()
                          }}
                          aria-invalid={cmpErr ? 'true' : undefined}
                          aria-describedby={cmpErr ? 'hl-cy-err' : undefined}
                          onInput={(e) => {
                            setCmpErr(false)
                            setCmpDraft((e.target as HTMLInputElement).value)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitCmp()
                            else if (e.key === 'Escape') {
                              setCmpErr(false)
                              setCmpDraft(null)
                              ;(e.target as HTMLInputElement).blur()
                            }
                            e.stopPropagation()
                          }}
                          onBlur={() => {
                            if (!cmpErr) setCmpDraft(null)
                          }}
                        />{' '}
                        г.
                      </label>
                      <p id="hl-cy-err" class="hl-err" role="status" aria-live="polite">
                        {cmpErr ? `Введите год от ${yearLabel(YEAR_MIN)} до ${yearLabel(YEAR_MAX)}` : ''}
                      </p>
                      <button
                        class="hl-cmp-off"
                        aria-label="Закончить сравнение"
                        title="Закончить сравнение"
                        onClick={() => setCmp(null)}
                      >
                        ✕
                      </button>
                      <details class="hl-shifts" open={!short}>
                        <summary>Что сменило хозяина</summary>
                        <div role="status" aria-label="Что сменило хозяина">
                          {cmp === year ? (
                            <p>Годы совпадают — сравнивать нечего.</p>
                          ) : shifts.length ? (
                            <>
                              <p class="hl-note">
                                Штриховкой на карте — участки, сменившие хозяина с {yearG(cmp)} на {yearG(year)}:
                              </p>
                              <ul>
                                {(moreShifts ? lst.rows : lst.rows.slice(0, 5)).map((t) => (
                                  <li>
                                    <b>{t.ids.length}</b> уч.: {t.from} → {t.to}
                                  </li>
                                ))}
                                {lst.same > 0 && (
                                  <li class="hl-same">
                                    <b>{lst.same}</b> уч. изменили статус или название — государство то же
                                  </li>
                                )}
                              </ul>
                              {lst.rows.length > 5 && (
                                <button
                                  class="hl-more"
                                  aria-expanded={moreShifts}
                                  onClick={() => setMoreShifts(!moreShifts)}
                                >
                                  {moreShifts ? 'свернуть' : `ещё ${lst.rows.length - 5}`}
                                </button>
                              )}
                            </>
                          ) : (
                            <p>
                              С {yearG(cmp)} по {yearG(year)} ни один участок не сменил владельца.
                            </p>
                          )}
                        </div>
                      </details>
                    </>
                  )}
                </div>
                {year >= 206 && year < 573 && (
                  <p class="hl-note hl-gross">
                    Гросс до 573 г. — провинция Иллиорской империи (вошёл в 206 г., отделился в 573 г.): на карте он
                    залит цветом империи.
                  </p>
                )}
                <div class="hl-list">
                  {shown.map((r) => (
                    <button class={hl === r.name ? 'on' : ''} title="Подсветить и приблизить" onClick={() => pick(r)}>
                      <Coat id={r.ids.find((i) => coatUrl(i))} size={18} color={r.color} name={labelName(r.name)} />
                      {labelName(r.name)}
                    </button>
                  ))}
                  {unowned.ids.length > 0 && (
                    <div
                      class="hl-unowned"
                      title={`Участки без хозяина или без сведений в вики: ${unowned.ids.length}`}
                    >
                      <Coat color="#6a6760" name="?" size={18} />
                      без владельца / нет сведений<small>{unowned.ids.length}</small>
                    </div>
                  )}
                </div>
              </div>
            </details>
          )}
          {pol && none && (
            <div class="hist-plate" role="status">
              Для этого года границ нет
            </div>
          )}
          {plate && (
            <div class="hist-plate" role="status">
              <span>Подложка — по состоянию на 1005 г.; границы смотрите в слое «Политика»</span>
              <button onClick={() => applyPol(true)}>Включить политику</button>
              <CloseBtn onClick={() => setPlate(false)} label="Скрыть" />
            </div>
          )}
        </>,
        document.body,
      )}
    </>
  )
}
