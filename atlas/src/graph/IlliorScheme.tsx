// Схема Иллиора: районы, мосты, река и заведения. Не масштабная — положение условное, состав по вики (data/illior-scheme.yaml).
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { loadData } from '../data/load'
import { wikiUrl } from '../events'
import { emit } from '../lib/bus'

type District = {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
  bank: string
  walled: boolean
  place?: string
  note: string
  hint: string
  sources: string[]
}
type Bridge = { id: string; name: string; x: number; note: string; sources: string[] }
export type Venue = {
  id: string
  name: string
  kind: Kind
  price: Price
  owner: string
  rooms: string
  district: string
  outside?: boolean
  where: string
  sources: string[]
}
type Kind = 'tavern' | 'inn' | 'brothel' | 'bank' | 'school'
type Price = 'cheap' | 'mid' | 'mid-dear' | 'dear' | 'none'
export const scheme = await loadData<{
  meta: { frame: { w: number; h: number }; legend: string; river: { name: string; note: string } }
  districts: District[]
  bridges: Bridge[]
  venues: Venue[]
}>('illior-scheme')

export const KIND_RU: Record<Kind, string> = {
  tavern: 'Таверна / пивная',
  inn: 'Постоялый двор',
  brothel: 'Бордель',
  bank: 'Банк',
  school: 'Учебное заведение',
}
export const PRICE_RU: Record<Price, string> = {
  cheap: 'дёшево',
  mid: 'средне',
  'mid-dear': 'средне — дорого',
  dear: 'дорого',
  none: 'цена не указана',
}
const PRICE_COLOR: Record<Price, string> = {
  cheap: '#3b8f3b',
  mid: '#d9a21a',
  'mid-dear': '#d9701a',
  dear: '#c0392b',
  none: '#8b8577',
}
const KINDS = Object.keys(KIND_RU) as Kind[]
const PRICES: Price[] = ['cheap', 'mid', 'dear', 'none']
const priceBucket = (p: Price) => (p === 'mid-dear' ? 'mid' : p)

function wrap(name: string, max: number): string[] {
  const out: string[] = []
  let cur = ''
  for (const w of name.split(' ')) {
    if (cur && (cur + ' ' + w).length > max) {
      out.push(cur)
      cur = w
    } else cur = cur ? cur + ' ' + w : w
  }
  return cur ? [...out, cur] : out
}

function Mark({ k, c, s = 9 }: { k: Kind; c: string; s?: number }) {
  if (k === 'tavern') return <circle r={s} fill={c} stroke="#2b1a0e" stroke-width="1.3" />
  if (k === 'inn')
    return <rect x={-s} y={-s} width={s * 2} height={s * 2} fill={c} stroke="#2b1a0e" stroke-width="1.3" />
  if (k === 'brothel')
    return (
      <rect
        x={-s}
        y={-s}
        width={s * 2}
        height={s * 2}
        fill={c}
        stroke="#2b1a0e"
        stroke-width="1.3"
        transform="rotate(45)"
      />
    )
  if (k === 'bank')
    return <polygon points={`0,${-s - 1} ${s + 1},${s} ${-s - 1},${s}`} fill={c} stroke="#2b1a0e" stroke-width="1.3" />
  return (
    <polygon
      points={`0,${-s - 2} ${s + 2},${-s / 3} ${s},${s} ${-s},${s} ${-s - 2},${-s / 3}`}
      fill={c}
      stroke="#2b1a0e"
      stroke-width="1.3"
    />
  )
}

