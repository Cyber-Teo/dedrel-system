// Карточки досье: место, человек, организация. Только разметка; состояние и карта — в ui.tsx.
import { useState } from 'preact/hooks'
import { CONFIDENCE_RU, wikiUrl } from '../events'
import { KindIcon, orgKindRu } from './kinds'
import { cleanNote, type Cleaned } from './clean'
import { dash, isEmpty, placeFields, yearsText, type Section } from './card'
import { dateLine, evIconKey, evTypeText, personEvents, personRelations, placeChronicle } from './chronicle'
import { iconUrl } from '../layers/icons'
import { yearLabel, type Ev } from '../events'
import { daysText, kmText, nearby, routeHash, RADIUS_KM } from './nearby'
import { Coat, coatUrl } from '../history/coats'
import {
  capitalPolity,
  kindLabel,
  mergedInto,
  placeXY,
  placeTitle,
  sourceLabel,
  type Org,
  type Person,
  type Place,
} from './data'
import { emit } from '../lib/bus'

type ConfKey = 'canon' | 'derived' | 'speculative' | 'none'
export const Badge = ({ c }: { c?: string | null }) => {
  const k = (c && c in CONFIDENCE_RU ? c : 'none') as ConfKey
  return (
    <span class={`conf ${k}`} title={CONFIDENCE_RU[k].title}>
      {CONFIDENCE_RU[k].label}
    </span>
  )
}
const Txt = ({ c }: { c: Cleaned }) => (
  <>
    {c.text}
    {c.derived && (
      <>
        {' '}
        <Badge c="derived" />
      </>
    )}
    {c.notes.length > 0 && <small class="fn"> — {c.notes.join('; ')}</small>}
  </>
)
export const WikiTop = ({ slug }: { slug?: string }) =>
  slug ? (
    <a class="wiki-top" href={wikiUrl(slug)} target="_blank" rel="noreferrer">
      Открыть в вики ↗
    </a>
  ) : null

function Sections({ list }: { list: Section[] }) {
  // описание — связный текст: фрагменты с заглавной буквы, через точку
  const cap = (c: Cleaned): Cleaned => ({ ...c, text: c.text.charAt(0).toUpperCase() + c.text.slice(1) })
  const sentence = (c: Cleaned, last: boolean) => (
    <>
      <Txt c={cap(c)} />
      {!/[.!?…»)]$/.test(c.text) || (last && !/[.!?…]$/.test(c.text)) ? '.' : ''}
      {last ? '' : ' '}
    </>
  )
  return (
    <>
      {list.map((s) => (
        <>
          <h4>{s.title}</h4>
          {/^Описание/.test(s.title) ? (
            <p class="fld">{s.items.map((c, i) => sentence(c, i === s.items.length - 1))}</p>
          ) : (
            s.items.map((c) => (
              <p class="fld">
                <Txt c={c} />
              </p>
            ))
          )}
        </>
      ))}
    </>
  )
}
const NoData = ({ names }: { names: string[] }) =>
  names.length ? (
    <details class="nodata">
      <summary>Уточнить у автора ({names.length})</summary>
      <ul>
        {names.map((n) => (
          <li>{n}: —</li>
        ))}
      </ul>
    </details>
  ) : null

export function Sources({ list }: { list: string[] }) {
  const seen = new Set<string>(),
    items: { label: string; slug?: string }[] = []
  for (const s of list) {
    const l = sourceLabel(s)
    if (l && !seen.has(l.label)) {
      seen.add(l.label)
      items.push(l)
    }
  }
  if (!items.length) return null
  return (
    <details class="srcs">
      <summary>Источники ({items.length})</summary>
      <div class="links">
        {items.map((l) =>
          l.slug ? (
            <a href={wikiUrl(l.slug)} target="_blank" rel="noreferrer">
              {l.label}
            </a>
          ) : (
            <span>{l.label}</span>
          ),
        )}
      </div>
    </details>
  )
}

const Head = ({ icon, label, conf, coat }: { icon?: string; label: string; conf?: string; coat?: string | null }) => (
  <div class="khead">
    {coat ? <Coat id={coat} size={28} /> : <KindIcon k={icon} size={20} />}
    <span class="klabel">{label}</span>
    {conf && <Badge c={conf} />}
  </div>
)

