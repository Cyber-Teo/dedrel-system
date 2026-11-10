// Стрелка морского пути на карте и чип «Острова за краем карты»; сама врезка (SunnyInset) грузится только при открытии.
import { useEffect } from 'preact/hooks'
import { Marker, type GeoJSONSource, type Map } from 'maplibre-gl'
import { loadData } from '../data/load'
import { pxToLngLat, W } from '../geo/pixel'
import { places } from '../events'

const EDGE_X = W + 55
/** Разметка чипа «Острова за краем карты»: статичная иконка волны и подпись, данных пользователя в ней нет. */
const MARK_HTML =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 18c3 1.6 5 1.6 9 0s6-1.6 9 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M7 15c0-3 2-5 5-5s5 2 5 5z" fill="currentColor"/><path d="M12 10V4m0 0c-2 0-3.500 1-4 2.500M12 4c2 0 3.500 1 4 2.500" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><span class="sm-t">Острова за краем карты</span>'

export function useSeaRoute(map: Map, onClick: () => void) {
  useEffect(() => {
    let off = () => {},
      dead = false
    loadData<{ sea_route: { from: string[] } }>('geo/sunny-islands-inset').then((inset) => {
      if (!dead) off = mount(inset)
    })
    return () => {
      dead = true
      off()
    }
  }, [])
  const mount = (inset: { sea_route: { from: string[] } }) => {
    const ends = inset.sea_route.from
      .map((id) => places.get(id))
      .filter((p) => p && p.x !== undefined)
      .map((p) => [p!.x!, p!.y!] as [number, number])
    if (!ends.length) return () => {}
    const y = ends.reduce((s, p) => s + p[1], 0) / ends.length
    const lines = ends.map((p) => ({
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: [pxToLngLat(p), pxToLngLat([(p[0] + EDGE_X) / 2, (p[1] + y) / 2]), pxToLngLat([EDGE_X, y])],
      },
    }))
    const add = () => {
      if (!map.getSource('sunny-route')) {
        map.addSource('sunny-route', { type: 'geojson', data: { type: 'FeatureCollection', features: lines } })
        map.addLayer({
          id: 'sunny-route-casing',
          type: 'line',
          source: 'sunny-route',
          paint: { 'line-color': '#ffffff', 'line-width': 4, 'line-opacity': 0.8 },
        })
        map.addLayer({
          id: 'sunny-route',
          type: 'line',
          source: 'sunny-route',
          paint: { 'line-color': '#1f5fa8', 'line-width': 2, 'line-dasharray': [2, 1.5] },
        })
      } else (map.getSource('sunny-route') as GeoJSONSource).setData({ type: 'FeatureCollection', features: lines })
    }
    if (map.isStyleLoaded()) add()
    else map.once('load', add)
    // чип — обычная кнопка поверх карты (не маркер): всегда внутри экрана, ниже шапки; на узких экранах — круглая иконка с тултипом
    const el = document.createElement('button')
    el.className = 'sunny-mark'
    el.type = 'button'
    el.innerHTML = MARK_HTML
    el.title = 'Острова за краем карты: врезка с Солнечными островами, ≈4000 км к востоку'
    el.setAttribute('aria-label', el.title)
    el.onclick = onClick
    document.getElementById('ui')!.appendChild(el)
    // подпись стрелки у края карты
    const cap = document.createElement('div')
    cap.className = 'sunny-arrow-lbl'
    cap.textContent = 'Путь к островам за краем карты'
    cap.title = 'Морской путь к Солнечным островам: ≈4000 км к востоку, за краем карты'
    const mk = new Marker({ element: cap, anchor: 'top-left', offset: [-34, 10] })
      .setLngLat(pxToLngLat([EDGE_X, y]))
      .addTo(map)
    return () => {
      el.remove()
      mk.remove()
      for (const l of ['sunny-route', 'sunny-route-casing']) if (map.getLayer(l)) map.removeLayer(l)
      if (map.getSource('sunny-route')) map.removeSource('sunny-route')
    }
  }
}
