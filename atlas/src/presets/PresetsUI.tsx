// Панель инструментов: пресеты видов, лента государств (карточка в слоте досье) и диаграмма Ганта (окно во весь экран).
import type { Map } from 'maplibre-gl'
import { createPortal } from 'preact/compat'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { dossierSlot, useDossier } from '../dossier'
import { YEAR_MAX, YEAR_MIN, yearG, yearLabel } from '../events'
import { pxToLngLat } from '../geo/pixel'
import type { Mode } from '../hash'
import { aliveAt, areasAt, loadCells, polities, rulerAt, type Polity } from '../history/polities'
import { highlightPolity } from '../history/politics'
import { listSpan, mergedPolities, type MPolity } from '../search/data'
import { built, shortName, areasFile } from '../layers/registry'
import { PRESETS, applyPreset, restoreView, type ViewSnap } from './presets'
import './presets.css'
import { toolGroup } from '../ui/toolGroup'
import { ToolBtn } from '../ui/ToolBtn'
import type { IcName } from '../ui/uiIcons'
import { useOverlay } from '../ui/overlayStack'
import { emit } from '../lib/bus'
import { CloseBtn } from '../ui/CloseBtn'

const readyIds = new Set(built.layers.filter((l) => l.status === 'ready').map((l) => l.id))
const yr = (y: number) => (y >= YEAR_MAX ? 'н. в.' : yearLabel(Math.round(y)))
const PRESET_ICON: Record<string, IcName> = {
  'politics-1006': 'politics',
  'great-war': 'war',
  trade: 'money',
  magic: 'magic',
  faith: 'faith',
  underground: 'eye',
  traveler: 'route',
}
const WORLD_Z = 1.3 // мировые темы: не ближе этого зума (карта целиком / весь материк)
const PAD = { top: 90, bottom: 120, left: 120, right: 120 }
/** Ограничивающий прямоугольник объектов слоёв (пиксельные координаты); null — у какого-то слоя нет точечных объектов. */
function boundsOf(layerIds: string[]): [[number, number], [number, number]] | null {
  const pts = layerIds.flatMap((id) => (built.objs.get(id) ?? []).filter((o) => o.x != null && o.y != null))
  if (
    !layerIds.length ||
    layerIds.some((id) => !(built.objs.get(id) ?? []).some((o) => o.x != null && o.y != null)) ||
    !pts.length
  )
    return null
  const xs = pts.map((o) => o.x!),
    ys = pts.map((o) => o.y!)
  const a = pxToLngLat([Math.min(...xs), Math.max(...ys)]),
    b = pxToLngLat([Math.max(...xs), Math.min(...ys)])
  return [
    [Math.min(a[0], b[0]), Math.min(a[1], b[1])],
    [Math.max(a[0], b[0]), Math.max(a[1], b[1])],
  ]
}
/** Камера набора: все объекты включённых слоёв (или весь материк, если у слоя нет точек: политика, пути, области); зум не ближе WORLD_Z. */
function fitPreset(map: Map, layerIds: string[]) {
  const bb =
    boundsOf(layerIds) ??
    (() => {
      const a = pxToLngLat([0, 5960]),
        b = pxToLngLat([7920, 0])
      return [
        [a[0], a[1]],
        [b[0], b[1]],
      ] as [[number, number], [number, number]]
    })()
  map.fitBounds(bb, { padding: PAD, maxZoom: WORLD_Z, duration: 700 })
}
type Sort = 'alpha' | 'start' | 'area'