/** До 3 км от города расстояние не показываем числом: «в городе» (для не-города — «рядом»). */
const TOWN_KM = 3
const NearRow = ({
  id,
  name,
  km,
  days,
  note,
  onPlace,
  town = true,
}: {
  id: string
  name: string
  km: number
  days?: number
  note?: string
  onPlace?: (id: string) => void
  town?: boolean
}) => (
  <li class="nrow">
    <a
      class="lk"
      role="button"
      tabIndex={0}
      onClick={() => onPlace?.(id)}
      onKeyDown={(k) => {
        if (k.key === 'Enter') onPlace?.(id)
      }}
    >
      {name}
    </a>
    <span class="meta">
      {km < TOWN_KM ? (town ? 'в городе' : 'рядом') : kmText(km)}
      {days !== undefined ? ` · ${daysText(days)}` : ''}
      {note ? ` · ${note}` : ''}
    </span>
  </li>
)
/** Гильдии: те, что в самом городе (<3 км), — одна сворачиваемая строка; дальние — списком. */
function GuildsNear({
  list,
  town,
  onPlace,
}: {
  list: { name: string; km: number; place: string }[]
  town: boolean
  onPlace?: (id: string) => void
}) {
  const inTown = list.filter((x) => x.km < TOWN_KM),
    far = list.filter((x) => x.km >= TOWN_KM).slice(0, 6)
  const ru = (n: number) =>
    `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'гильдия' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'гильдии' : 'гильдий'}`
  return (
    <>
      {inTown.length > 0 && (
        <details class="gtown">
          <summary>
            {ru(inTown.length)} {town ? 'в самом городе' : 'рядом'}
          </summary>
          <ul class="nlist">
            {inTown.map((x) => (
              <li class="nrow">
                <a
                  class="lk"
                  role="button"
                  tabIndex={0}
                  onClick={() => onPlace?.(x.place)}
                  onKeyDown={(k) => {
                    if (k.key === 'Enter') onPlace?.(x.place)
                  }}
                >
                  {x.name}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
      {far.length > 0 && (
        <ul class="nlist">
          {far.map((x) => (
            <NearRow id={x.place} name={x.name} km={x.km} town={town} onPlace={onPlace} />
          ))}
        </ul>
      )}
    </>
  )
}
/** «Маршрут сюда» и «Открыть в вики» одной строкой под заголовком; маршрут — только у места с координатами. */
const RouteBtn = ({ p }: { p: Place }) => (
  <button
    type="button"
    class="more route-here"
    onClick={() => {
      location.hash = routeHash(location.hash, p.id)
      emit('route-to', { place: p.id })
    }}
  >
    Маршрут сюда
  </button>
)
/** «В радиусе 100 км»: расстояния по прямой (KM_PER_PX), сутки — верхом (route/travel). */
function NearbyBlock({ p, onPlace }: { p: Place; onPlace?: (id: string) => void }) {
  const n = nearby(p),
    town = p.kind === 'city' || p.kind === 'capital' || p.kind === 'port'
  if (!n) return null
  const none = <p class="meta">нет</p>
  return (
    <section class="nearby">
      <h4>В радиусе {RADIUS_KM} км</h4>
      {n.places.length ? (
        <ul class="nlist">
          {n.places.slice(0, 8).map((x) => (
            <NearRow {...x} town={town} onPlace={onPlace} />
          ))}
        </ul>
      ) : (
        none
      )}
      <h5>Крепости и опасные зоны</h5>
      {n.fortresses.length + n.hazards.length ? (
        <ul class="nlist">
          {n.fortresses.slice(0, 5).map((x) => (
            <NearRow {...x} town={town} note="крепость" onPlace={onPlace} />
          ))}
          {n.hazards.map((x) => (
            <NearRow id={x.place} name={x.name} km={x.km} note={x.threat} town={town} onPlace={onPlace} />
          ))}
        </ul>
      ) : (
        none
      )}
      <h5>Гильдии рядом</h5>
      {n.guilds.length ? <GuildsNear list={n.guilds} town={town} onPlace={onPlace} /> : none}
    </section>
  )
}

const ChronRow = ({ e, onEvent }: { e: Ev; onEvent?: (e: Ev) => void }) => (
  <li>
    <span class="cy">{yearLabel(e.year!)}</span>
    <img
      class="evic"
      src={iconUrl(evIconKey(e))}
      alt={evTypeText(e)}
      title={evTypeText(e) || 'событие'}
      width="18"
      height="18"
    />
    <a
      class="lk ct"
      role="button"
      tabIndex={0}
      title={`${dateLine(e)} — открыть событие`}
      onClick={() => onEvent?.(e)}
      onKeyDown={(k) => {
        if (k.key === 'Enter') onEvent?.(e)
      }}
    >
      {e.title}
    </a>
  </li>
)
/** «Хроника места»: события, где место названо в places (та же склейка дублей, что на карте): 5 главных и «ещё N». Клик ставит год и открывает событие. */
function EventList({
  title,
  all,
  top,
  onEvent,
  cls,
}: {
  title: string
  all: Ev[]
  top: Ev[]
  onEvent?: (e: Ev) => void
  cls: string
}) {
  const [open, setOpen] = useState(false)
  if (!all.length) return null
  const rows = open ? all : top,
    rest = all.length - top.length
  return (
    <section class={cls}>
      <h4>{title}</h4>
      <ul>
        {rows.map((e) => (
          <ChronRow e={e} onEvent={onEvent} />
        ))}
      </ul>
      {rest > 0 && (
        <button type="button" class="more" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Свернуть' : `ещё ${rest}`}
        </button>
      )}
    </section>
  )
}
export const Chronicle = ({ placeId, onEvent }: { placeId: string; onEvent?: (e: Ev) => void }) => {
  const c = placeChronicle(placeId)
  return <EventList title="Хроника места" all={c.all} top={c.top} onEvent={onEvent} cls="chron" />
}

export function PlaceCard({
  p,
  onPlace,
  onEvent,
}: {
  p: Place
  onPlace?: (id: string) => void
  onEvent?: (e: Ev) => void
}) {
  const [open, setOpen] = useState(false)
  const dup = mergedInto(p.id)
  const label = kindLabel(p) || 'место'
  const xy = placeXY(p),
    hasXY = !!xy,
    routeP = p.x === undefined ? (dup.find((d) => typeof d.x === 'number') ?? p) : p
  const f = placeFields(p.hint, p.facts, dup.map((d) => d.facts ?? '').filter(Boolean), label)
  return (
    <div class="card scard">
      <Head
        icon={p.kind}
        label={label}
        conf={p.confidence}
        coat={p.kind === 'capital' ? ((id) => (id && coatUrl(id) ? id : null))(capitalPolity(p.id)) : null}
      />
      <h3>{placeTitle(p)}</h3>
      <div class="acts">
        <WikiTop slug={p.slug ?? dup.find((d) => d.slug)?.slug} />
        {hasXY && <RouteBtn p={routeP} />}
      </div>
      {p.parent_text && <div class="meta">{p.parent_text.replace(/\s+\/\s+/g, ' · ')}</div>}
      {!!p.aliases?.length && <p class="meta">Также: {p.aliases.join(', ')}</p>}
      {!hasXY && <small class="plate">Положение не указано</small>}
      <Sections list={f.shown} />
      {f.more.length > 0 &&
        (open ? (
          <>
            {f.plaques.length > 0 && (
              <div class="plaques">
                {f.plaques.map((t) => (
                  <span class="plq">{t}</span>
                ))}
              </div>
            )}
            <Sections list={f.more} />
            <button type="button" class="more" onClick={() => setOpen(false)}>
              Свернуть
            </button>
          </>
        ) : (
          <button type="button" class="more" aria-expanded="false" onClick={() => setOpen(true)}>
            Показать ещё
          </button>
        ))}
      <Chronicle placeId={p.id} onEvent={onEvent} />
      <NearbyBlock p={p.x === undefined ? (dup.find((d) => d.x !== undefined) ?? p) : p} onPlace={onPlace} />
      <NoData names={f.empty} />
      <Sources list={[...(p.sources ?? []), ...dup.flatMap((d) => d.sources ?? [])]} />
    </div>
  )
}

/** «Связи (n)», «События с участием» и «Показать в графе» для человека. */
function PersonLinks({
  p,
  onEvent,
  onPerson,
}: {
  p: Person
  onEvent?: (e: Ev) => void
  onPerson?: (id: string) => void
}) {
  const rels = personRelations(p.id),
    evs = personEvents(p)
  return (
    <>
      {rels.length > 0 && (
        <section class="rels">
          <h4>Связи ({rels.length})</h4>
          <ul class="nlist">
            {rels.map((r) => (
              <li>
                <a
                  class="lk"
                  role="button"
                  tabIndex={0}
                  onClick={() => onPerson?.(r.other.id)}
                  onKeyDown={(k) => {
                    if (k.key === 'Enter') onPerson?.(r.other.id)
                  }}
                >
                  {r.other.name}
                </a>{' '}
                <span class="meta">
                  {r.type}
                  {r.note ? ` · ${cleanNote(r.note).text}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <EventList title="События с участием" all={evs} top={evs.slice(0, 5)} onEvent={onEvent} cls="chron pevs" />
      {rels.length > 0 && (
        <button type="button" class="more pgraph" onClick={() => emit('graph-focus', { id: p.id })}>
          Показать в графе
        </button>
      )}
    </>
  )
}

const field = (v?: string) => (isEmpty(v) ? null : cleanNote(dash(v!)))

/** Подпись типа человека по роли и принадлежности (в «кавычках» — названия заведений, их не учитываем). */
export function personKind(p: { role?: string; affiliation?: string }): string {
  const role = (p.role ?? '').replace(/«[^»]*»/g, '').toLowerCase(),
    aff = (p.affiliation ?? '').toLowerCase().trim()
  if (/демон/.test(role) || aff === 'демоны') return 'Демон'
  if (/дракон/.test(role)) return 'Дракон'
  if (/эльф/.test(role)) return 'Эльф'
  if (/(^|[\s,])фе(я|и|й)(\s|,|$)/.test(role)) return 'Фея'
  return 'Человек'
}

export function PersonCard({
  p,
  pl,
  onPlace,
  onEvent,
  onPerson,
}: {
  p: Person & { confidence?: string; sources?: string[] }
  pl?: Place
  onPlace: () => void
  onEvent?: (e: Ev) => void
  onPerson?: (id: string) => void
}) {
  const role = field(p.role),
    aff = field(p.affiliation),
    where = field(p.based_in),
    notable = field(p.notable),
    yrs = yearsText(p.years)
  const empty = [
    !aff && 'Принадлежность',
    !where && 'Где живёт',
    !notable && 'Чем известен',
    !yrs && 'Годы жизни',
  ].filter(Boolean) as string[]
  return (
    <div class="card scard">
      <Head icon="person" label={personKind(p)} conf={p.confidence} />
      <h3>{p.name}</h3>
      <WikiTop slug={p.slug} />
      <div class="meta">
        {role && <Txt c={role} />}
        {role && yrs ? ' · ' : ''}
        {yrs}
      </div>
      {aff && (
        <>
          <h4>Принадлежность</h4>
          <p class="fld">
            <Txt c={aff} />
          </p>
        </>
      )}
      {where && (
        <>
          <h4>Где</h4>
          <p class="fld">
            <Txt c={where} />
            {pl && (
              <>
                {' '}
                ·{' '}
                <a class="lk" onClick={onPlace}>
                  {placeTitle(pl)} на карте
                </a>
              </>
            )}
          </p>
        </>
      )}
      {notable && (
        <>
          <h4>Чем известен</h4>
          <p class="fld">
            <Txt c={notable} />
          </p>
        </>
      )}
      {!!p.aliases?.length && <p class="meta">Также: {p.aliases.join(', ')}</p>}
      <PersonLinks p={p} onEvent={onEvent} onPerson={onPerson} />
      <NoData names={empty} />
      <Sources list={p.sources ?? []} />
    </div>
  )
}

export function OrgCard({
  o,
  pl,
  onPlace,
}: {
  o: Org & { confidence?: string; sources?: string[] }
  pl?: Place
  onPlace: () => void
}) {
  const leader = field(o.leader),
    hq = field(o.hq),
    pres = field(o.presence),
    infl = field(o.influence)
  const empty = [!leader && 'Глава', !hq && 'Штаб', !pres && 'Присутствие', !infl && 'Влияние'].filter(
    Boolean,
  ) as string[]
  return (
    <div class="card scard">
      <Head icon="org" label={orgKindRu(o.kind) || 'Организация'} conf={o.confidence} />
      <h3>{o.name}</h3>
      <WikiTop slug={o.slug} />
      {leader && (
        <>
          <h4>Глава</h4>
          <p class="fld">
            <Txt c={leader} />
          </p>
        </>
      )}
      {hq && (
        <>
          <h4>Штаб</h4>
          <p class="fld">
            <Txt c={hq} />
            {pl && (
              <>
                {' '}
                ·{' '}
                <a class="lk" onClick={onPlace}>
                  {placeTitle(pl)} на карте
                </a>
              </>
            )}
          </p>
        </>
      )}
      {pres && (
        <>
          <h4>Присутствие</h4>
          <p class="fld">
            <Txt c={pres} />
          </p>
        </>
      )}
      {infl && (
        <>
          <h4>Влияние</h4>
          <p class="fld">
            <Txt c={infl} />
          </p>
        </>
      )}
      <NoData names={empty} />
      <Sources list={o.sources ?? []} />
    </div>
  )
}