export function IlliorScheme({ close }: { close: () => void }) {
  const [kinds, setKinds] = useState<Set<Kind>>(new Set(KINDS))
  const [prices, setPrices] = useState<Set<Price>>(new Set(PRICES))
  const [sel, setSel] = useState<Venue | null>(null)
  const [dsel, setDsel] = useState<District | Bridge | null>(null)
  const [hl, setHl] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const titleRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    document.body.classList.add('gwin-open')
    titleRef.current?.focus({ preventScroll: true })
    const t = setTimeout(() => {
      if (!document.querySelector('.gwin')?.contains(document.activeElement))
        titleRef.current?.focus({ preventScroll: true })
    }, 150)
    return () => {
      clearTimeout(t)
      document.body.classList.remove('gwin-open')
      if (opener && opener !== document.body && document.contains(opener)) opener.focus({ preventScroll: true })
    }
  }, [])
  const { w, h } = scheme.meta.frame
  const ql = q.trim().toLowerCase()
  const match = (v: Venue) =>
    kinds.has(v.kind) && prices.has(priceBucket(v.price)) && (!ql || v.name.toLowerCase().includes(ql))
  const shown = scheme.venues.filter(match).length
  const tog = <T,>(s: Set<T>, v: T, set: (x: Set<T>) => void) => {
    const n = new Set(s)
    n.has(v) ? n.delete(v) : n.add(v)
    set(n)
  }

  // положение значков: внутри района — ряд в нижней части; без района — полоса внизу
  const placed = useMemo(() => {
    const out = new Map<string, { x: number; y: number }>(),
      perDist = new Map<string, number>()
    let free = 0
    for (const v of scheme.venues) {
      const d = scheme.districts.find((x) => x.id === v.district)
      if (d) {
        const i = perDist.get(d.id) ?? 0
        perDist.set(d.id, i + 1)
        const per = Math.max(2, Math.floor((d.w - 14) / 24))
        out.set(v.id, { x: d.x + 16 + (i % per) * 24, y: d.y + d.h - 16 - Math.floor(i / per) * 24 })
      } else if (v.outside) out.set(v.id, { x: 905, y: 535 })
      else {
        out.set(v.id, { x: 22 + (free % 8) * 118, y: 590 + Math.floor(free / 8) * 30 })
        free++
      }
    }
    return out
  }, [])

  return (
    <div class="gwin sch" role="dialog" aria-modal="true" aria-labelledby="sch-title">
      <div class="gbar">
        <b id="sch-title" ref={titleRef} tabIndex={-1}>
          Схема Иллиора
        </b>
        <span class="gcnt">
          заведений {shown} из {scheme.venues.length} · районов {scheme.districts.length} · мостов{' '}
          {scheme.bridges.length}
        </span>
        <button class="gx" onClick={close} title="Esc">
          ✕ Закрыть
        </button>
      </div>
      <div class="glegend">
        {KINDS.map((k) => (
          <button class={`gt ${kinds.has(k) ? 'on' : ''}`} onClick={() => tog(kinds, k, setKinds)}>
            <svg width="20" height="20" viewBox="-12 -12 24 24">
              <Mark k={k} c="#e8dfc4" s={8} />
            </svg>
            {KIND_RU[k]} <i>{scheme.venues.filter((v) => v.kind === k).length}</i>
          </button>
        ))}
        <span class="gcol">
          {PRICES.map((p) => (
            <button class={`gg ${prices.has(p) ? 'on' : ''}`} onClick={() => tog(prices, p, setPrices)}>
              <i style={{ background: PRICE_COLOR[p] }} />
              {PRICE_RU[p]}
            </button>
          ))}
        </span>
      </div>
      <div class="schbody">
        <svg
          class="gsvg"
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="xMidYMid meet"
          onClick={() => {
            setSel(null)
            setDsel(null)
          }}
        >
          <rect width={w} height={h} fill="#efe4c4" />
          <path
            d="M0 292 C160 320 300 284 460 306 S760 318 960 296 L960 326 C760 348 600 330 460 336 S160 350 0 330Z"
            fill="#9dc3d0"
            stroke="#5b8fa3"
            stroke-width="2"
          />
          <text x="840" y="318" class="schr">
            р. {'Лиор'}
          </text>
          {scheme.districts.map((d) => (
            <g
              class="dst"
              onClick={(e) => {
                e.stopPropagation()
                setDsel(d)
                setSel(null)
              }}
            >
              <rect
                x={d.x}
                y={d.y}
                width={d.w}
                height={d.h}
                rx="6"
                fill={d.walled ? '#e3d3a4' : '#ddd0b0'}
                stroke={dsel?.id === d.id ? '#8c1c13' : d.walled ? '#6b4e1e' : '#9a8a64'}
                stroke-width={dsel?.id === d.id ? 3 : d.walled ? 2 : 1.2}
                stroke-dasharray={d.walled ? '' : '4 3'}
              />
              <title>{d.name}</title>
              {d.h >= 50 && !scheme.venues.some((v) => v.district === d.id) && (
                <text x={d.x + d.w / 2} y={d.y + d.h - 8} text-anchor="middle" class="schd sche">
                  {d.w >= 150 ? 'заведений нет в вики' : 'нет в вики'}
                </text>
              )}
              <text text-anchor="middle" class="schd">
                {wrap(d.name, Math.max(7, Math.floor((d.w - 8) / 7.2)))
                  .slice(0, Math.max(1, Math.floor((d.h - 28) / 13)))
                  .map((l, i) => (
                    <tspan x={d.x + d.w / 2} y={d.y + 14 + i * 13}>
                      {l}
                    </tspan>
                  ))}
              </text>
            </g>
          ))}
          {scheme.bridges.map((b) => (
            <g
              class="dst"
              onClick={(e) => {
                e.stopPropagation()
                setDsel(b)
                setSel(null)
              }}
            >
              <rect x={b.x - 7} y={288} width="14" height="42" fill="#8a6d3b" stroke="#2b1a0e" />
              <text x={b.x} y={282} text-anchor="middle" class="schd">
                {b.name}
              </text>
            </g>
          ))}
          <text x="30" y="560" class="schr">
            Район в источниках не назван
          </text>
          <line x1="20" y1="568" x2="940" y2="568" stroke="#9a8a64" stroke-dasharray="4 3" />
          <text x="840" y="520" text-anchor="middle" class="schd">
            за городом: к Вилариню (ЮВ)
          </text>
          {scheme.venues.map((v) => {
            const p = placed.get(v.id)!,
              on = match(v),
              lit = hl === v.id || sel?.id === v.id
            return (
              <g
                transform={`translate(${p.x} ${p.y})`}
                opacity={on ? 1 : 0.12}
                class={`ven ${lit ? 'hl' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (on) {
                    setSel(v)
                    setDsel(null)
                  }
                }}
                onMouseEnter={() => on && setHl(v.id)}
                onMouseLeave={() => setHl(null)}
              >
                <g class="mk" transform={lit ? 'scale(1.5)' : ''}>
                  <Mark k={v.kind} c={PRICE_COLOR[v.price]} />
                </g>
                <title>{`${v.name} · ${KIND_RU[v.kind]} · ${PRICE_RU[v.price]}`}</title>
                {!v.district && !v.outside ? (
                  <text x="13" y="0" class="schv">
                    {(() => {
                      const ls = wrap(v.name, 13)
                      const sh = ls.slice(0, 2)
                      if (ls.length > 2) sh[1] += '…'
                      return sh.map((l, i) => (
                        <tspan x="13" dy={i ? 12 : 3}>
                          {l}
                        </tspan>
                      ))
                    })()}
                  </text>
                ) : (
                  <text x="0" y="-14" text-anchor="middle" class="schv vlbl">
                    {v.name}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
        <aside class="schcard">
          <input
            type="search"
            class="schq"
            aria-label="Найти заведение"
            placeholder="Найти заведение…"
            value={q}
            onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          />
          {!sel && !dsel && <p class="meta">{scheme.meta.legend}</p>}
          {sel && (
            <div>
              <h3>{sel.name}</h3>
              <div class="meta">
                {KIND_RU[sel.kind]} · цены: {PRICE_RU[sel.price]}
              </div>
              {sel.owner && (
                <p>
                  <b>Владелец / глава:</b> {sel.owner}
                </p>
              )}
              {sel.rooms && (
                <p>
                  <b>Комнаты:</b> {sel.rooms}
                </p>
              )}
              <p>
                <b>Где:</b> {sel.where || 'Иллиор'}
                {sel.district
                  ? ` (район: ${scheme.districts.find((d) => d.id === sel.district)?.name})`
                  : ' — район не назван'}
              </p>
              <div class="links">
                {sel.sources.map((s) => (
                  <a href={wikiUrl(s)} target="_blank" rel="noreferrer">
                    {s}
                  </a>
                ))}
              </div>
              <p class="meta">Состав — по вики; положение на схеме условное.</p>
            </div>
          )}
          {dsel && (
            <div>
              <h3>{dsel.name}</h3>
              {'note' in dsel && dsel.note && <p>{dsel.note}</p>}
              {'hint' in dsel && dsel.hint && <p class="meta">{dsel.hint}</p>}
              <div class="links">
                {dsel.sources.map((s) => (
                  <a href={wikiUrl(s)} target="_blank" rel="noreferrer">
                    {s}
                  </a>
                ))}
              </div>
              {'place' in dsel && dsel.place && (
                <button onClick={() => emit('dossier', { t: 'place', id: dsel.place! })}>Досье места</button>
              )}
              <p class="meta">Положение на схеме условное (предположительно).</p>
            </div>
          )}
          <hr />
          <div class="schlist" aria-label="Заведения">
            {scheme.venues.filter(match).map((v) => (
              <button
                class={hl === v.id || sel?.id === v.id ? 'hl' : ''}
                onMouseEnter={() => setHl(v.id)}
                onMouseLeave={() => setHl(null)}
                onFocus={() => setHl(v.id)}
                onBlur={() => setHl(null)}
                onClick={() => {
                  setSel(v)
                  setDsel(null)
                }}
              >
                <svg width="18" height="18" viewBox="-12 -12 24 24" aria-hidden="true">
                  <Mark k={v.kind} c={PRICE_COLOR[v.price]} s={7} />
                </svg>
                <span>{v.name}</span>
              </button>
            ))}
          </div>
          <p class="meta">
            <b>Река Лиор:</b> {scheme.meta.river.note}
          </p>
          <div class="schl">
            {PRICES.map((p) => (
              <span>
                <i style={{ background: PRICE_COLOR[p] }} />
                {PRICE_RU[p]}
              </span>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
