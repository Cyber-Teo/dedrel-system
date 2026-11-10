// Окно «Связи»: силовой граф персонажей на весь экран. Esc / «Назад к карте» — закрыть; карточка человека — внутри окна.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { ERAS } from '../events'
import {
  GROUP_NAMES,
  ROLE_RU,
  TYPES,
  TYPE_RU,
  TYPE_STYLE,
  allNodes,
  groupColor,
  relations,
  type GNode,
  type Rel,
  type RelType,
  type RoleKind,
} from './data'
import { layout, placeLabels, separate, type FNode } from './force'
import { emit } from '../lib/bus'

// на узком вертикальном экране раскладка идёт в «портретном» поле, чтобы весь граф влез в кадр без «Весь граф»
const PORTRAIT = typeof innerWidth !== 'undefined' && innerWidth <= 700 && innerHeight > innerWidth
const W = PORTRAIT ? 760 : 1500,
  H = PORTRAIT ? 1000 : 640
type PN = GNode & FNode
type View = { x: number; y: number; w: number; h: number }
const RSEP = (deg: number) => (COARSE ? 30 : 11 + Math.min(8, deg * 1.2) + 2)
const COARSE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

const GLYPH: Record<RoleKind, string> = {
  rule: 'M-6 4h12l1-8-4 3-3-6-3 6-4-3z',
  war: 'M0-7v11M-4 2h8M0 2v5',
  magic: 'M0-7l1.8 4.6 4.9.4-3.8 3.1 1.2 4.8L0 3 -4.1 5.9l1.2-4.8-3.8-3.1 4.9-.4z',
  church: 'M0-7v14M-5-2h10',
  trade: 'M-5-3a5 3 0 1 0 10 0a5 3 0 1 0-10 0M-5-3v6a5 3 0 0 0 10 0v-6',
  house: 'M0-7l6 2.5v5C6 4.5 3.5 6.5 0 7-3.5 6.5-6 4.5-6 .5v-5z',
}

