// Миниатюры мира: подсказка «название · с N г.» при наведении и карточка по клику (текст, достоверность, вики-ссылки, «К году начала»).
import { Popup, type Map, type MapMouseEvent } from 'maplibre-gl'
import { createHoverTip } from '../lib/tooltip'
import { loadData } from '../data/load'

const titles = await loadData<{ titles: Record<string, string> }>('wiki-titles')
import { built } from './registry'
import { wikiUrl, yearLabel } from '../events'
import { withYear } from '../hash'

const CONF = { canon: 'факт', derived: 'вывод', speculative: 'гипотеза' } as const
const wikiTitle = (s: string) => (titles as { titles: Record<string, string> }).titles[s] ?? null
const byId = () => new globalThis.Map(built.minis.map((m) => [m.id, m]))
let installed: Map | null = null

export function initMiniCard(map: Map) {
  if (installed === map) return
  installed = map
  let card: Popup | null = null
  const hit = (e: MapMouseEvent) => {
    const f = map.queryRenderedFeatures(e.point, { layers: ['models-mini'] })[0]
    return f ? byId().get(String(f.properties.id)) : undefined
  }
  const tip = createHoverTip(
    map,
    ['models-mini'],
    (_f, el, e) => {
      const m = hit(e)
      if (!m) return false
      el.textContent = m.name
      if (m.from !== null) {
        el.append(' · ')
        const s = document.createElement('small')
        s.textContent = `с ${yearLabel(m.from)} г.`
        el.append(s)
      }
    },
    { offset: 22, pointer: true },
  )
  map.on('click', 'models-mini', (e) => {
    const m = hit(e)
    if (!m) return
    tip.remove()
    card?.remove()
    const root = document.createElement('div')
    root.className = 'mini-card'
    const h = document.createElement('b')
    h.textContent = m.name
    const badge = document.createElement('span')
    badge.className = `badge ${m.confidence}`
    badge.textContent = CONF[m.confidence]
    badge.title =
      m.confidence === 'derived'
        ? 'следует из текста вики'
        : m.confidence === 'speculative'
          ? 'гипотеза: прямого указания в вики нет'
          : 'прямо сказано в вики'
    const p = document.createElement('p')
    p.textContent = m.text
    root.append(h, ' ', badge, p)
    if (m.confidence === 'derived') {
      const w = document.createElement('p')
      w.className = 'mc-note mc-why'
      w.textContent = `Почему «вывод»: ${m.why ?? 'прямого указания в вики нет, это следует из соседних сведений.'}`
      root.append(w)
    }
    if (m.approx) {
      const a = document.createElement('p')
      a.className = 'mc-note'
      a.textContent = 'Положение на карте приблизительное.'
      root.append(a)
    }
    const links = document.createElement('div')
    links.className = 'links'
    // «газеттира» читателю ничего не говорит: вместо служебных map:-источников — страницы вики о месте миниатюры
    const wiki = [...m.sources.filter((x) => !x.startsWith('map:')), ...(m.via ?? [])]
      .filter((x, i, a) => a.indexOf(x) === i)
      .slice(0, 3)
    const link = (s: string) => {
      const a = document.createElement('a')
      a.href = wikiUrl(s)
      a.target = '_blank'
      a.rel = 'noreferrer'
      a.textContent = wikiTitle(s) ?? s
      return a
    }
    if (wiki.length) {
      links.append('Источник: ')
      wiki.forEach((s, i) => {
        if (i) links.append(', ')
        links.append(link(s))
      })
    }
    root.append(links)
    if (wiki.length) {
      const o = document.createElement('a')
      o.className = 'mc-wiki'
      o.href = wikiUrl(wiki[0])
      o.target = '_blank'
      o.rel = 'noreferrer'
      o.textContent = 'Открыть в вики'
      root.append(o)
    }
    if (m.from !== null) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'mc-year'
      b.textContent = `Показать год появления (${yearLabel(m.from)} г.)`
      b.onclick = () => {
        location.hash = withYear(location.hash, m.from!)
        card?.remove()
      }
      root.append(b)
    }
    card = new Popup({ closeButton: true, closeOnClick: true, className: 'mini-pop', offset: 26, maxWidth: '320px' })
      .setLngLat((e.features![0].geometry as { coordinates: number[] }).coordinates as [number, number])
      .setDOMContent(root)
      .addTo(map)
  })
}