export function PresetsUI({
  map,
  year,
  setYear: setYear0,
  setMode,
}: {
  map: Map
  year: number
  setYear: (y: number) => void
  setMode?: (m: Mode) => void
}) {
  const setYear = (y: number) => setYear0(Math.round(y))
  const [ribbon, setRibbon] = useState<{ key: number; sel: string | null } | null>(null)
  const [gantt, setGantt] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const showLegend = active === 'underground'
  const [legendShut, setLegend0] = useState(false)
  const setLegend = (v: boolean) => setLegend0(!v)
  useEffect(() => {
    if (active === 'underground') setLegend0(false)
  }, [active])
  const base = useRef<ViewSnap | null>(null)
  const lname = (id: string) => {
    const l = built.layers.find((x) => x.id === id)
    return l ? shortName(l) : id
  }
  const run = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!
    const prev = applyPreset(p, readyIds, { setMode }, lname)
    if (!active) base.current = prev
    setActive(p.id)
    fitPreset(map, p.fit ? [p.fit] : p.layers.filter((id) => readyIds.has(id)))
  }
  const reset = () => {
    const s = base.current
    if (!s) return
    restoreView(s, setMode)
    base.current = null
    setActive(null)
    setLegend(false)
    emit('toast', { text: 'Вид сброшен: возвращены прежние слои, год и подложка', undo: undefined })
  }
  return (
    <>
      {createPortal(
        <div class="pre-list" role="radiogroup" aria-label="Готовые виды карты">
          {PRESETS.map((p) => {
            const miss = p.layers.filter((id) => !readyIds.has(id)).length
            return (
              <ToolBtn
                n={PRESET_ICON[p.id] ?? 'layers'}
                on={active === p.id}
                title={p.hint + (miss ? ` (не готово слоёв: ${miss})` : '')}
                onClick={() => run(p.id)}
              >
                {p.label}
              </ToolBtn>
            )
          })}
          <button
            type="button"
            class="pre-reset"
            disabled={!active}
            title="Вернуть слои, год и подложку, какими они были до первого вида"
            onClick={reset}
          >
            Сбросить вид
          </button>
        </div>,
        toolGroup('views'),
      )}
      {showLegend &&
        !legendShut &&
        createPortal(
          <div class="pre-legend" role="group" aria-label="Гильдии: цвета сфер влияния">
            <b>Гильдии</b>
            <CloseBtn onClick={() => setLegend0(true)} label="Закрыть легенду" />
            {Object.entries(areasFile.values.guild).map(([g, v]) => (
              <div class="pl-r">
                <i
                  style={{
                    background: `repeating-linear-gradient(${(v.angle ?? 45) + 90}deg, ${v.color} 0 1.5px, transparent 1.5px 4px)`,
                    borderColor: v.color,
                  }}
                />
                {g}
              </div>
            ))}
          </div>,
          document.body,
        )}
      {createPortal(
        <ToolBtn
          n="states"
          title="Список государств года: цвет, площадь, правитель"
          on={!!ribbon}
          onClick={() => setRibbon(ribbon ? null : { key: Date.now(), sel: null })}
        >
          Государства
        </ToolBtn>,
        toolGroup('time'),
      )}
      {createPortal(
        <ToolBtn
          n="gantt"
          title="Диаграмма Ганта: сроки существования государств"
          on={gantt}
          onClick={() => setGantt(true)}
        >
          Диаграмма Ганта
        </ToolBtn>,
        toolGroup('win'),
      )}
      {ribbon && (
        <Ribbon
          key={ribbon.key}
          map={map}
          year={year}
          setYear={setYear}
          initial={ribbon.sel}
          close={() => setRibbon(null)}
        />
      )}
      {gantt && (
        <Gantt
          year={year}
          setYear={setYear}
          close={() => setGantt(false)}
          openPolity={(id) => {
            setGantt(false)
            setRibbon({ key: Date.now(), sel: id })
          }}
        />
      )}
    </>
  )
}

