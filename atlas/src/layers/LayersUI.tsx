import type { Map, MapMouseEvent, MapSourceDataEvent } from 'maplibre-gl'
import { createPortal } from 'preact/compat'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { dossierSlot, useDossier } from '../dossier'
import { wikiUrl } from '../events'
import { pxToLngLat } from '../geo/pixel'
import { visibleAt, type Obj } from './build'
import { ensureIcon, ensureLabel, iconDataUrl, iconUrl, thematic } from './icons'
import { EVENT_CHIPS, setTypeFilter } from './eventsMap'
import { readHistoryLayers, readLayerIds, withLayerIds } from './layerHash'
import { placeBy } from '../search/data'
import { readyIds, useMaster, wantedLayers } from '../master'
import { built, catsOf, iconOf, areasFile, routes, placeName, LAYER_BLURB, BOUND_1006, shortName } from './registry'
import './panel.css'
import { ROUTE_LAYERS, KIND_META, applyRoutes, routeLayerIds } from './routesMap'
import { miniVisible } from './models'
import { AREA_LAYER_IDS, resolveCell, summary, type CellProps } from './areaData'
import { applyAreas, areaLayerIds, ensureAreas } from './areasMap'
import { useOverlay } from '../ui/overlayStack'
import { toast } from '../ui/toast'
import { Ic } from '../ui/uiIcons'
import { announcePanel, onPanel, store } from '../ui/panels'
import { emit, on as onBus } from '../lib/bus'
import { error } from '../lib/log'
import { CloseBtn } from '../ui/CloseBtn'

/** Контейнер чипов активных слоёв — в DOM перед доком: Tab с карты идёт сначала на чипы, потом на кнопки дока. */
const chipsHost = (): HTMLElement => {
  let h = document.getElementById('al-slot')
  if (!h) {
    h = document.createElement('div')
    h.id = 'al-slot'
    const d = document.getElementById('dock')
    d?.parentNode ? d.parentNode.insertBefore(h, d) : document.body.appendChild(h)
  }
  return h
}
const CONF = { canon: 'факт', derived: 'вывод', speculative: 'гипотеза' } as const

/** Раскладывает объекты с одинаковыми координатами по спирали, чтобы значки не лежали друг на друге. */
function spread(list: Obj[]): Map2 {
  const byXY = new globalThis.Map<string, Obj[]>()
  for (const o of list) {
    const k = `${o.x},${o.y}`
    byXY.set(k, [...(byXY.get(k) ?? []), o])
  }
  const out: Map2 = []
  for (const g of byXY.values())
    g.forEach((o, i) => {
      const a = i * 2.4,
        r = i === 0 ? 0 : 26 * Math.sqrt(i)
      out.push([o, o.x! + Math.cos(a) * r, o.y! + Math.sin(a) * r])
    })
  return out
}
type Map2 = [Obj, number, number][]

