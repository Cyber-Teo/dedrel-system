// Загрузка хроники для показа на карте: только public-события, места с координатами.
import { loadData } from '../data/load'
import { pxToLngLat, type LngLat } from '../geo/pixel'
import { cleanNote } from '../search/clean'
import { dedupeEvents } from '../dedupe'
import { WIKI_ORIGIN } from '../config'
import type { Ev, Pl } from './types'

const [placesRaw, eventsRaw] = await Promise.all([loadData<Pl[]>('places'), loadData<Ev[]>('events')])
export const places = new Map<string, Pl>(placesRaw.map((p) => [p.id, p]))

/** Служебные пометки автора («(вывод: …)», «— расхождение») → признак derived и сноски notes (см. search/clean.ts). */
const tidy = (e: Ev): Ev => {
  const t = cleanNote(e.title),
    d = cleanNote(e.description),
    dt = cleanNote(e.date_text)
  const notes = [...t.notes, ...dt.notes, ...d.notes]
  return {
    ...e,
    title: t.text || e.title,
    description: d.text || undefined,
    date_text: dt.text || undefined,
    derived: t.derived || d.derived || dt.derived || undefined,
    notes: notes.length ? notes : undefined,
  }
}

export const events: Ev[] = dedupeEvents(
  eventsRaw
    .map((e) => tidy({ ...e, places: e.places ?? [] }))
    .filter((e) => e.visibility === 'public' && e.year != null),
)

export const lngLatOf = (p: Pl | undefined): LngLat | null =>
  p && p.x !== undefined && p.y !== undefined ? pxToLngLat([p.x, p.y]) : null

export function inWindow(year: number, win: number): Ev[] {
  return events.filter((e) => Math.abs(e.year! - year) <= win)
}

export const hasCoords = (e: Ev) => e.places.some((id) => lngLatOf(places.get(id)))

export const wikiUrl = (slug: string) => `${WIKI_ORIGIN}/${slug}`
