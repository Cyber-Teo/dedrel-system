// Карточка события: заголовок, год (без повтора «1006 г. · 1006 г.»), кликабельные места, источники по названиям страниц.
import { places, wikiUrl, type Ev } from '../events'
import { sourceLabel } from './data'
import { cleanNote } from './clean'
import { dateLine, evIconKey, evTypeText, monthDated, scenarioOf, titleNoDate } from './chronicle'
import { iconUrl } from '../layers/icons'
import { Badge } from './cards'
import { KindIcon } from './kinds'
import { emit } from '../lib/bus'
import { CloseBtn } from '../ui/CloseBtn'

/** Тип страницы-источника для значка чипа: государство, эпоха, место. */
const relKind = (slug?: string) =>
  !slug
    ? 'other'
    : /^history\/era/.test(slug)
      ? 'era'
      : /\/(cities|regions)\/|^geography\//.test(slug)
        ? 'city'
        : /^countries\/[^/]+(\/index)?$/.test(slug)
          ? 'polity'
          : 'other'

/** date_text, который лишь повторяет год события («1006 г.», «≈1006»), скрываем. */
export function dateTextShown(year: number, dt?: string): string | null {
  if (!dt) return null
  const m = /^(?:около\s+|[≈~]\s*)?([-−–])?\s*(\d{1,4})\s*(?:г\.?|год[а]?)?$/u.exec(dt.trim())
  if (m && (m[1] ? -Number(m[2]) : Number(m[2])) === year) return null
  return dt
}

export const flyToPlace = (id: string) => emit('flyto', { place: id })

export function EventCard({
  sel,
  si,
  setSi,
  close,
  back,
}: {
  sel: Ev[]
  si: number
  setSi: (i: number) => void
  close: () => void
  back?: () => void
}) {
  const card = sel[si]
  const dt = monthDated(card) ? null : dateTextShown(card.year!, card.date_text),
    type = evTypeText(card),
    sc = scenarioOf(card)
  const title = titleNoDate(card.title, card.year!)
  const srcs = [
    ...new Map(
      card.sources
        .map((s) => sourceLabel(s))
        .filter((x): x is NonNullable<typeof x> => !!x)
        .map((x) => [x.label, x]),
    ).values(),
  ]
  // одно и то же имя («Виларин» столица и город) — одна ссылка
  const placeRows = [
    ...new Map(
      card.places.map((id) => [places.get(id)?.name.replace(/\s*\(город\)$/, '') ?? id, id] as [string, string]),
    ).entries(),
  ]
  return (
    <div class="card evcard">
      <CloseBtn onClick={close} />
      {back && (
        <button class="back" onClick={back}>
          ‹ к слою «События»
        </button>
      )}
      {sel.length > 1 && (
        <div class="pager">
          <button onClick={() => setSi((si + sel.length - 1) % sel.length)} aria-label="Предыдущее событие">
            ‹
          </button>
          <span>
            {si + 1} из {sel.length}
          </span>
          <button onClick={() => setSi((si + 1) % sel.length)} aria-label="Следующее событие">
            ›
          </button>
        </div>
      )}
      <h3>
        {title}
        {card.master && <em class="tag-master">мастер</em>}
      </h3>
      <div class="meta evmeta">
        <img class="evic" src={iconUrl(evIconKey(card))} alt="" width="18" height="18" />
        {dateLine(card)}
        {type ? ` · ${type}` : ''}
        {dt ? ` · ${dt}` : ''} <Badge c={card.derived ? 'derived' : (card as { confidence?: string }).confidence} />
      </div>
      {sc && (
        <button type="button" class="more ev-sc" onClick={() => emit('open-scenario', { id: sc.id })}>
          Сценарий: {sc.title} ({sc.steps.length}{' '}
          {sc.steps.length % 10 === 1 && sc.steps.length % 100 !== 11
            ? 'шаг'
            : sc.steps.length % 10 >= 2 &&
                sc.steps.length % 10 <= 4 &&
                (sc.steps.length % 100 < 12 || sc.steps.length % 100 > 14)
              ? 'шага'
              : 'шагов'}
          )
        </button>
      )}
      {card.notes && (
        <ul class="fn">
          {card.notes.map((n) => (
            <li>{n}</li>
          ))}
        </ul>
      )}
      {card.description && <p>{card.description}</p>}
      {placeRows.length > 0 && (
        <p>
          <b>Места:</b>{' '}
          {placeRows.map(([name, id], i) => (
            <>
              {i > 0 && ', '}
              <a
                class="lk"
                role="button"
                tabIndex={0}
                title="Показать на карте"
                onClick={() => flyToPlace(id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') flyToPlace(id)
                }}
              >
                {name}
              </a>
            </>
          ))}
        </p>
      )}
      {card.alt && card.alt.length > 0 && (
        <div class="alt">
          <b>Другие версии</b>
          {card.alt.map((a) => (
            <p>{cleanNote(a.text).text}</p>
          ))}
        </div>
      )}
      {srcs.length > 0 && (
        <div class="links evrel">
          <b>Связано:</b>
          {srcs.map((s) =>
            s.slug ? (
              <a class="chip" href={wikiUrl(s.slug)} target="_blank" rel="noreferrer">
                <KindIcon k={relKind(s.slug)} size={14} />
                {s.label}
              </a>
            ) : (
              <span class="chip">
                <KindIcon k="other" size={14} />
                {s.label}
              </span>
            ),
          )}
        </div>
      )}
    </div>
  )
}