export function GraphWindow({ close, focusId }: { close: () => void; focusId?: string }) {
  const [on, setOn] = useState<Set<RelType>>(new Set(TYPES))
  const [group, setGroup] = useState('')
  const [era, setEra] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [hov, setHov] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [view0, setView] = useState<View | null>(null) // null — вписать весь граф
  const [fOpen, setFOpen] = useState(false) // телефон: фильтры свёрнуты в кнопку
  // подложку m запоминаем до открытия и возвращаем при закрытии
  useEffect(() => {
    const m0 = new URLSearchParams(location.hash.replace(/^#/, '')).get('m')
    document.body.classList.add('gwin-open')
    return () => {
      document.body.classList.remove('gwin-open')
      const p = new URLSearchParams(location.hash.replace(/^#/, '')),
        cur = p.get('m')
      if (m0 && cur !== m0) {
        p.set('m', m0)
        history.replaceState(null, '', '#' + p.toString().replace(/%2C/g, ','))
        dispatchEvent(new HashChangeEvent('hashchange'))
      }
    }
  }, [])
  const coarse = COARSE
  // диалог: фокус на заголовок при открытии, при закрытии — на кнопку, что открыла окно
  const titleRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    titleRef.current?.focus({ preventScroll: true })
    const t = setTimeout(() => {
      if (!document.querySelector('.gwin')?.contains(document.activeElement))
        titleRef.current?.focus({ preventScroll: true })
    }, 150) // закрывающийся флайаут возвращает фокус на свою кнопку
    return () => {
      clearTimeout(t)
      if (opener && opener !== document.body && document.contains(opener)) opener.focus({ preventScroll: true })
    }
  }, [])

  const { nodes, links } = useMemo(() => {
    const byId = new Map(allNodes.map((n) => [n.id, n]))
    let rels: Rel[] = relations.filter((r) => on.has(r.type))
    if (group) {
      const inG = new Set(allNodes.filter((n) => n.group === group).map((n) => n.id))
      rels = rels.filter((r) => inG.has(r.a) || inG.has(r.b))
    }
    if (era) {
      const e = ERAS.find((x) => x.name === era)!
      const inE = (id: string) => {
        const y = byId.get(id)?.yr
        return y != null && y >= e.from && y <= e.to
      }
      rels = rels.filter((r) => inE(r.a) || inE(r.b))
    }
    const ids = new Set(rels.flatMap((r) => [r.a, r.b]))
    const list: PN[] = [...ids].map((id, i) => {
      const a = (i / Math.max(1, ids.size)) * Math.PI * 2
      return { ...byId.get(id)!, x: W / 2 + Math.cos(a) * 520, y: H / 2 + Math.sin(a) * 250, vx: 0, vy: 0 }
    })
    const deg = new Map<string, number>()
    for (const r of rels) for (const id of [r.a, r.b]) deg.set(id, (deg.get(id) ?? 0) + 1)
    for (const n of list) n.deg = deg.get(n.id) ?? 0
    layout(list, rels, W, H, 420, { charge: -9000, dist: 120, gravity: 0.012 })
    // узлы не налезают друг на друга (по радиусу) и держатся в 24 px от рамки
    separate(list, (n) => RSEP(n.deg), W, H, 24)
    return { nodes: list, links: rels }
  }, [on, group, era])

  // весь граф: рамка по узлам с полями, пропорции поля W×H
  const full = useMemo<View>(() => {
    if (!nodes.length) return { x: 0, y: 0, w: W, h: H }
    const x0 = Math.min(...nodes.map((n) => n.x)) - 50,
      x1 = Math.max(...nodes.map((n) => n.x)) + 50,
      y0 = Math.min(...nodes.map((n) => n.y)) - 40,
      y1 = Math.max(...nodes.map((n) => n.y)) + 40
    let w = x1 - x0,
      h = y1 - y0
    if (w / h < W / H) w = h * (W / H)
    else h = w / (W / H)
    return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h }
  }, [nodes])
  const view = view0 ?? full
  const pos = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const focus = sel ?? hov
  const near = useMemo(
    () => new Set(focus ? links.filter((r) => r.a === focus || r.b === focus).flatMap((r) => [r.a, r.b]) : []),
    [focus, links],
  )
  const toggle = (t: RelType) => {
    const s = new Set(on)
    s.has(t) ? s.delete(t) : s.add(t)
    setOn(s)
  }
  const counts = useMemo(
    () => Object.fromEntries(TYPES.map((t) => [t, relations.filter((r) => r.type === t).length])),
    [],
  )

  // подогнать вид под узел и его соседей
  const fit = (id: string | null, ns = nodes, ls = links) => {
    if (!id) {
      setView(null)
      return
    }
    const ids = new Set([id, ...ls.filter((r) => r.a === id || r.b === id).flatMap((r) => [r.a, r.b])])
    const pts = ns.filter((n) => ids.has(n.id))
    if (!pts.length) {
      setView(null)
      return
    }
    const x0 = Math.min(...pts.map((p) => p.x)) - 90,
      x1 = Math.max(...pts.map((p) => p.x)) + 90,
      y0 = Math.min(...pts.map((p) => p.y)) - 60,
      y1 = Math.max(...pts.map((p) => p.y)) + 70
    let w = Math.max(800, x1 - x0),
      h = Math.max(340, y1 - y0)
    if (w / h < W / H) w = h * (W / H)
    else h = w / (W / H)
    setView({ x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h })
  }
  const pick = (id: string) => {
    setSel(id)
    fit(id)
  }
  // «Показать в графе» из карточки человека: окно открывается сразу с выбранным узлом
  useEffect(() => {
    if (focusId) pick(focusId)
  }, [])
  const resetFilters = () => {
    setOn(new Set(TYPES))
    setGroup('')
    setEra('')
  }
  const found = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s.length < 2
      ? []
      : allNodes
          .filter((n) => n.name.toLowerCase().includes(s))
          .sort((a, b) => b.deg - a.deg)
          .slice(0, 7)
  }, [q])
  const hasNode = (id: string) => nodes.some((n) => n.id === id)
  const searchPick = (n: GNode) => {
    setQ('')
    if (!hasNode(n.id)) {
      resetFilters()
      setSel(n.id)
      setView(null)
      return
    } // после перерасчёта раскладки вид подгоняет эффект ниже
    pick(n.id)
  }
  useEffect(() => {
    if (sel && pos.has(sel)) fit(sel)
  }, [pos])
  const selNode = sel ? (pos.get(sel) ?? allNodes.find((n) => n.id === sel)) : null
  const selRels = sel ? links.filter((r) => r.a === sel || r.b === sel) : []
  const nameOf = (id: string) => allNodes.find((n) => n.id === id)?.name ?? id
  // подписи: приоритет — фокус и его соседи, затем по степени; порог степени падает с приближением; наложения исключены
  const radius = (n: PN) =>
    Math.max(coarse ? (14.5 * view.w) / Math.max(320, innerWidth) : 11, 11 + Math.min(8, n.deg * 1.2))
  // подписи ≥12 px на экране: шрифт в единицах поля растёт, когда поле сжато в узкое окно (телефон)
  const ppu = Math.min(innerWidth, 1500) / view.w
  const fs = Math.max(13, 12.5 / Math.max(0.2, ppu)),
    maxCh = ppu < 0.7 ? 14 : 22
  const labels = useMemo(() => {
    const zoom = W / view.w,
      minDeg = zoom >= 2.2 ? 1 : zoom >= 1.4 ? 2 : 3
    const topN = new Set(
      [...nodes]
        .sort((a, b) => b.deg - a.deg)
        .slice(0, 24)
        .map((n) => n.id),
    ) // кандидаты на подпись всегда: 24 самых связанных (ставятся те, что не налезают; не меньше 15)
    const cand = nodes
      .filter((n) => n.id === focus || near.has(n.id) || topN.has(n.id) || n.deg >= minDeg)
      .sort(
        (a, b) =>
          (b.id === focus ? 1e3 : near.has(b.id) ? 1e2 : 0) +
          b.deg -
          ((a.id === focus ? 1e3 : near.has(a.id) ? 1e2 : 0) + a.deg),
      )
    const txt = (n: PN) => (n.id !== focus && n.name.length > maxCh ? n.name.slice(0, maxCh - 1) + '…' : n.name) // полное имя — в title подписи
    const out = placeLabels(
      cand.map((n) => ({
        id: n.id,
        x: n.x,
        y: n.y,
        r: radius(n),
        w: txt(n).length * 0.56 * fs + 6,
        force: n.id === focus,
      })),
      ppu < 0.7 ? [] : nodes.map((n) => ({ x: n.x, y: n.y, r: radius(n) })),
      W / 2,
      H / 2,
      fs * 1.4,
      { w: W, h: H },
    )
    return new Map(out.map((l) => [l.id, { ...l, text: txt(cand.find((n) => n.id === l.id)!) }]))
  }, [nodes, focus, near, view.w])

  return (
    <div class="gwin" role="dialog" aria-modal="true" aria-labelledby="gwin-title">
      <div class={`gbar${fOpen ? ' fopen' : ''}`}>
        <button class="gx gback" onClick={close} title="Esc" aria-label="Назад к карте">
          ✕<span class="gbt"> Назад к карте</span>
        </button>
        <b id="gwin-title" ref={titleRef} tabIndex={-1}>
          Связи персонажей
        </b>
        <span class="gcnt">
          {nodes.length} лиц · {links.length} связей
          {links.length < relations.length ? ` (всего в данных ${relations.length})` : ''}
        </span>
        <span class="gsearch">
          <input
            type="search"
            aria-label="Найти персонажа"
            placeholder="Поиск"
            value={q}
            onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          />
          {found.length > 0 && (
            <ul>
              {found.map((n) => (
                <li>
                  <button onClick={() => searchPick(n)}>
                    {n.name}
                    <small>{n.group}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </span>
        <button class="gfbtn" aria-expanded={fOpen} onClick={() => setFOpen(!fOpen)}>
          Фильтры
        </button>
        <label class="gfl">
          Дом / страна{' '}
          <select
            value={group}
            onChange={(e) => {
              setGroup((e.target as HTMLSelectElement).value)
              setSel(null)
              setView(null)
            }}
          >
            <option value="">все</option>
            {GROUP_NAMES.map((g) => (
              <option value={g}>{g}</option>
            ))}
          </select>
        </label>
        <label class="gfl" title="По годам жизни, приблизительно">
          Эпоха{' '}
          <select
            value={era}
            onChange={(e) => {
              setEra((e.target as HTMLSelectElement).value)
              setSel(null)
              setView(null)
            }}
          >
            <option value="">все</option>
            {ERAS.map((x) => (
              <option value={x.name}>{x.name}</option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            setSel(null)
            setView(null)
          }}
          title="Показать весь граф"
        >
          Весь граф
        </button>
      </div>
      <div class={`glegend${fOpen ? ' fopen' : ''}`}>
        {TYPES.map((t) => {
          const st = TYPE_STYLE[t]
          return (
            <button class={`gt ${on.has(t) ? 'on' : ''}`} onClick={() => toggle(t)} title="Показать / скрыть тип связи">
              <svg width="34" height="10">
                <line
                  x1="1"
                  y1="5"
                  x2="33"
                  y2="5"
                  stroke={st.color}
                  stroke-width={st.width}
                  stroke-dasharray={st.dash}
                />
              </svg>
              {TYPE_RU(t)} <i>{counts[t]}</i>
            </button>
          )
        })}
        <span class="gcol">
          {GROUP_NAMES.map((g) => (
            <button
              class={`gg ${group === g ? 'on' : ''}`}
              onClick={() => {
                setGroup(group === g ? '' : g)
                setSel(null)
                setView(null)
              }}
            >
              <i style={{ background: groupColor(g) }} />
              {g}
            </button>
          ))}
        </span>
      </div>
      <div class="gmain">
        <svg
          class="gsvg"
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          preserveAspectRatio="xMidYMid meet"
          onClick={() => {
            setSel(null)
            setView(null)
          }}
        >
          <g>
            {links.map((r) => {
              const a = pos.get(r.a)!,
                b = pos.get(r.b)!,
                st = TYPE_STYLE[r.type],
                hot = !focus || r.a === focus || r.b === focus
              return (
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={st.color}
                  stroke-width={st.width}
                  stroke-dasharray={st.dash}
                  opacity={hot ? 0.85 : 0.12}
                >
                  <title>{`${a.name} — ${b.name}: ${TYPE_RU(r.type)}. ${r.note}`}</title>
                </line>
              )
            })}
          </g>
          <g>
            {nodes.map((n) => {
              const hot = !focus || n.id === focus || near.has(n.id),
                r = radius(n),
                lb = labels.get(n.id)
              return (
                <g
                  class="gn"
                  role="button"
                  tabIndex={0}
                  aria-label={`${n.name}, ${n.deg} ${n.deg % 10 === 1 && n.deg % 100 !== 11 ? 'связь' : [2, 3, 4].includes(n.deg % 10) && ![12, 13, 14].includes(n.deg % 100) ? 'связи' : 'связей'}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      close()
                      emit('dossier', { t: 'person', id: n.id })
                    } else if (e.key === ' ') {
                      e.preventDefault()
                      pick(n.id)
                    }
                  }}
                  onFocus={() => setHov(n.id)}
                  onBlur={() => setHov(null)}
                  transform={`translate(${n.x} ${n.y})`}
                  opacity={hot ? 1 : 0.2}
                  onMouseEnter={() => setHov(n.id)}
                  onMouseLeave={() => setHov(null)}
                  onClick={(e) => {
                    e.stopPropagation()
                    pick(n.id)
                  }}
                >
                  <circle
                    r={r}
                    fill={groupColor(n.group)}
                    stroke={sel === n.id ? '#000' : '#fff'}
                    stroke-width={sel === n.id ? 3 : 1.8}
                  />
                  <path
                    d={GLYPH[n.role]}
                    transform={`scale(${r / 11})`}
                    fill="none"
                    stroke="#fff"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  {lb && (
                    <text
                      x={lb.x - n.x}
                      y={lb.y - n.y}
                      text-anchor={lb.anchor}
                      style={{ fontSize: `${fs}px`, strokeWidth: `${fs * 0.38}px` }}
                    >
                      {lb.text}
                      <title>{n.name}</title>
                    </text>
                  )}
                  <title>{`${n.name} · ${n.group} · ${ROLE_RU[n.role]}`}</title>
                </g>
              )
            })}
          </g>
        </svg>
        {selNode && (
          <aside class="gcard">
            <button
              class="gx"
              onClick={() => {
                setSel(null)
                setView(null)
              }}
              aria-label="Закрыть карточку"
            >
              ✕
            </button>
            <h3>{selNode.name}</h3>
            <div class="meta">
              {ROLE_RU[selNode.role]}
              {selNode.roleText ? ` · ${selNode.roleText}` : ''}
            </div>
            {selNode.years && <div class="meta">Годы: {selNode.years}</div>}
            {selNode.aff && <div class="meta">Принадлежность: {selNode.aff}</div>}
            <h4>Связи ({selRels.length})</h4>
            <ul class="grels">
              {selRels.map((r) => {
                const o = r.a === sel ? r.b : r.a,
                  st = TYPE_STYLE[r.type]
                return (
                  <li>
                    <i style={{ background: st.color }} />
                    <button onClick={() => pick(o)}>{nameOf(o)}</button>{' '}
                    <small>
                      {TYPE_RU(r.type)}. {r.note}
                    </small>
                  </li>
                )
              })}
            </ul>
            <button
              onClick={() => {
                const id = sel!
                close()
                emit('dossier', { t: 'person', id })
              }}
            >
              Полное досье
            </button>
          </aside>
        )}
      </div>
    </div>
  )
}
