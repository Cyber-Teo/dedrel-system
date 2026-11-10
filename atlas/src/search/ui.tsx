// Поиск в верхней панели + досье мест, людей, организаций, государств и ячеек политики.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { createPortal } from 'preact/compat'
import { Marker, type FilterSpecification, type Map, type MapMouseEvent } from 'maplibre-gl'
import type { ComponentChildren } from 'preact'
import type { Conf } from '../layers/build'
import './search.css'
import { pxToLngLat } from '../geo/pixel'
import { ser } from '../hash'
import { dossierSlot, useDossier } from '../dossier'
import { events, lngLatOf, yearG, yearLabel, confidenceTitle, type Ev } from '../events'
import { useMaster } from '../master'
import { frameSuffix, ownerAt, YEAR_END } from '../history/owners'
import { GROUP_NAME, norm, searchGroups, type Entry, type Group, type Hit } from './rank'
import { cellHistory, confRu, nearestYearWith, polityYears, rulerSpan } from './polity'
import {
  cellRuns,
  index,
  loadCells,
  orgBy,
  placeXY,
  personBy,
  placeBy,
  placeOfOrg,
  placeOfPerson,
  polities,
  polityDossier,
  polityLife,
  polityWiki,
  type CellP,
} from './data'
import { KindIcon } from './kinds'
import { evIconKey } from './chronicle'
import { iconUrl } from '../layers/icons'
import { Badge, OrgCard, PersonCard, PlaceCard, Sources, WikiTop } from './cards'
import { emit, on } from '../lib/bus'
import { CloseBtn } from '../ui/CloseBtn'

/** Значок строки выдачи: у события — значок его типа (как в хронике), у остальных — значок вида. */
const EntryIcon = ({ e }: { e: Entry }) =>
  e.group === 'event' ? (
    <img class="kic evic" src={iconUrl(evIconKey({ title: e.name, type: e.kind }))} alt="" width="18" height="18" />
  ) : (
    <KindIcon k={e.icon} />
  )