const GZ_CATS = new Set(['столицы', 'города', 'деревни', 'порты']) // уже нарисованы на растре автора
export function LayersUI({
  map,
  year,
  win,
  onActive,
  evStats,
  rumStats,
  onOpenEvents,
}: {
  map: Map
  year: number
  win: number
  onActive: (ids: string[]) => void
  evStats: { vis: number; tot: number }
  rumStats: { vis: number; tot: number }
  onOpenEvents: () => void
}) {
  const master = useMaster()
  useEffect(() => {
    if (!master) setOn((v) => v.filter((id) => readyIds.has(id)))
    else setOn((v) => [...v, ...wantedLayers.filter((id) => id === 'rumors' && readyIds.has(id) && !v.includes(id))])
  }, [master])
  const [on, setOn] = useState<string[]>(() => readLayerIds(location.hash).filter((id) => readyIds.has(id)))
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  // слои истории (политика, ландшафт) живут в том же ключе l, но считаются в счётчике и чипах наравне с остальными
  const [hist, setHist] = useState(() => readHistoryLayers(location.hash))
  useEffect(() => {
    const f = () => setHist(readHistoryLayers(location.hash))
    const g = (d: { politics: boolean; landscape: boolean }) => {
      if (d) setHist({ politics: !!d.politics, landscape: !!d.landscape })
    }
    addEventListener('hashchange', f)
    const offState = onBus('history-state', g)
    return () => {
      removeEventListener('hashchange', f)
      offState()
    }
  }, [])
  const histOff = (k: 'politics' | 'landscape') => emit('history', { ...hist, [k]: false })
  const HIST_CHIPS = [
    { k: 'politics' as const, name: 'Политика', color: '#8c1c13' },
    { k: 'landscape' as const, name: 'Ландшафт', color: '#5a7a3a' },
  ].filter((c) => hist[c.k])
  const [q, setQ] = useState('')
  const [showPlanned, setShowPlanned] = useState(false)
  const [allHits, setAllHits] = useState(false)
  const [open, setOpen0] = useState(() => store.get('layers-open') === '1')
  const setOpen = (v: boolean) => {
    setOpen0(v)
    store.set('layers-open', v ? '1' : '0')
    if (v) announcePanel('layers')
  }
  const qRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    document.body.classList.toggle('layers-open', open)
    if (open && !matchMedia('(pointer: coarse)').matches) qRef.current?.focus({ preventScroll: true })
  }, [open])
  useEffect(
    () =>
      onPanel((p) => {
        if (p !== 'layers') setOpen0(false)
      }),
    [],
  )
  useOverlay(open, () => setOpen0(false), 4)
  const [blOpen, setBlOpen] = useState<Set<string>>(() => new Set())
  const [closedGroups, setClosedGroups] = useState<Set<string>>(() => new Set())
  const [sel, setSel] = useState<Obj[]>([])
  const [si, setSi] = useState(0)
  const [ready, setReady] = useState(false)
  const [cells, setCells] = useState<CellProps[]>([])
  const [rcard, setRcard] = useState<string | null>(null)
  const [acard, setAcard] = useState<string | null>(null)

  useEffect(() => {
    onActive(on)
  }, [on])
  // сферы гильдий: при включении слоя показана одна гильдия (самая крупная), остальные выключены
  const guildInit = useRef(false),
    allGuilds = useRef(false)
  useEffect(() => {
    const has = on.includes('guild-spheres')
    if (!has) {
      guildInit.current = false
      return
    }
    if (guildInit.current || !cells.length) return
    guildInit.current = true
    if (allGuilds.current) {
      allGuilds.current = false
      setHidden((h) => {
        const x = new Set(h)
        for (const g of Object.keys(areasFile.values.guild)) x.delete(`guild|${g}`)
        return x
      })
      return
    }
    const first = summary(areasFile, 'guild', cells).legend[0]?.value
    setHidden((h) => {
      const x = new Set(h)
      for (const g of Object.keys(areasFile.values.guild)) g !== first ? x.add(`guild|${g}`) : x.delete(`guild|${g}`)
      return x
    })
  }, [on, cells])
  // источник и слой значков на карте
  useEffect(() => {
    const init = () => {
      map.addSource('thematic', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer(
        {
          id: 'thematic-icons',
          type: 'symbol',
          source: 'thematic',
          layout: {
            'icon-image': ['get', 'icon'],
            'icon-size': ['interpolate', ['linear'], ['zoom'], 1, 0.6, 4, 0.85, 7, 1.15],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        },
        'measure-line',
      )
      map.addLayer(
        {
          id: 'thematic-labels',
          type: 'symbol',
          source: 'thematic',
          minzoom: 3,
          filter: ['has', 'lbl'],
          layout: {
            'icon-image': ['get', 'lbl'],
            'icon-anchor': 'top',
            'icon-offset': [0, 9],
            'icon-allow-overlap': false,
          },
        },
        'measure-line',
      )
      setReady(true)
    }
    if (map.isStyleLoaded()) init()
    else map.once('load', init)
  }, [])

  // состояние слоёв — в URL
  useEffect(() => {
    history.replaceState(null, '', withLayerIds(location.hash, on))
  }, [on])
  useEffect(() => {
    const f = () => setOn(readLayerIds(location.hash).filter((id) => readyIds.has(id)))
    // atlas:layers {ids} — набор слоёв целиком (пресеты); в хеш его пишет только эффект выше
    const offLayers = onBus('layers', ({ ids, allGuilds: all }) => {
      allGuilds.current = !!all
      if (Array.isArray(ids)) setOn([...new Set(ids.filter((id) => readyIds.has(id)))])
    })
    addEventListener('hashchange', f)
    return () => {
      removeEventListener('hashchange', f)
      offLayers()
    }
  }, [])

  const shown = useMemo(
    () =>
      on.flatMap((id) =>
        (built.objs.get(id) ?? []).filter((o) => visibleAt(o, year, win) && !hidden.has(`${id}|${o.cat}`)),
      ),
    [on, hidden, year, win],
  )

  useEffect(() => {
    if (!ready) return
    const features = spread(shown).map(([o, x, y]) => {
      const ic = iconOf(o.layer, o.cat, o.approx, o.name)
      ensureIcon(map, ic.name, ic.shape, ic.color, o.approx)
      const lbl = o.layer === 'fortresses' || o.layer === 'guild-hq' ? `tl-${o.name}` : undefined // подпись у z≥3
      if (lbl) ensureLabel(map, lbl, o.name)
      return {
        type: 'Feature' as const,
        properties: {
          key: o.key,
          icon: ic.name,
          ...(lbl ? { lbl } : {}),
          ...(o.layer === 'places-ranked' && GZ_CATS.has(o.cat) && o.sources?.includes('map:газеттир')
            ? { gz: 1 }
            : {}),
        },
        geometry: { type: 'Point' as const, coordinates: pxToLngLat([x, y]) },
      }
    })
    thematic.set(map, { type: 'FeatureCollection', features })
  }, [shown, ready])

  const areaKeys = useMemo(() => on.map((id) => AREA_LAYER_IDS[id]).filter(Boolean), [on])
  useEffect(() => {
    if (!ready) return
    ensureAreas(map)
      .then((c) => setCells(c.cells))
      .then(() => applyAreas(map, areaKeys, hidden))
      .catch((e) => error('слой площадей', e))
  }, [areaKeys, hidden, ready])

  const routeKinds = useMemo(() => on.flatMap((id) => ROUTE_LAYERS[id] ?? []), [on])
  useEffect(() => {
    if (!ready) return
    applyRoutes(map, routeKinds, hidden, year, win).catch((e) => error('слой путей', e))
  }, [routeKinds, hidden, year, win, ready])

  useEffect(() => {
    if (!ready) return
    const all = new globalThis.Map([...built.objs.values()].flat().map((o) => [o.key, o]))
    const click = (e: MapMouseEvent) => {
      const bb: [[number, number], [number, number]] = [
        [e.point.x - 8, e.point.y - 8],
        [e.point.x + 8, e.point.y + 8],
      ]
      const keys = [
        ...new Set<string>(
          map
            .queryRenderedFeatures(bb, { layers: ['thematic-icons', 'thematic-hit'].filter((i) => map.getLayer(i)) })
            .map((f) => String(f.properties.key)),
        ),
      ]
      if (!keys.length) {
        const rf = map.queryRenderedFeatures(
          [
            [e.point.x - 6, e.point.y - 6],
            [e.point.x + 6, e.point.y + 6],
          ],
          { layers: routeLayerIds.filter((i) => map.getLayer(i)) },
        )[0]
        if (rf) {
          setRcard(String(rf.properties!.id))
          setAcard(null)
          setSel([])
          return
        }
        setRcard(null)
        const ids = areaLayerIds().filter(
          (i) => map.getLayer(i) && map.getLayoutProperty(i, 'visibility') === 'visible',
        )
        const f = ids.length ? map.queryRenderedFeatures(e.point, { layers: ids })[0] : undefined
        setAcard(f ? String(f.properties!.id) : null)
        if (f) setSel([])
        return
      }
      setAcard(null)
      setRcard(null)
      setSel(keys.map((k) => all.get(k)!).filter(Boolean))
      setSi(0)
    }
    const enter = () => (map.getCanvas().style.cursor = 'pointer'),
      leave = () => (map.getCanvas().style.cursor = '')
    map.on('click', click)
    map.on('mouseenter', 'thematic-icons', enter)
    map.on('mouseleave', 'thematic-icons', leave)
    return () => {
      map.off('click', click)
      map.off('mouseenter', 'thematic-icons', enter)
      map.off('mouseleave', 'thematic-icons', leave)
    }
  }, [ready])

  const toggle = (id: string) => {
    if (!on.includes(id) && BOUND_1006.has(id) && year !== 1006)
      toast(`Данные слоя «${layerName(id)}» — на 1006 г.; ползунок лет их не меняет`)
    setOn((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]))
  }
  const [missOpen, setMissOpen] = useState<Set<string>>(() => new Set())
  const ql = q.trim().toLowerCase()
  const layerHit = (l: (typeof built.layers)[number]) =>
    (l.status === 'ready' || showPlanned) &&
    (!ql ||
      l.name.toLowerCase().includes(ql) ||
      (built.groups
        .find((g) => g.id === l.group)
        ?.name.toLowerCase()
        .includes(ql) ??
        false))
  const objAll = useMemo(() => {
    if (ql.length < 2) return []
    const seen = new Set<string>()
    return [...built.objs.values()].flat().filter((o) => {
      if (!o.name.toLowerCase().includes(ql) || o.x == null) return false
      const k = o.id || o.key
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }, [ql])
  const objHits = allHits ? objAll : objAll.slice(0, 8)
  const nPlanned = built.layers.filter((l) => l.status !== 'ready').length
  const onLayers = on.map((id) => built.layers.find((l) => l.id === id)).filter((l): l is NonNullable<typeof l> => !!l)
  const nonEmpty = (l: (typeof built.layers)[number]) => {
    if (l.id === 'events') return evStats.vis > 0
    if (l.id === 'rumors') return rumStats.vis > 0
    if (l.id === 'world-miniatures') return built.minis.some((m) => miniVisible(m, year))
    if (AREA_LAYER_IDS[l.id]) return cells.length ? summary(areasFile, AREA_LAYER_IDS[l.id], cells).filled > 0 : true
    const rk = ROUTE_LAYERS[l.id]
    if (rk) return routes.some((r) => rk.includes(r.kind))
    return shown.some((o) => o.layer === l.id) || BOUND_1006.has(l.id)
  }
  const nLive = onLayers.filter(nonEmpty).length + HIST_CHIPS.length
  const nOn = onLayers.length + HIST_CHIPS.length
  const onNames = [...onLayers.map((l) => l.name), ...HIST_CHIPS.map((c) => c.name)].join(', ')
  const [chipsOpen, setChipsOpen] = useState(false)
  // ряд чипов не должен лежать на плашке легенды политики и кнопках зума: поднимаем его над ближайшей помехой
  useEffect(() => {
    const row = chipsHost().querySelector<HTMLElement>('.al-legend')
    if (!row) return
    const hit = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
    const lift = () => {
      row.style.removeProperty('bottom')
      const r = row.getBoundingClientRect()
      const others = [document.querySelector('.hist-legend'), ...document.querySelectorAll('#zoomc button')].filter(
        Boolean,
      ) as Element[]
      let top = Infinity
      for (const o of others) {
        const b = o.getBoundingClientRect()
        if (b.width && hit(r, b)) top = Math.min(top, b.top)
      }
      if (isFinite(top)) row.style.bottom = `${Math.round(innerHeight - top + 6)}px`
    }
    lift()
    const tm = [400, 1500].map((t) => setTimeout(lift, t))
    const ro = new ResizeObserver(lift)
    ro.observe(document.body)
    const h = document.querySelector('.hist-legend')
    if (h) ro.observe(h)
    addEventListener('resize', lift)
    return () => {
      tm.forEach(clearTimeout)
      ro.disconnect()
      removeEventListener('resize', lift)
      row.style.removeProperty('bottom')
    }
  }, [nOn, open, chipsOpen, year])
  // фильтр типов события: выключенные чипы убирают значки с карты и из набора карточек клика
  const [evOff, setEvOff] = useState<Set<string>>(new Set())
  // сколько событий представлено на карте после фильтра типов (по источнику events-ic: одиночные значки + суммы кластеров)
  const [evDrawn, setEvDrawn] = useState<number | null>(null)
  useEffect(() => {
    if (!ready || !on.includes('events')) {
      setEvDrawn(null)
      return
    }
    const count = () => {
      const seen = new Set<string>()
      let n = 0
      for (const f of map.querySourceFeatures('events-ic')) {
        // кластер несёт сумму событий в n (clusterProperties); без него на малом зуме счётчик показывал бы 0
        const k = f.properties?.cluster
          ? `c${f.properties.cluster_id}`
          : `${f.properties.title}|${JSON.stringify(f.geometry.coordinates)}`
        if (seen.has(k)) continue
        seen.add(k)
        n += Number(f.properties.n) || 1
      }
      setEvDrawn(n)
    }
    // источник наполняется асинхронно: пересчёт по sourcedata/idle карты (дебаунс) и по смене фильтра/года/окна
    let t: ReturnType<typeof setTimeout> | undefined
    const later = (ms = 250) => {
      clearTimeout(t)
      t = setTimeout(count, ms)
    }
    const onSrc = (e: MapSourceDataEvent) => {
      if (e.sourceId === 'events-ic' && e.isSourceLoaded !== false) later()
    }
    const onIdle = () => later(100)
    map.on('sourcedata', onSrc)
    map.on('idle', onIdle)
    later(900)
    const offTypes = onBus('evtypes', () => later(900))
    return () => {
      clearTimeout(t)
      map.off('sourcedata', onSrc)
      map.off('idle', onIdle)
      offTypes()
    }
  }, [on, evOff, year, win, ready])
  useEffect(() => {
    setTypeFilter(evOff.size ? new Set(EVENT_CHIPS.filter((c) => !evOff.has(c.id)).flatMap((c) => c.keys)) : null)
  }, [evOff])
  /** Значок строки слоя: тот же, что в чипе и на карте (у слоёв без значков — свой из набора или цветной образец). */
  const ROW_ICON: Record<string, string> = {
    events: 'war',
    rumors: 'magic',
    'world-miniatures': 'dragon',
    'trade-routes': 'caravan',
    campaigns: 'army',
    fleets: 'galley',
    legions: 'legion',
    'guild-spheres': 'fair',
    slavery: 'bandits',
    roads: 'cart',
    'igni-rojo-war': 'battle',
    'great-war': 'battle',
    'noble-holdings': 'capital',
    camps: 'army',
    epidemics: 'plague',
    dynasties: 'dynasty',
    religions: 'religion',
    schisms: 'religion',
    currencies: 'economy',
    banks: 'economy',
    tolls: 'economy',
    population: 'city',
    teleport: 'magic',
    'fae-passages': 'magic',
    'magic-sources': 'crystal',
  }
  const rowIcon = (l: (typeof built.layers)[number]) =>
    ROW_ICON[l.id] ? <img src={iconUrl(ROW_ICON[l.id])} width="18" height="18" alt="" /> : legendIcon(l)
  const legendIcon = (l: (typeof built.layers)[number]) => {
    const cs = catsOf(l.id)
    if (cs.length && (built.objs.get(l.id)?.length ?? 0) > 0) {
      const ic = iconOf(l.id, cs[0].cat, false)
      return <img src={iconDataUrl(ic.shape, ic.color)} width="16" height="16" alt="" />
    }
    return <i class="sw" style={{ background: l.color ?? '#999' }} />
  }
  const pick = (o: Obj) => {
    setOn((v) => (v.includes(o.layer) ? v : [...v, o.layer]))
    setSel([o])
    setSi(0)
    map.flyTo({ center: pxToLngLat([o.x!, o.y!]), zoom: Math.max(map.getZoom(), 3.5) })
  }
  const layerName = (id: string) => built.layers.find((l) => l.id === id)?.name ?? id
  const card = sel[si]
  useDossier(
    'layers',
    !!(card || rcard || acard),
    () => {
      setSel([])
      setRcard(null)
      setAcard(null)
    },
    `${card?.key}|${rcard}|${acard}`,
  )
  // клик по месту/школе на карте открывает то же досье, что поиск, а не сырую карточку слоя
  useEffect(() => {
    if (card && (card.layer === 'places-ranked' || card.layer === 'schools') && placeBy.has(card.id)) {
      setSel([])
      emit('dossier', { t: 'place', id: card.id })
      emit('flyto', { place: card.id })
    }
  }, [card?.key]) // flyto: кольцо на точке и камера в видимой полосе над шторкой

  return (
    <>
      {createPortal(
        <button
          class={`lp-fab ${open ? 'on' : ''}`}
          aria-expanded={open}
          aria-controls="layers-panel"
          aria-label={nOn ? `Слои, включено ${nOn}: ${onNames}` : 'Слои, включено 0: включить и выключить'}
          title={nOn ? `Слои карты. Включено: ${onNames}` : 'Слои карты: включить и выключить'}
          onClick={() => setOpen(!open)}
        >
          <Ic n="layers" />
          Слои
          {nLive > 0 && (
            <span class="cnt-b" title={`Слоёв с объектами на карте: ${nLive}. Включено: ${onNames}`}>
              · {nLive}
            </span>
          )}
        </button>,
        document.getElementById('slot-layers-btn')!,
      )}
      {open && (
        <div class="lp" id="layers-panel" role="complementary" aria-label="Слои карты">
          <div class="lp-head">
            <b>Слои карты</b>
            <CloseBtn onClick={() => setOpen(false)} />
          </div>
          {nOn > 0 && (
            <div class="lp-active" aria-label="Активные слои">
              <div class="lp-at">Активные слои · {nOn}</div>
              {onLayers.map((l) => (
                <span class="lp-ac">
                  {legendIcon(l)}
                  <span class="nm">{l.name}</span>
                  {BOUND_1006.has(l.id) && <small>на 1006 г.</small>}
                  <button type="button" aria-label={`Выключить слой «${l.name}»`} onClick={() => toggle(l.id)}>
                    ×
                  </button>
                </span>
              ))}
              {HIST_CHIPS.map((c) => (
                <span class="lp-ac">
                  <i class="sw" style={{ background: c.color }} />
                  <span class="nm">{c.name}</span>
                  <button type="button" aria-label={`Выключить слой «${c.name}»`} onClick={() => histOff(c.k)}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            ref={qRef}
            class="lp-q"
            type="search"
            aria-label="Найти слой"
            placeholder="Найти слой или объект"
            value={q}
            onInput={(e) => {
              setQ((e.target as HTMLInputElement).value)
              setAllHits(false)
            }}
          />
          {objAll.length > 0 && (
            <div class="lp-hits">
              {objHits.map((o) => (
                <a role="button" tabIndex={0} onClick={() => pick(o)} onKeyDown={(e) => e.key === 'Enter' && pick(o)}>
                  {o.name}
                  <small> · {layerName(o.layer)}</small>
                </a>
              ))}
              <div class="lp-more">
                показано {objHits.length} из {objAll.length}
                {objAll.length > objHits.length && (
                  <>
                    {' '}
                    ·{' '}
                    <button type="button" class="lnk" onClick={() => setAllHits(true)}>
                      Показать все
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
          <div class="lp-body">
            {built.groups.map((g) => {
              const ls = built.layers.filter((l) => l.group === g.id && layerHit(l))
              if (!ls.length) return null
              const isOpen = ql ? true : !closedGroups.has(g.id)
              const all = built.layers.filter((l) => l.group === g.id),
                nReady = all.filter((l) => l.status === 'ready').length
              return (
                <div class="lp-group">
                  <button
                    type="button"
                    class="lp-gh"
                    aria-expanded={isOpen}
                    onClick={() =>
                      setClosedGroups((s) => {
                        const n = new Set(s)
                        n.has(g.id) ? n.delete(g.id) : n.add(g.id)
                        return n
                      })
                    }
                  >
                    <span>
                      {isOpen ? '▾' : '▸'} {g.name}
                    </span>
                    <small>
                      {nReady
                        ? nReady === all.length
                          ? `${nReady}`
                          : `${nReady} · +${all.length - nReady} планируется`
                        : 'планируется'}
                    </small>
                  </button>
                  {isOpen &&
                    ls.map((l) => {
                      const ready = l.status === 'ready',
                        enabled = on.includes(l.id)
                      const ak = AREA_LAYER_IDS[l.id],
                        asum = ak && cells.length ? summary(areasFile, ak, cells) : null
                      const isMini = l.id === 'world-miniatures'
                      const rk = isMini ? undefined : ROUTE_LAYERS[l.id],
                        rs = rk ? routes.filter((r) => rk.includes(r.kind)) : null
                      const tot = isMini
                        ? built.minis.length
                        : asum
                          ? asum.filled
                          : rs
                            ? rs.length
                            : (built.objs.get(l.id)?.length ?? 0)
                      const vis = isMini
                        ? enabled
                          ? built.minis.filter((m) => miniVisible(m, year)).length
                          : 0
                        : asum
                          ? asum.filled
                          : rs
                            ? rs.filter(
                                (r) =>
                                  !hidden.has(`route|${r.kind}`) &&
                                  (r.kind !== 'campaign' || (year >= r.year_from! - win && year <= r.year_to! + win)),
                              ).length
                            : enabled
                              ? shown.filter((o) => o.layer === l.id).length
                              : 0
                      const isEv = l.id === 'events',
                        isRum = l.id === 'rumors',
                        tot2 = isEv ? evStats.tot : isRum ? rumStats.tot : tot,
                        vis2 = isEv ? evStats.vis : isRum ? rumStats.vis : vis
                      const miss = built.missing.get(l.id)?.length ?? 0
                      const bound = BOUND_1006.has(l.id)
                      const empty = ready && enabled && vis2 === 0 && !bound
                      return (
                        <div class={`lp-row ${ready ? '' : 'soon'}`} title={ready ? l.control : l.source_note}>
                          <label>
                            <input type="checkbox" disabled={!ready} checked={enabled} onChange={() => toggle(l.id)} />
                            <span class="lp-ri">{rowIcon(l)}</span>
                            <span class="lp-t">
                              <span class="nm">{l.name}</span>
                              {ready && LAYER_BLURB[l.id] && (
                                <span
                                  class={`bl ${blOpen.has(l.id) ? 'open' : ''}`}
                                  title="Клик — показать целиком"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    setBlOpen((v) => {
                                      const x = new Set(v)
                                      x.has(l.id) ? x.delete(l.id) : x.add(l.id)
                                      return x
                                    })
                                  }}
                                >
                                  {LAYER_BLURB[l.id]}
                                </span>
                              )}
                            </span>
                            {!ready && <em>скоро</em>}
                            {ready && enabled && (
                              <span
                                class="cnt"
                                title={
                                  isEv
                                    ? `На карте сейчас ${vis2} событий с местом; всего в хронике ${tot2}, остальные без места на карте — их видно в списке`
                                    : asum
                                      ? 'ячеек с данными'
                                      : `на карте сейчас; всего в слое ${tot}`
                                }
                              >
                                {isEv ? `${vis2} на карте из ${tot2}` : `${vis2}${vis2 !== tot2 ? ` / ${tot2}` : ''}`}
                              </span>
                            )}
                            {ready && !enabled && <span class="cnt off">{tot2}</span>}
                          </label>
                          {bound && enabled && (
                            <div class="lp-note">
                              по состоянию 1006 г.
                              {l.id === 'trade-routes'
                                ? ' (пути без дат, ползунок лет не влияет)'
                                : ' (границы государств на этот год, ползунок лет не влияет)'}
                            </div>
                          )}
                          {empty && (
                            <div class="lp-note warn">
                              {isEv ? 'в этом окне лет событий нет — перемотайте время' : 'нет данных за этот год'}
                            </div>
                          )}
                          {enabled && isEv && (
                            <div class="legend">
                              <button class="chip" onClick={onOpenEvents}>
                                Список событий (и без места на карте)
                              </button>
                              {evDrawn !== null && (
                                <div class="miss" data-ev-drawn={evDrawn}>
                                  маркеров на карте: {evDrawn}
                                  {evOff.size ? ` (скрыто типов: ${evOff.size})` : ''}
                                </div>
                              )}
                              {EVENT_CHIPS.map((c) => (
                                <button
                                  class={`chip ${evOff.has(c.id) ? 'off' : ''}`}
                                  aria-pressed={!evOff.has(c.id)}
                                  title={`Показывать тип: ${c.label}`}
                                  onClick={() =>
                                    setEvOff((v) => {
                                      const x = new Set(v)
                                      x.has(c.id) ? x.delete(c.id) : x.add(c.id)
                                      return x
                                    })
                                  }
                                >
                                  <img src={iconUrl(c.keys[0])} width="14" height="14" alt="" />
                                  {c.label}
                                </button>
                              ))}
                            </div>
                          )}
                          {enabled && !isEv && !isRum && (
                            <div class="legend">
                              {l.id === 'guild-spheres' && (
                                <div class="miss">Показана одна гильдия. Включайте другие в списке ниже.</div>
                              )}
                              {asum &&
                                asum.legend.map(({ value, n }) => {
                                  const v = areasFile.values[ak][value],
                                    off = hidden.has(`${ak}|${value}`)
                                  return (
                                    <button
                                      class={`chip ${off ? 'off' : ''}`}
                                      onClick={() =>
                                        setHidden((h) => {
                                          const k = `${ak}|${value}`,
                                            x = new Set(h)
                                          x.has(k) ? x.delete(k) : x.add(k)
                                          return x
                                        })
                                      }
                                    >
                                      <i
                                        class={`sw ${ak === 'guild' ? 'hat' : ''}`}
                                        style={{
                                          background:
                                            ak === 'guild'
                                              ? `repeating-linear-gradient(${(v.angle ?? 45) + 90}deg, ${v.color} 0 1.5px, transparent 1.5px 4px)`
                                              : v.color,
                                        }}
                                      />
                                      {value}
                                      <small>{n}</small>
                                    </button>
                                  )
                                })}
                              {rk &&
                                rk.map((k) => {
                                  const off = hidden.has(`route|${k}`),
                                    n = routes.filter((r) => r.kind === k).length
                                  return (
                                    <button
                                      class={`chip ${off ? 'off' : ''}`}
                                      onClick={() =>
                                        setHidden((h) => {
                                          const x = new Set(h),
                                            key = `route|${k}`
                                          x.has(key) ? x.delete(key) : x.add(key)
                                          return x
                                        })
                                      }
                                    >
                                      <i
                                        class="sw"
                                        style={{ background: KIND_META[k].color, height: '3px', verticalAlign: '3px' }}
                                      />
                                      {KIND_META[k].name}
                                      <small>{n}</small>
                                    </button>
                                  )
                                })}
                              {rk && (
                                <div class="miss">
                                  пунктир — прямая линия: пути по дорогам, рекам или морю в данных нет
                                  {rk.includes('campaign') ? '; походы показаны по году ползунка (±окно)' : ''}
                                </div>
                              )}
                              {isMini && (
                                <div class="miss">показаны миниатюры, которые верны по лору для выбранного года</div>
                              )}
                              {asum && (
                                <div class="miss">
                                  {asum.records} записей; без данных (не закрашено): {cells.length - asum.filled} ячеек
                                </div>
                              )}
                              {catsOf(l.id).map(({ cat, n }) => {
                                const ic = iconOf(l.id, cat, false),
                                  off = hidden.has(`${l.id}|${cat}`)
                                return (
                                  <button
                                    class={`chip ${off ? 'off' : ''}`}
                                    title={
                                      l.id === 'places-ranked' && cat === 'храмы'
                                        ? `Здесь только храмы из списка мест; все ${built.objs.get('shrines')?.length ?? 0} — в слое «Святыни и храмы»`
                                        : undefined
                                    }
                                    onClick={() =>
                                      setHidden((s) => {
                                        const k = `${l.id}|${cat}`,
                                          x = new Set(s)
                                        x.has(k) ? x.delete(k) : x.add(k)
                                        return x
                                      })
                                    }
                                  >
                                    <img src={iconDataUrl(ic.shape, ic.color)} width="14" height="14" alt="" />
                                    {cat}
                                    <small>{n}</small>
                                  </button>
                                )
                              })}
                              {miss > 0 && (
                                <div class="miss">
                                  без координат (не на карте): {miss} ·{' '}
                                  <button
                                    type="button"
                                    class="lnk"
                                    aria-expanded={missOpen.has(l.id)}
                                    onClick={() =>
                                      setMissOpen((v) => {
                                        const x = new Set(v)
                                        x.has(l.id) ? x.delete(l.id) : x.add(l.id)
                                        return x
                                      })
                                    }
                                  >
                                    {missOpen.has(l.id) ? 'скрыть список' : 'показать списком'}
                                  </button>
                                  {missOpen.has(l.id) && (
                                    <ul class="lp-miss">
                                      {built.missing.get(l.id)!.map((m) => (
                                        <li title={m.why}>{m.name}</li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                </div>
              )
            })}
            <label
              class="lp-plan"
              title="Планируемые — слои, для которых в источниках пока нет данных: атлас их ещё не нарисовал"
            >
              <input type="checkbox" checked={showPlanned} onChange={() => setShowPlanned(!showPlanned)} /> Показать
              планируемые ({nPlanned})<small>слои без данных: атлас их ещё не нарисовал</small>
            </label>
          </div>
        </div>
      )}
      {!open &&
        nOn > 0 &&
        createPortal(
          <div class="al-legend" role="group" aria-label="Активные слои на карте">
            <span class="al-badge" aria-hidden="true">
              Слои · {nOn}
            </span>
            {nOn > 5 && (
              <button type="button" class="al-more" aria-expanded={chipsOpen} onClick={() => setChipsOpen(!chipsOpen)}>
                Слои: {nOn} {chipsOpen ? '▴' : '▾'}
              </button>
            )}
            {(nOn <= 5 || chipsOpen) &&
              HIST_CHIPS.map((c) => (
                <span class="al-i" title={c.name}>
                  <i class="sw" style={{ background: c.color }} />
                  <span class="nm">{c.name}</span>
                  <button type="button" aria-label={`Выключить слой «${c.name}»`} onClick={() => histOff(c.k)}>
                    ×
                  </button>
                </span>
              ))}
            {(nOn <= 5 || chipsOpen) &&
              onLayers.map((l) => (
                <span class="al-i" title={BOUND_1006.has(l.id) ? `${l.name}: по состоянию 1006 г.` : l.name}>
                  {legendIcon(l)}
                  <span class="nm">{shortName(l)}</span>
                  {BOUND_1006.has(l.id) && <small>на 1006 г.</small>}
                  <button type="button" aria-label={`Выключить слой «${l.name}»`} onClick={() => toggle(l.id)}>
                    ×
                  </button>
                </span>
              ))}
          </div>,
          chipsHost(),
        )}
      {createPortal(
        <>
          {rcard &&
            !card &&
            (() => {
              const r = routes.find((x) => x.id === rcard)
              if (!r) return null
              const yrs =
                r.year_from === null
                  ? null
                  : r.year_from === r.year_to
                    ? `${r.year_from} г.`
                    : `${r.year_from}–${r.year_to} гг.`
              return (
                <div class="lcard">
                  <CloseBtn onClick={() => setRcard(null)} />
                  <h3>
                    {placeName.get(r.from)} → {placeName.get(r.to)}
                  </h3>
                  <div class="meta">
                    {KIND_META[r.kind].name} <span class={`badge ${r.confidence}`}>{CONF[r.confidence]}</span>
                  </div>
                  <p>{r.what}</p>
                  <dl>
                    {yrs && (
                      <>
                        <dt>Годы</dt>
                        <dd>{yrs}</dd>
                      </>
                    )}
                    {r.via && (
                      <>
                        <dt>Через</dt>
                        <dd>{r.via.map((v) => placeName.get(v)).join(', ')}</dd>
                      </>
                    )}
                    <dt>Линия</dt>
                    <dd>
                      {
                        {
                          road: 'по дорогам карты',
                          river: 'по руслу реки',
                          sea: 'по воде (расчётная дуга)',
                          mixed: 'по дорогам и воде',
                          straight: 'прямая (пути в данных нет), пунктир',
                        }[r.geom]
                      }
                    </dd>
                  </dl>
                  <div class="links">
                    {r.sources.slice(0, 6).map((s) => (
                      <a href={wikiUrl(s)} target="_blank" rel="noreferrer">
                        {s}
                      </a>
                    ))}
                  </div>
                </div>
              )
            })()}
          {acard &&
            !card &&
            !rcard &&
            (() => {
              const c = cells.find((x) => x.id === acard)
              if (!c) return null
              return (
                <div class="lcard">
                  <CloseBtn onClick={() => setAcard(null)} />
                  <h3>{c.name}</h3>
                  <div class="meta">ячейка 1006 · {c.id}</div>
                  {areaKeys.map((k) => {
                    const r = resolveCell(areasFile, k, c),
                      lay = built.layers.find((l) => AREA_LAYER_IDS[l.id] === k)!
                    const rows = k === 'guild' ? r.guilds : [...(r.main ? [r.main] : []), ...r.others]
                    return (
                      <div class="acl">
                        <b>{lay.name}</b>
                        {!rows.length && <p class="approx">нет данных в источниках</p>}
                        {rows.map((a, i) => (
                          <p>
                            <i class="sw" style={{ background: areasFile.values[k][a.value]?.color ?? '#999' }} />{' '}
                            <b>{a.value}</b>
                            {k !== 'guild' && (i === 0 && r.main ? ' · основное' : ' · также')}{' '}
                            <span class={`badge ${a.confidence}`}>{CONF[a.confidence]}</span>
                            {a.text && (
                              <>
                                <br />
                                {a.text}
                              </>
                            )}
                            <span class="links">
                              {a.sources.slice(0, 4).map((s) => (
                                <a href={wikiUrl(s)} target="_blank" rel="noreferrer">
                                  {s}
                                </a>
                              ))}
                            </span>
                          </p>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          {card && (
            <div class="lcard">
              <CloseBtn onClick={() => setSel([])} />
              {sel.length > 1 && (
                <div class="pager">
                  <button onClick={() => setSi((si + sel.length - 1) % sel.length)}>‹</button> {si + 1} из {sel.length}{' '}
                  <button onClick={() => setSi((si + 1) % sel.length)}>›</button>
                </div>
              )}
              <h3>{card.name}</h3>
              <div class="meta">
                {layerName(card.layer)} · {card.cat}{' '}
                <span class={`badge ${card.confidence}`} title="степень достоверности">
                  {CONF[card.confidence]}
                </span>
              </div>
              {card.text && <p>{card.text}</p>}
              {card.meta.length > 0 && (
                <dl>
                  {card.meta.map(([k, v]) => (
                    <>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </>
                  ))}
                </dl>
              )}
              {card.approx && <p class="approx">{card.why}</p>}
              <div class="links">
                {card.sources.slice(0, 8).map((s) =>
                  s.startsWith('map:') ? (
                    <span>{s}</span>
                  ) : (
                    <a href={wikiUrl(s)} target="_blank" rel="noreferrer">
                      {s}
                    </a>
                  ),
                )}
              </div>
            </div>
          )}
        </>,
        dossierSlot(),
      )}
    </>
  )
}