function Ribbon({
  map,
  year,
  setYear: setYear0,
  close,
  initial,
}: {
  map: Map
  year: number
  setYear: (y: number) => void
  close: () => void
  initial: string | null
}) {
  const setYear = (y: number) => setYear0(Math.round(y))
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('alpha')
  const [live, setLive] = useState(true)
  const [sel, setSel] = useState<string | null>(initial)
  const [cells, setCells] = useState<Awaited<ReturnType<typeof loadCells>> | null>(null)
  useEffect(() => {
    loadCells().then(setCells)
  }, [])
  useDossier('polities', true, close)
  useEffect(
    () => () => {
      highlightPolity(map, null)
    },
    [],
  )
  const lit = useRef(false)
  useEffect(() => {
    if (!initial || lit.current || !cells) return
    const p = mergedPolities.find((x) => x.ids.includes(initial))
    if (p && aliveAt(p, year)) {
      lit.current = true
      emit('history', { politics: true, landscape: false })
      setTimeout(() => highlightPolity(map, liveId(p, year)), 400)
    }
  }, [cells, year])
  const areas = useMemo(() => (cells ? areasAt(cells, year) : null), [cells, year])
  const areaOf = (p: MPolity) => p.ids.reduce((s, i) => s + (areas?.get(i)?.area ?? 0), 0)
  const flown = useRef(false)
  useEffect(() => {
    if (!initial || flown.current || !areas) return
    const p = mergedPolities.find((x) => x.ids.includes(initial))
    if (p && aliveAt(p, year)) {
      flown.current = true
      flyTo(p)
    }
  }, [areas])
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const a = areaOf
    return mergedPolities
      .filter((p) => (!ql || p.name.toLowerCase().includes(ql)) && (!live || aliveAt(p, year)))
      .sort((x, y) =>
        sort === 'alpha'
          ? x.name.localeCompare(y.name, 'ru')
          : sort === 'start'
            ? x.start - y.start
            : a(y) - a(x) || x.name.localeCompare(y.name, 'ru'),
      )
  }, [q, sort, live, year, areas])
  const flyTo = (p: MPolity) => {
    const ids = p.ids.flatMap((i) => areas?.get(i)?.ids ?? [])
    if (cells && ids.length) {
      const pts = ids.map((i) => cells.get(i)!.centroid)
      const cx = pts.reduce((s, c) => s + c[0], 0) / pts.length,
        cy = pts.reduce((s, c) => s + c[1], 0) / pts.length
      map.easeTo({ center: pxToLngLat([cx, cy]) })
    }
  }
  const pick = (p: MPolity) => {
    if (!aliveAt(p, year)) {
      setSel(null)
      highlightPolity(map, null)
      setYear(Math.max(YEAR_MIN, p.start))
      return
    }
    setSel(p.id)
    emit('history', { politics: true, landscape: false })
    setTimeout(() => highlightPolity(map, liveId(p, year)), 400)
    flyTo(p)
  }
  const cur = sel ? mergedPolities.find((p) => p.id === sel) : null
  return createPortal(
    <div class="card pol-card">
      <CloseBtn onClick={close} />
      {cur ? (
        <>
          <button
            class="back"
            onClick={() => {
              setSel(null)
              highlightPolity(map, null)
            }}
          >
            ‹ к ленте государств
          </button>
          <h3>
            <i class="sw" style={{ background: cur.color }} /> {cur.name}
          </h3>
          <div class="meta">{listSpan(cur)}</div>
          <p>
            <b>Площадь в {yearG(year)}:</b> {Math.round(areaOf(cur)).toLocaleString('ru')} км²
          </p>
          <p>
            <b>Правитель:</b> {rulerAt(cur, year)?.name ?? 'нет сведений'}
          </p>
          {cur.rulers.length > 0 && (
            <div class="evlist">
              {cur.rulers.map((r) => (
                <a onClick={() => setYear(Math.max(YEAR_MIN, Math.min(YEAR_MAX, r.from)))}>
                  {yr(r.from)} — {r.name}
                </a>
              ))}
            </div>
          )}
          <p>
            <button onClick={() => setYear(Math.max(YEAR_MIN, cur.start))}>К году основания ({yr(cur.start)})</button>
          </p>
        </>
      ) : (
        <>
          <h3>Государства</h3>
          <input
            class="lp-q"
            type="search"
            placeholder="Поиск по названию"
            value={q}
            onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          />
          <div class="pol-ctl">
            <select
              value={sort}
              onChange={(e) => setSort((e.target as HTMLSelectElement).value as Sort)}
              aria-label="Сортировка"
            >
              <option value="alpha">по алфавиту</option>
              <option value="start">по началу</option>
              <option value="area">по площади в {yr(year)}</option>
            </select>
            <label>
              <input type="checkbox" checked={live} onChange={() => setLive(!live)} /> живые в {yr(year)}
            </label>
          </div>
          <div class="meta">
            {list.length} из {mergedPolities.length}
          </div>
          <div class="pol-list">
            {list.map((p) => {
              const al = aliveAt(p, year),
                a = areaOf(p)
              return (
                <div
                  class={`pol-row ${al ? '' : 'dead'}`}
                  onClick={() => pick(p)}
                  title={al ? 'Подсветить на карте' : `Перейти к году основания: ${yr(p.start)}`}
                >
                  <i class="sw" style={{ background: p.color }} />
                  <span class="nm">{p.name}</span>
                  <small>
                    {listSpan(p)}
                    {al && a ? ` · ${Math.round(a / 1000)} тыс. км²` : al && areas ? ' · площадь: нет данных' : ''}
                  </small>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>,
    dossierSlot(),
  )
}

/** У слитой записи (два id одного имени) подсвечивается тот id, что владеет землёй в году. */
const liveId = (p: MPolity, y: number) => polities.find((r) => p.ids.includes(r.id) && aliveAt(r, y))?.id ?? p.id
const RUL = 11,
  TOP = 40,
  HH = 20,
  AX_MAX = 1100 // ось до 1100: полосы не упираются в «Сейчас»
/** Отрезки жизни государства, где правитель неизвестен (для штриховки «дальше сведений нет»). */
function rulerGaps(p: Polity): [number, number][] {
  const out: [number, number][] = []
  const rs = [...p.rulers].sort((a, b) => a.from - b.from)
  for (const [a, b] of p.spans) {
    let c = a
    for (const r of rs) {
      if (r.to <= c || r.from >= b) continue
      if (r.from > c) out.push([c, r.from])
      c = Math.max(c, r.to)
    }
    if (c < b) out.push([c, b])
  }
  return out
}
const GROUPS = ['Народы', 'Государства', 'Города и союзы'] as const
/** Группа строки Ганта по названию: союзы, города и народы отличаем по слову, остальное — государства. */
export function ganttGroup(label: string): (typeof GROUPS)[number] {
  const l = label.toLowerCase()
  if (/союз|альянс|лига|конфедерац|коалиц|орден|союзники/.test(l)) return 'Города и союзы'
  if (CITIES.has(l) || /^города\b/.test(l)) return 'Города и союзы'
  if (/^(феи|демоны|драконы|эльфы|гномы|орки|люди|нежить|первые люди|цивилизация)/.test(l)) return 'Народы'
  return 'Государства'
}
const CITIES = new Set([
  'тарпет',
  'берсан',
  'иллиор',
  'олифанор',
  'валмир',
  'дагор',
  'данир',
  'закатная бухта',
  'кривой лиор',
  'аёндо',
  'самрун',
  'вышневодск',
  'гарн',
  'деламота',
  'залесье',
  'бредон',
])
type GRow = {
  ps: Polity[]
  p: Polity
  label: string
  bars: { p: Polity; s: [number, number] }[]
  rl: { p: Polity; r: Polity['rulers'][number] }[]
}
type GEntry = { head: string } | { row: GRow }
function Gantt({
  year,
  setYear: setYear0,
  close,
  openPolity,
}: {
  year: number
  setYear: (y: number) => void
  close: () => void
  openPolity: (id: string) => void
}) {
  const setYear = (y: number) => setYear0(Math.round(y))
  const [rulers, setRulers] = useState(true)
  const body = useRef<HTMLDivElement>(null)
  const narrow = useMemo(() => matchMedia('(max-width: 600px)').matches, [])
  const LW = narrow ? 90 : 220,
    RH = narrow ? 32 : 26
  const [W, setW] = useState(760)
  const [tip, setTip] = useState<{ x: number; y: number; t: string } | null>(null)
  useEffect(() => {
    const el = body.current
    if (!el) return
    // телефон: весь диапазон −1700…1100 помещается в ширину (без горизонтальной прокрутки); десктоп — не уже 680
    const f = () => setW(narrow ? Math.max(240, el.clientWidth - LW - 34) : Math.max(680, el.clientWidth - LW - 4))
    f()
    const ro = new ResizeObserver(f)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const entries = useMemo<GEntry[]>(() => {
    const sorted = [...polities].sort((a, b) => a.start - b.start || a.name.localeCompare(b.name, 'ru'))
    const g = new globalThis.Map<string, Polity[]>()
    for (const p of sorted) {
      const k = p.name
        .replace(/\s*\(.*?\)/g, '')
        .trim()
        .toLowerCase()
      g.set(k, [...(g.get(k) ?? []), p])
    }
    const rows: GRow[] = [...g.values()].map((ps) => {
      const seen = new Set<string>(),
        rl: GRow['rl'] = []
      for (const p of ps)
        for (const r of p.rulers) {
          const k = `${r.name}|${r.from}`
          if (!seen.has(k)) {
            seen.add(k)
            rl.push({ p, r })
          }
        }
      const label = ps
        .map((p) => p.name)
        .sort((a, b) => a.length - b.length)[0]
        .replace(/\s*\(.*?\)/g, '')
        .trim()
      return { ps, p: ps[0], label, bars: ps.flatMap((p) => p.spans.map((s) => ({ p, s }))), rl }
    })
    return GROUPS.flatMap((h) => {
      const rs = rows.filter((r) => ganttGroup(r.label) === h)
      return rs.length ? [{ head: h } as GEntry, ...rs.map((row) => ({ row }) as GEntry)] : []
    })
  }, [])
  const x = (y: number) => ((Math.min(y, AX_MAX) - YEAR_MIN) / (AX_MAX - YEAR_MIN)) * (W - 12) + 2
  const rowH = (e: GEntry) => ('head' in e ? HH : RH + (rulers && e.row.rl.length ? RUL + 3 : 0))
  const ys: number[] = []
  entries.reduce((s, e) => (ys.push(s), s + rowH(e)), TOP)
  const H = TOP + entries.reduce((s, e) => s + rowH(e), 0) + 6
  const ticks = [-1500, -1000, -500, 0, 500, 1000]
  const mid = (a: number, b: number) =>
    Math.max(YEAR_MIN, Math.min(YEAR_MAX, Math.round((a + Math.min(b, YEAR_MAX)) / 2)))
  useEffect(() => {
    const el = body.current
    if (!el) return
    el.scrollLeft = narrow ? 0 : Math.max(0, LW + x(year) - el.clientWidth / 2)
  }, [W])
  const [legOpen] = useState(() => !matchMedia('(max-width: 760px)').matches)
  useOverlay(true, close, 0)
  const nowLeft = x(year) > W - 110
  const hover = (e: PointerEvent, t: string) => {
    if (e.pointerType === 'touch') return
    const r = (e.currentTarget as Element).closest('.gantt')!.getBoundingClientRect()
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, t })
  }
  // клик мышью — к середине полосы; касание — к году основания полосы (не по позиции пальца)
  const hit = (e: MouseEvent | KeyboardEvent, p: Polity, from: number, to: number, open: boolean) => {
    const touch = (e as PointerEvent).pointerType === 'touch' || matchMedia('(pointer: coarse)').matches
    setYear(touch ? Math.max(YEAR_MIN, from) : mid(from, to))
    if (open) openPolity(p.id)
  }
  const barTip = (name: string, a: number, b: number) =>
    `${name} · ${yr(a)} — ${yr(b)} · клик — к ${yearLabel(mid(a, b))}`
  return createPortal(
    <div class="gantt-ov" onClick={(e) => e.target === e.currentTarget && close()}>
      <div class="gantt" role="dialog" aria-modal="true" aria-label="Диаграмма Ганта">
        <div class="gantt-head">
          <b>Диаграмма Ганта: жизнь государств и правители</b>
          <span class="gy">год: {yearG(year)}</span>
          <label>
            <input type="checkbox" checked={rulers} onChange={() => setRulers(!rulers)} /> правители
          </label>
          <CloseBtn onClick={close} />
        </div>
        <details class="gantt-leg" open={legOpen}>
          <summary>Легенда</summary>
          <span>
            <i class="gl-bar" /> широкая полоса — государство
          </span>
          <span>
            <i class="gl-bar thin" /> тонкая — правитель
          </span>
          <span>
            <i class="gl-hat" /> штриховка — дальше сведений нет (правитель неизвестен)
          </span>
          <span>клик по полосе — год середины полосы, камера к государству</span>
        </details>
        <div class="gantt-body" ref={body}>
          <div class="g-names" style={{ width: `${LW}px` }}>
            <div style={{ height: `${TOP}px` }} />
            {entries.map((e) =>
              'head' in e ? (
                <div class="g-h" style={{ height: `${HH}px` }}>
                  {e.head}
                </div>
              ) : (
                <div class="g-n" title={e.row.ps.map((p) => p.name).join(' / ')} style={{ height: `${rowH(e)}px` }}>
                  <span style={{ maxHeight: `${RH}px` }}>{e.row.label}</span>
                </div>
              ),
            )}
          </div>
          <svg
            class="g-chart"
            viewBox={`0 0 ${W + 30} ${H}`}
            width={W + 30}
            height={H}
            role="group"
            aria-label="Полосы государств и правителей"
            onPointerLeave={() => setTip(null)}
          >
            <defs>
              <pattern id="g-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="5" stroke="#6b4e1e" stroke-width="1.4" />
              </pattern>
            </defs>
            {ticks.map((t) => (
              <g>
                <line x1={x(t)} x2={x(t)} y1={TOP - 8} y2={H} stroke="#b8892b55" />
                <text x={x(t)} y={TOP - 24} text-anchor="middle" font-size={narrow ? 9 : 11} fill="#5a4118">
                  {yearLabel(t)}
                </text>
              </g>
            ))}
            <line
              x1={x(YEAR_MAX)}
              x2={x(YEAR_MAX)}
              y1={TOP - 8}
              y2={H}
              stroke="#6b4e1e"
              stroke-dasharray="3 3"
              stroke-opacity=".5"
            />
            {entries.map((e, i) =>
              'head' in e ? (
                <rect x={2} y={ys[i]} width={W - 12} height={HH - 2} fill="#b8892b22" pointer-events="none" />
              ) : (
                <g>
                  {e.row.bars.map(({ p, s }) => (
                    <rect
                      class="gbar"
                      x={x(s[0])}
                      y={ys[i] + 2}
                      width={Math.max(2, x(s[1]) - x(s[0]))}
                      height={RH - 6}
                      rx="3"
                      fill={p.color}
                      stroke="#2b2113"
                      stroke-opacity=".35"
                      onPointerMove={(ev) =>
                        hover(
                          ev,
                          barTip(p.name, s[0], s[1]) +
                            (rulerAt(p, year) ? `; правитель в ${yearG(year)}: ${rulerAt(p, year)!.name}` : ''),
                        )
                      }
                      onClick={(ev) => hit(ev, p, s[0], s[1], true)}
                      tabindex={0}
                      role="button"
                      aria-label={barTip(p.name, s[0], s[1])}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') {
                          ev.preventDefault()
                          hit(ev, p, s[0], s[1], true)
                        }
                      }}
                    >
                      <title>{`${p.name}: ${yr(s[0])} — ${yr(s[1])}`}</title>
                    </rect>
                  ))}
                  {rulers &&
                    e.row.ps
                      .flatMap((p) => (p.rulers.length > 0 ? rulerGaps(p) : []))
                      .map((g) => (
                        <rect
                          x={x(g[0])}
                          y={ys[i] + RH - 2}
                          width={Math.max(1.5, x(g[1]) - x(g[0]))}
                          height={RUL - 2}
                          fill="url(#g-hatch)"
                          pointer-events="none"
                        />
                      ))}
                  {rulers &&
                    e.row.rl.map(({ p, r }) => (
                      <rect
                        class="gbar"
                        x={x(r.from)}
                        y={ys[i] + RH - 2}
                        width={Math.max(1.5, x(r.to) - x(r.from) - 1)}
                        height={RUL - 2}
                        fill={p.color}
                        fill-opacity=".6"
                        onPointerMove={(ev) => hover(ev, barTip(`${r.name} (${e.row.label})`, r.from, r.to))}
                        onClick={(ev) => hit(ev, p, r.from, r.to, false)}
                        tabindex={0}
                        role="button"
                        aria-label={barTip(`${r.name} (${e.row.label})`, r.from, r.to)}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter') {
                            ev.preventDefault()
                            hit(ev, p, r.from, r.to, false)
                          }
                        }}
                      >
                        <title>{`${r.name}: ${yr(r.from)} — ${yr(r.to)} (${e.row.label})`}</title>
                      </rect>
                    ))}
                </g>
              ),
            )}
            <line
              x1={x(year)}
              x2={x(year)}
              y1={TOP - 8}
              y2={H}
              stroke="#8c1c13"
              stroke-width="2"
              pointer-events="none"
            />
            <text
              x={x(year) + (nowLeft ? -4 : 4)}
              y={TOP - 4}
              text-anchor={nowLeft ? 'end' : 'start'}
              font-size="11"
              font-weight="700"
              fill="#8c1c13"
              pointer-events="none"
            >
              Сейчас: {yearLabel(year)}
            </text>
          </svg>
        </div>
        {tip && (
          <div class="g-tip" style={{ left: `${tip.x + 12}px`, top: `${tip.y + 14}px` }}>
            {tip.t}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