type Card = { t: 'place' | 'person' | 'org' | 'polity' | 'cell'; id: string }
/** Открытое досье в хеше: d=place:id (ключ d; битый id игнорируется). */
/** Есть ли в данных объект такого вида (досье вида «cell» из хеша не открывается). */
const EXISTS = {
  place: (id: string) => placeBy.has(id),
  person: (id: string) => personBy.has(id),
  org: (id: string) => orgBy.has(id),
  polity: (id: string) => id in polities,
}
function cardFromHash(h = location.hash): Card | null {
  const v = new URLSearchParams(h.replace(/^#/, '')).get('d')
  if (!v) return null
  const i = v.indexOf(':'),
    t = v.slice(0, i),
    id = v.slice(i + 1)
  const exists = EXISTS[t as keyof typeof EXISTS]
  return exists?.(id) ? { t: t as Card['t'], id } : null
}
const NIL = '#6a6760'
/** «Нет такого id»: фильтр с этим значением не совпадает ни с одним объектом (нулевой символ не встречается в данных). */
const NO_ID = '\u0000'
const LIMIT = 6
const NOMAP_NOTE = 'На карте нет — открыта карточка'
/** У результата есть место на карте, куда лететь. */
const mappable = (e: Entry) =>
  e.group === 'place'
    ? !e.nomap
    : e.group === 'person'
      ? !!lngLatOf(placeOfPerson(e.id))
      : e.group === 'org'
        ? !!lngLatOf(placeOfOrg(e.id))
        : true
const POPULAR = ['Иллиор', 'Игни', 'Арност', 'Страна Драконов']
const polName = (id: string | null) => (id ? (polities[id]?.name ?? id) : 'нет сведений')
/** Дробные кадры (1005.85) показываем целым годом. */
const plural = (n: number, a: string, b: string, c: string) =>
  n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c
const yl = (y: number) => yearLabel(Math.floor(y)) + frameSuffix(y)

/** Отступы карты под открытое досье: справа на десктопе, снизу на узком экране. */
export function cardPadding(extra = 0) {
  const side = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--side-w')) || 320
  return innerWidth > 900
    ? { top: 20 + extra, bottom: 20 + extra, left: 20 + extra, right: side + 28 + extra }
    : { top: 20 + extra, left: 20 + extra, right: 20 + extra, bottom: Math.round(innerHeight * 0.52) + extra }
}

function ensurePolLayers(map: Map) {
  if (!map.getSource('pol')) return false
  // слой pol-hl мог уже создать history/politics — добавляем недостающие по отдельности
  if (!map.getLayer('pol-hl-fill'))
    map.addLayer(
      {
        id: 'pol-hl-fill',
        type: 'fill',
        source: 'pol',
        filter: ['==', ['get', 'owner'], '\u0000'],
        paint: { 'fill-color': '#ffe27a', 'fill-opacity': 0.4 },
      },
      'events-pts',
    )
  if (!map.getLayer('pol-hl'))
    map.addLayer(
      {
        id: 'pol-hl',
        type: 'line',
        source: 'pol',
        filter: ['==', ['get', 'owner'], '\u0000'],
        paint: { 'line-color': '#c0152b', 'line-width': 2.2 },
      },
      'events-pts',
    )
  if (!map.getLayer('pol-cell-hl'))
    map.addLayer(
      {
        id: 'pol-cell-hl',
        type: 'line',
        source: 'pol',
        filter: ['==', ['get', 'id'], '\u0000'],
        paint: { 'line-color': '#c0152b', 'line-width': 3.2 },
      },
      'events-pts',
    )
  return true
}
function setHighlight(map: Map, id: string | null) {
  if (!ensurePolLayers(map)) return
  const f: FilterSpecification = ['==', ['get', 'owner'], id ?? NO_ID]
  map.setFilter('pol-hl', f)
  map.setFilter('pol-hl-fill', f)
}
function setCellHighlight(map: Map, id: string | null) {
  if (!ensurePolLayers(map)) return
  map.setFilter('pol-cell-hl', ['==', ['get', 'id'], id ?? NO_ID])
}

type Props = { map: Map; year: number; setYear: (y: number) => void; openEvent: (e: Ev) => void; ruler: boolean }
type Row = { t: 'hit'; h: Hit } | { t: 'more'; g: Group; n: number }

export function SearchUI({ map, year, setYear, openEvent, ruler }: Props) {
  const [q, setQ] = useState(''),
    [focus, setFocus] = useState(false),
    [act, setAct] = useState(0)
  const [expanded, setExpanded] = useState<Set<Group>>(new Set())
  const [card, setCard] = useState<Card | null>(() => cardFromHash())
  const [cells, setCells] = useState<CellP[]>([])
  const [hl, setHl] = useState(false),
    [note, setNote] = useState('')
  const [narrow, setNarrow] = useState(innerWidth <= 430)
  useEffect(() => {
    const f = () => setNarrow(innerWidth <= 430)
    addEventListener('resize', f)
    return () => removeEventListener('resize', f)
  }, [])
  const noteT = useRef<ReturnType<typeof setTimeout>>(undefined)
  const master = useMaster()
  const pin = useRef<Marker | null>(null)
  const groups = useMemo(() => searchGroups(index, q), [q, master])
  const rows = useMemo(
    () =>
      groups.flatMap((g): Row[] => {
        const lim = expanded.has(g.group) ? g.hits.length : LIMIT
        return [
          ...g.hits.slice(0, lim).map((h): Row => ({ t: 'hit', h })),
          ...(g.hits.length > lim ? [{ t: 'more', g: g.group, n: g.hits.length - lim } as Row] : []),
        ]
      }),
    [groups, expanded],
  )
  useEffect(() => {
    loadCells().then(setCells)
  }, [])
  // досье <-> хеш: открытое пишем в d=…, закрытое убираем; при hashchange открываем по ключу
  useEffect(() => {
    const p = new URLSearchParams(location.hash.replace(/^#/, '')),
      want = card && card.t !== 'cell' ? `${card.t}:${card.id}` : null
    if ((p.get('d') ?? null) === want) return
    want ? p.set('d', want) : p.delete('d')
    history.replaceState(history.state, '', ser(p))
  }, [card])
  useEffect(() => {
    const f = () => {
      const c = cardFromHash()
      if (c) setCard((o) => (o && o.t === c.t && o.id === c.id ? o : c))
    }
    addEventListener('hashchange', f)
    return () => removeEventListener('hashchange', f)
  }, [])
  // досье по событию (окна «Связи», врезка и схема Иллиора)
  useEffect(() => {
    return on('dossier', (d) => {
      clearPin()
      setCard({ t: d.t, id: d.id })
    })
  }, [])
  // подсвечен (и выбирается Enter) первый результат с точкой на карте; нет таких — первая строка
  useEffect(() => {
    const i = rows.findIndex((r) => r.t === 'hit' && mappable(r.h.entry))
    setAct(Math.max(0, i))
    setExpanded(new Set())
  }, [q])
  useDossier('search', !!card, () => setCard(null), card ? `${card.t}|${card.id}` : '')

  const clearPin = () => {
    pin.current?.remove()
    pin.current = null
  }
  /** Кольцо и камера по одной точке; withCard — центр смещён из-под карточки. Отступ считаем после появления карточки. */
  const flyTo = (ll: [number, number] | null, withCard = true) => {
    clearPin()
    if (!ll) return
    const el = document.createElement('div')
    el.className = 'search-pin'
    el.appendChild(document.createElement('i')) // анимация — на дочернем элементе: transform самого маркера принадлежит MapLibre
    pin.current = new Marker({ element: el, anchor: 'center' }).setLngLat(ll).addTo(map)
    const Z = 3.5
    const go = () =>
      map.flyTo({
        center: ll,
        zoom: Math.max(map.getZoom(), 4),
        duration: 900,
        padding: withCard ? cardPadding() : { top: 0, bottom: 0, left: 0, right: 0 },
      })
    withCard ? setTimeout(go, 60) : go()
    // появление карточки меняет отступы камеры в main.tsx (easeTo) и может оборвать перелёт: если камера встала ближе Z не дойдя, летим ещё раз (до 3 раз)
    const mine = pin.current
    for (const t of [550, 1300, 2300])
      setTimeout(() => {
        if (pin.current === mine && !map.isMoving() && map.getZoom() < Z) go()
      }, t)
  }
  const flyPlace = (id: string) => {
    const xy = placeXY(placeBy.get(id))
    flyTo(xy ? pxToLngLat([xy.x, xy.y]) : null)
  }
  useEffect(() => {
    return on('flyto', ({ place }) => flyPlace(place))
  }, [])
  useEffect(() => {
    if (!card) {
      clearPin()
      setHl(false)
    }
  }, [card])
  useEffect(() => {
    if (!(card?.t === 'polity' && hl)) setHighlight(map, null)
  }, [card, hl])
  useEffect(() => {
    if (card?.t === 'polity' && hl) setHighlight(map, card.id)
  }, [card, hl, year])
  useEffect(() => {
    setCellHighlight(map, card?.t === 'cell' ? card.id : null)
    return () => setCellHighlight(map, null)
  }, [card, year])

  // клик по карте при включённой «Политике по годам»
  const st = useRef({ ruler, year })
  st.current = { ruler, year }
  useEffect(() => {
    const onClick = (e: MapMouseEvent) => {
      if (
        st.current.ruler ||
        !map.getLayer('pol-fill') ||
        map.getLayoutProperty('pol-fill', 'visibility') !== 'visible'
      )
        return
      if (map.queryRenderedFeatures(e.point, { layers: ['events-pts'] }).length) return
      const f = map.queryRenderedFeatures(e.point, { layers: ['pol-fill'] })[0]
      if (f) {
        clearPin()
        setCard({ t: 'cell', id: f.properties.id })
      }
    }
    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
    }
  }, [])

  /** На телефоне поле поиска раскрыто на всю шапку: после выбора сворачиваем в иконку (кнопка шапки сама переключает своё состояние). */
  const collapsePhone = () => {
    if (innerWidth <= 640 && document.body.classList.contains('search-open'))
      document.getElementById('search-btn')?.click()
  }
  /** Телефон: Esc и тап по карте очищают поле и сворачивают его в иконку — возвращаются кнопки Фон, Ещё, Инструменты, Слои. */
  const dismissPhone = () => {
    setQ('')
    setFocus(false)
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    collapsePhone()
  }
  const dis = useRef(dismissPhone)
  dis.current = dismissPhone
  useEffect(() => {
    const f = () => {
      if (innerWidth <= 640 && document.body.classList.contains('search-open')) dis.current()
    }
    map.on('click', f)
    return () => {
      map.off('click', f)
    }
  }, [])
  const notify = (t: string) => {
    setNote(t)
    clearTimeout(noteT.current)
    noteT.current = setTimeout(() => setNote(''), 3500)
  }
  const pick = (e: Entry) => {
    setFocus(false)
    setQ('')
    collapsePhone()
    if (e.group === 'place') {
      setCard({ t: 'place', id: e.id })
      flyPlace(e.id)
      if (e.nomap) notify(NOMAP_NOTE)
    } else if (e.group === 'polity') {
      setCard({ t: 'polity', id: e.id })
      showPol(e.id)
    } else if (e.group === 'person') {
      setCard({ t: 'person', id: e.id })
      flyTo(lngLatOf(placeOfPerson(e.id)))
      if (!mappable(e)) notify(NOMAP_NOTE)
    } else if (e.group === 'org') {
      setCard({ t: 'org', id: e.id })
      flyTo(lngLatOf(placeOfOrg(e.id)))
      if (!mappable(e)) notify(NOMAP_NOTE)
    } else goEvent(events.find((x) => x.id === e.id)!)
  }
  const goEvent = (ev: Ev) => {
    setCard(null)
    setYear(ev.year!)
    openEvent(ev)
    flyTo(ev.places.map((id) => lngLatOf(placeBy.get(id))).find(Boolean) ?? null)
  }
  const showPolity = (id: string) => {
    setHl(false)
    setCard({ t: 'polity', id })
  }
  const pickRow = (r: Row) => {
    if (r.t === 'hit') pick(r.h.entry)
    else setExpanded(new Set([...expanded, r.g]))
  }
  const onKey = (e: KeyboardEvent) => {
    const len = open ? rows.length : showPop ? popular.length + 1 : 0
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocus(true)
      setAct((a) => Math.max(0, Math.min(a + 1, len - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAct((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Home' && len) {
      e.preventDefault()
      setAct(0)
    } else if (e.key === 'End' && len) {
      e.preventDefault()
      setAct(len - 1)
    } else if (e.key === 'Enter' && open && rows[act]) {
      e.preventDefault()
      pickRow(rows[act])
    } else if (e.key === 'Enter' && showPop && act < len) {
      e.preventDefault()
      act < popular.length ? pick(popular[act]) : randomPlace()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (innerWidth <= 640) dismissPhone()
      else if (open || showPop) setFocus(false)
      else if (q) setQ('')
    } // фокус остаётся в поле: первый Esc закрывает список, второй очищает
  }

  /** Подсветить государство на карте; вне текущего года — сначала перейти к ближайшему году, где оно есть. */
  const polityTarget = (id: string) => {
    if (cells.some((c) => ownerAt(cellRuns[c.id], year + YEAR_END).polity === id)) return year
    // не существует в этом году: сначала год основания (если на нём есть ячейки), иначе ближайший год с ячейками
    const f = polityLife(id)?.from
    return f !== undefined && polityYears(cellRuns, id).some(([a, b]) => f >= a && f <= b)
      ? f
      : nearestYearWith(cellRuns, id, year)
  }
  const togglePolMap = () => {
    if (card?.t !== 'polity') return
    if (hl && polityTarget(card.id) === year) {
      setHl(false)
      return
    }
    showPol(card.id)
  }
  /** Показать государство: к году, где оно есть, политика включена, камера по его участкам, подсветка. */
  const showPol = (id: string) => {
    const target = polityTarget(id)
    if (target === null) {
      notify(NOMAP_NOTE)
      return
    }
    if (target !== year) setYear(target)
    if (!map.getLayer('pol-fill') || map.getLayoutProperty('pol-fill', 'visibility') !== 'visible') emit('politics-on')
    let n = 0
    const t = setInterval(() => {
      if (map.getSource('pol') || ++n > 50) {
        clearInterval(t)
        setHl(true)
      }
    }, 100)
    const pts = cells
      .filter((c) => ownerAt(cellRuns[c.id], target + YEAR_END).polity === id)
      .map((c) => pxToLngLat(c.centroid))
    if (pts.length) {
      const xs = pts.map((p) => p[0]),
        ys = pts.map((p) => p[1])
      const box: [[number, number], [number, number]] = [
        [Math.min(...xs), Math.min(...ys)],
        [Math.max(...xs), Math.max(...ys)],
      ]
      const go = () => map.fitBounds(box, { padding: cardPadding(50), maxZoom: 5, duration: 900 })
      // карточка меняет отступы камеры (main.tsx, easeTo) и может оборвать перелёт: подождать её и, если камера не дошла, лететь ещё раз
      setTimeout(go, 60)
      for (const t of [700, 1500, 2500])
        setTimeout(() => {
          if (!map.isMoving() && map.getZoom() < 1.6) go()
        }, t)
    }
  }

  let gi = -1
  const open = focus && !!q.trim()
  const showPop = focus && !q.trim()
  const popular = useMemo(
    () =>
      POPULAR.map(
        (n) =>
          searchGroups(index, n)
            .flatMap((g) => g.hits)
            .find((h) => h.entry.group === 'place' || h.entry.group === 'polity')?.entry,
      ).filter((x): x is Entry => !!x),
    [],
  )
  const randomPlace = () => {
    const pool = index.filter(
      (e) =>
        e.group === 'place' &&
        e.kind &&
        ['city', 'capital', 'fortress', 'village', 'port', 'ruin', 'temple', 'mine', 'school'].includes(e.kind) &&
        typeof placeBy.get(e.id)?.x === 'number',
    )
    if (pool.length) pick(pool[Math.floor(Math.random() * pool.length)])
  }
  const total = groups.reduce((n, g) => n + g.hits.length, 0)
  const box = (
    <div class="sbox">
      <input
        type="search"
        {...({ role: 'combobox' } as object)}
        aria-expanded={open || showPop}
        aria-controls={showPop ? 'spop' : 'sres'}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-activedescendant={
          open && rows[act] ? `sopt-${act}` : showPop && act <= popular.length ? `spop-${act}` : undefined
        }
        value={q}
        placeholder={narrow ? 'Поиск по атласу' : 'Поиск: места, люди, государства, события'}
        aria-label="Поиск"
        autocomplete="off"
        onInput={(e) => {
          setQ((e.target as HTMLInputElement).value)
          setFocus(true)
        }}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 150)}
        onKeyDown={onKey}
      />
      <div class="sr" role="status" aria-live="polite">
        {open ? (total ? `Найдено: ${total}` : 'Ничего не найдено') : ''}
      </div>
      {showPop && (
        <div class="sres spop" id="spop" role="listbox" aria-label="Подсказки">
          <h5 role="presentation">Популярное</h5>
          {popular.map((e, i) => (
            <div
              id={`spop-${i}`}
              class={`sitem ${i === act ? 'act' : ''}`}
              role="option"
              aria-selected={i === act}
              onMouseDown={(ev) => {
                ev.preventDefault()
                pick(e)
              }}
              onMouseEnter={() => setAct(i)}
            >
              <EntryIcon e={e} />
              <b>{e.name}</b>
              <span>{e.sub}</span>
            </div>
          ))}
          <div
            id={`spop-${popular.length}`}
            class={`sitem ${act === popular.length ? 'act' : ''}`}
            role="option"
            aria-selected={act === popular.length}
            onMouseDown={(ev) => {
              ev.preventDefault()
              randomPlace()
            }}
            onMouseEnter={() => setAct(popular.length)}
          >
            <KindIcon k="other" />
            <b>Случайное место</b>
            <span />
          </div>
        </div>
      )}
      <div class="sres" id="sres" role="listbox" aria-label="Результаты поиска" hidden={!open}>
        {open && !rows.length && <div class="snone">Ничего не найдено</div>}
        {open &&
          groups.map((g) => (
            <div class="sgroup" role="presentation">
              <div class="sgh" role="presentation">
                {GROUP_NAME[g.group]} · {g.hits.length}
              </div>
              {rows
                .filter((r) => (r.t === 'hit' ? r.h.entry.group : r.g) === g.group)
                .map((r) => {
                  gi++
                  const i = gi
                  return r.t === 'hit' ? (
                    <div
                      id={`sopt-${i}`}
                      class={`sitem ${i === act ? 'act' : ''}`}
                      role="option"
                      aria-selected={i === act}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        pick(r.h.entry)
                      }}
                      onMouseEnter={() => setAct(i)}
                    >
                      <EntryIcon e={r.h.entry} />
                      <b title={r.h.entry.name}>
                        {r.h.entry.name}
                        {r.h.via && !norm(r.h.entry.name).includes(norm(r.h.via)) && <i> ({r.h.via})</i>}
                      </b>
                      <span>
                        {r.h.entry.sub}
                        {r.h.entry.conf && (
                          <>
                            {' '}
                            <Badge c={r.h.entry.conf} />
                          </>
                        )}
                        {r.h.entry.nomap && <em class="nomap"> нет на карте</em>}
                      </span>
                    </div>
                  ) : (
                    <div
                      id={`sopt-${i}`}
                      class={`sitem smore ${i === act ? 'act' : ''}`}
                      role="option"
                      aria-selected={i === act}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        pickRow(r)
                      }}
                      onMouseEnter={() => setAct(i)}
                    >
                      <b>ещё {r.n}</b>
                    </div>
                  )
                })}
            </div>
          ))}
      </div>
    </div>
  )

  const close = () => setCard(null)
  /** Место без координат: карта не двигается, шторка на телефоне открывается в положении peek. */
  const nopos = card?.t === 'place' && !placeXY(placeBy.get(card.id))
  let body: ComponentChildren = null
  if (card?.t === 'place') {
    body = (
      <PlaceCard
        p={placeBy.get(card.id)!}
        onPlace={(id) => {
          setCard({ t: 'place', id })
          flyPlace(id)
        }}
        onEvent={goEvent}
      />
    )
  } else if (card?.t === 'person') {
    const pl = placeOfPerson(card.id)
    body = (
      <PersonCard
        p={personBy.get(card.id)!}
        pl={pl}
        onEvent={goEvent}
        onPerson={(id) => {
          setCard({ t: 'person', id })
          flyTo(lngLatOf(placeOfPerson(id)))
        }}
        onPlace={() => {
          if (pl) {
            setCard({ t: 'place', id: pl.id })
            flyPlace(pl.id)
          }
        }}
      />
    )
  } else if (card?.t === 'org') {
    const pl = placeOfOrg(card.id)
    body = (
      <OrgCard
        o={orgBy.get(card.id)!}
        pl={pl}
        onPlace={() => {
          if (pl) {
            setCard({ t: 'place', id: pl.id })
            flyPlace(pl.id)
          }
        }}
      />
    )
  } else if (card?.t === 'polity') {
    const d = polityDossier(card.id, cells),
      w = polityWiki(card.id)
    const target = cells.length ? polityTarget(card.id) : year
    const nowN = cells.filter((c) => ownerAt(cellRuns[c.id], year + YEAR_END).polity === card.id).length
    const link = (id: string | null) =>
      id ? (
        <a class="lk" onClick={() => showPolity(id)}>
          {polName(id)}
        </a>
      ) : (
        <span>—</span>
      )
    const since = d.founded ?? (d.life ? Math.floor(d.life.first) : null)
    const end = d.life ? (d.life.last === null ? 'по наше время' : `до ${yearG(Math.floor(d.life.last))}`) : ''
    const btn =
      hl && target === year
        ? 'Убрать подсветку'
        : target === null
          ? 'На карте не показано'
          : target === year
            ? `Показать на карте в ${yearLabel(year)}`
            : `Перейти к ${yearG(target)} и показать`
    body = (
      <div class="card scard">
        <div class="khead">
          <KindIcon k="polity" size={20} />
          <span class="klabel">Государство</span>
        </div>
        <h3>
          <i class="sw" style={{ background: d.color }} />
          {d.name}
        </h3>
        <WikiTop slug={w ?? undefined} />
        <div class="meta">
          {since !== null ? `с ${yearG(since)}` : 'год основания не назван'}
          {end ? ` — ${end}` : ''}
        </div>
        {d.life && nowN === 0 && (
          <p class="meta gone">
            <b>В {yearG(year)} не существует.</b>
          </p>
        )}
        {d.life && (
          <p class="meta">
            На карте с {yearG(Math.floor(d.life.first))}; {year === 1006 ? 'сейчас' : `в ${yearG(year)}`} {nowN}{' '}
            {plural(nowN, 'участок', 'участка', 'участков')} (всего за историю — {d.life.cells})
          </p>
        )}
        {!d.life && <p class="meta">Участков в данных нет.</p>}
        {d.gov && (
          <p>
            <b>Устройство:</b> {d.gov} <span class="meta">(по вики)</span>
          </p>
        )}
        <h4>Правители</h4>
        {d.rulers.length ? (
          <ul class="rl">
            {d.rulers.slice(0, 14).map((r) => (
              <li>
                <b>{r.ruler}</b> <span>{rulerSpan(r.from, r.to)}</span>
              </li>
            ))}
            {d.rulers.length > 14 && <li class="meta">…и ещё {d.rulers.length - 14}</li>}
          </ul>
        ) : (
          <p class="meta">{d.gov ? 'Отдельные правители в хронике не названы.' : 'В хронике правители не названы.'}</p>
        )}
        <h4>Преемственность</h4>
        <p>
          <b>Предшественник:</b> {link(d.prev)}
          <br />
          <b>Преемник:</b> {link(d.next)}
        </p>
        {d.ref && <p class="meta">по участку «{d.ref.name}»</p>}
        <h4>События</h4>
        {d.events.length ? (
          <div class="evlist">
            {d.events.slice(0, 12).map((e) => (
              <a onClick={() => goEvent(e)}>
                {yearLabel(e.year!)} — {e.title}
              </a>
            ))}
            {d.events.length > 12 && <span class="meta">…и ещё {d.events.length - 12}</span>}
          </div>
        ) : (
          <p class="meta">Событий с территориальными изменениями нет.</p>
        )}
        <button class={`onmap ${hl && target === year ? 'on' : ''}`} disabled={target === null} onClick={togglePolMap}>
          {btn}
        </button>
      </div>
    )
  } else if (card?.t === 'cell') {
    const runs = cellRuns[card.id],
      c = cells.find((x) => x.id === card.id)
    const o = ownerAt(runs, year + YEAR_END),
      hist = cellHistory(runs ?? [])
    // подряд идущие записи одного владельца — одна строка (смена достоверности: «вывод → факт»)
    const rows = hist.reduce<
      { polity: string | null; from: number; to: number | null; confs: { c: Conf | null; from: number }[] }[]
    >((a, s) => {
      const l = a[a.length - 1]
      if (l && l.polity === s.polity) {
        l.to = s.to
        if (l.confs[l.confs.length - 1].c !== s.conf) l.confs.push({ c: s.conf, from: s.from })
      } else a.push({ polity: s.polity, from: s.from, to: s.to, confs: [{ c: s.conf, from: s.from }] })
      return a
    }, [])
    const a = hist[0]?.from ?? year,
      b = 1006,
      span = Math.max(1, b - a)
    const badge = (conf: Conf | null, polity: string | null) =>
      polity ? (
        <span class={`conf ${conf ?? 'none'}`} title={confidenceTitle(conf)}>
          {confRu(conf)}
        </span>
      ) : null
    body = (
      <div class="card scard">
        <div class="khead">
          <KindIcon k="region" size={20} />
          <span class="klabel">Владение землёй</span>
        </div>
        <h3>Земли: {c?.name ?? card.id}</h3>
        <div class="meta">{c?.region_name}</div>
        <p class="cell-now">
          <b>Эта земля в {yearLabel(year)}:</b>{' '}
          {o.polity ? (
            <a class="lk" onClick={() => showPolity(o.polity!)}>
              {polName(o.polity)}
            </a>
          ) : (
            <span>нет сведений</span>
          )}
        </p>
        {o.polity && (
          <p>
            <b>Достоверность:</b> <Badge c={o.confidence} />
            {hist[0] && <span class="meta"> · запись с {yearG(Math.floor(hist[0].from))}</span>}
          </p>
        )}
        <Sources list={o.sources} />
        <h4>История владения</h4>
        <div class="strip" title="клик — перейти к году">
          {hist.map((s) => (
            <i
              style={{
                flex: `${Math.max(0.4, (((s.to ?? b) - s.from) / span) * 100)} 0 0`,
                background: s.polity ? (polities[s.polity]?.color ?? NIL) : NIL,
              }}
              class={s.conf ?? ''}
              onClick={() => setYear(Math.min(Math.max(Math.floor(s.from), -1700), 1006))}
              title={`${yl(s.from)} — ${polName(s.polity)}`}
            />
          ))}
          <u style={{ left: `${Math.min(100, Math.max(0, ((year - a) / span) * 100))}%` }} />
        </div>
        <ul class="rl hist">
          {rows.map((s) => (
            <li class={year >= s.from && (s.to === null || year < s.to) ? 'cur' : ''}>
              <a onClick={() => setYear(Math.floor(s.from))}>{yl(s.from)}</a>{' '}
              <i class="sw" style={{ background: s.polity ? (polities[s.polity]?.color ?? NIL) : NIL }} />
              {polName(s.polity)}{' '}
              {s.confs.map((x, i) => (
                <>
                  {i > 0 && ' → '}
                  {badge(x.c, s.polity)}
                  {s.confs.length > 1 && <span class="meta"> {yl(x.from)}</span>}
                </>
              ))}
            </li>
          ))}
        </ul>
        <p class="meta cell-note">Границы — допущение атласа, не вики.</p>
      </div>
    )
  }
  return (
    <>
      {createPortal(box, document.getElementById('slot-search')!)}
      {note &&
        createPortal(
          <div class="stoast" role="status">
            {note}
          </div>,
          document.body,
        )}
      {card &&
        createPortal(
          <div class={`sdossier${nopos ? ' nopos' : ''}`}>
            <CloseBtn onClick={close} />
            {body}
          </div>,
          dossierSlot(),
        )}
    </>
  )
}
