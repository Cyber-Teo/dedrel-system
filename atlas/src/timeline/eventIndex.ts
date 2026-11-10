// Индексы событий для шкалы времени: считаются один раз при загрузке хроники.
import { EVENT_GROUPS, events, groupOfType, lngLatOf, places, type Ev } from '../events'

/** Годы событий по возрастанию (с повторами: по штриху на событие). */
export const EV_YEARS: number[] = events.map((e) => e.year!).sort((a, b) => a - b)

/** Название первого события года — для aria-valuetext ползунка. */
export const EV_AT = new Map<number, string>()
for (const e of events) if (!EV_AT.has(e.year!)) EV_AT.set(e.year!, e.title)

/** Годы, в которых есть события мастера (слухи). */
export const MASTER_YEARS = new Set(events.filter((e) => e.master).map((e) => e.year!))

const groupOrder = (id: string) => EVENT_GROUPS.findIndex((g) => g.id === id)

/** Цвет штриха года — цвет самой частой группы событий; при равенстве побеждает группа, стоящая раньше в EVENT_GROUPS. */
export const YEAR_COLOR: Map<number, string> = (() => {
  const counts = new Map<number, Map<string, number>>()
  for (const e of events) {
    const byGroup = counts.get(e.year!) ?? new Map<string, number>()
    counts.set(e.year!, byGroup)
    const g = groupOfType(e.type).id
    byGroup.set(g, (byGroup.get(g) ?? 0) + 1)
  }
  const colors = new Map<number, string>()
  for (const [year, byGroup] of counts) {
    const [top] = [...byGroup].sort((a, b) => b[1] - a[1] || groupOrder(a[0]) - groupOrder(b[0]))[0]
    colors.set(year, EVENT_GROUPS[groupOrder(top)].color)
  }
  return colors
})()

/** Событие рисуется на карте, если у него есть точечное место с координатами (метка страны и «маркер карты» не считаются — то же правило, что в layers/eventsMap.ts). */
export const onMapPoint = (e: Ev) => e.places.some((p) => !/marker_karty|\/index$/.test(p) && lngLatOf(places.get(p)))

/** «1 событие / 2 события / 5 событий». */
export const pluralEvents = (n: number) => {
  if (n % 10 === 1 && n % 100 !== 11) return 'событие'
  return [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'события' : 'событий'
}
