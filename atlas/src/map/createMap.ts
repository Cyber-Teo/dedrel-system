// Создание карты MapLibre: стиль, границы зума, стартовый вид, камера.
import { Map, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { MAX_ZOOM, MIN_ZOOM, pxToLngLat } from '../geo/pixel'
import type { View } from '../hash'
import { clampCenter, fitView, pad, respectReducedMotion, trackPanelPadding, trackUserMove } from './camera'
import { buildStyle } from './style'

/** Задержка перед удалением заставки после первой отрисовки: успевает отыграть CSS-переход. */
const BOOT_REMOVE_MS = 350

/** Карта в контейнере #map. hasView — стартовый вид задан хешем, иначе «вся карта». */
export function createMap(start: View, hasView: boolean): Map {
  setWorkerUrl(workerUrl)
  const fit = fitView()
  const map = new Map({
    container: 'map',
    style: buildStyle(start.mode),
    center: pxToLngLat(hasView ? start.center : fit.center),
    zoom: hasView ? start.zoom : fit.zoom,
    renderWorldCopies: false,
    // вместо maxBounds: на широком окне он не давал отдалить карту до полной высоты. Центр держим внутри карты.
    transformConstrain: (ll, z) => {
      const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))
      return { center: clampCenter(ll, zoom), zoom }
    },
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    hash: false,
    attributionControl: false,
  })
  map.getCanvas().setAttribute('aria-label', 'Карта мира Дедрела')
  trackUserMove(map, hasView)
  map.jumpTo({ padding: pad() }) // отступ сверху под шапку/чипы; getCenter() возвращает центр области внутри отступа
  trackPanelPadding(map)
  respectReducedMotion(map)
  map.once('load', () => {
    const boot = document.getElementById('boot')
    if (!boot) return
    boot.classList.add('gone')
    setTimeout(() => boot.remove(), BOOT_REMOVE_MS)
  })
  return map
}
