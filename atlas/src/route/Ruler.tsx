// Линейка: расстояние по прямой между кликами. Подсказки — в полосе #tool-bar над картой, длины сегментов — подписи на линии.
// После выключения линия остаётся плашкой «Измерение: N км ✕» (✕ убирает).
import { setFeatures, type Feat } from '../lib/coords'
import { Marker, type GeoJSONSource, type Map as MLMap } from 'maplibre-gl'
import { createPortal } from 'preact/compat'
import { useEffect, useRef, useState } from 'preact/hooks'
import { distanceKm, lngLatToPx, pxToLngLat, type Px } from '../geo/pixel'
import { activateTool, guardMap } from '../ui/activeTool'
import { ToolBtn } from '../ui/ToolBtn'
import { toolBar, toolGroup } from '../ui/toolGroup'
import { ToolChip } from './ToolChip'
import './route.css'

const ru = (n: number) => n.toFixed(1).replace('.', ',')
export const pathKm = (pts: Px[]) => pts.slice(1).reduce((s, p, i) => s + distanceKm(pts[i], p), 0)

export function Ruler({ map }: { map: MLMap }) {
  const [on, setOn] = useState(false)
  const [pts, setPts] = useState<Px[]>([])
  const marks = useRef<Marker[]>([])

  useEffect(() => {
    guardMap(map)
  }, [])
  useEffect(() => (on ? activateTool('ruler', 'Линейка', () => setOn(false)) : undefined), [on])
  useEffect(() => {
    if (!on) return
    const click = (e: { lngLat: { lng: number; lat: number } }) =>
      setPts((p) => [...p, lngLatToPx([e.lngLat.lng, e.lngLat.lat])])
    map.on('click', click)
    map.getCanvas().style.cursor = 'crosshair'
    return () => {
      map.off('click', click)
      map.getCanvas().style.cursor = ''
    }
  }, [on])

  useEffect(() => {
    const coords = pts.map(pxToLngLat)
    const features: Feat[] = coords.map((c) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: c },
    }))
    if (coords.length > 1)
      features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } })
    setFeatures(map.getSource('measure') as GeoJSONSource, features)
    // длины сегментов у линии
    marks.current.forEach((m) => m.remove())
    marks.current = []
    if (pts.length > 1)
      pts.slice(1).forEach((p, i) => {
        const el = document.createElement('div')
        el.className = 'seg-len'
        el.textContent = `${ru(distanceKm(pts[i], p))} км`
        marks.current.push(
          new Marker({ element: el })
            .setLngLat(pxToLngLat([(pts[i][0] + p[0]) / 2, (pts[i][1] + p[1]) / 2]))
            .addTo(map),
        )
      })
  }, [pts])

  const total = pathKm(pts)
  const straight = pts.length > 2 ? distanceKm(pts[0], pts[pts.length - 1]) : 0
  return (
    <>
      {createPortal(
        <ToolBtn
          n="ruler"
          title="Линейка: расстояние по прямой между кликами на карте"
          on={on}
          onClick={() => {
            if (!on) setPts([])
            setOn(!on)
          }}
        >
          Линейка
        </ToolBtn>,
        toolGroup('measure'),
      )}
      {createPortal(
        <>
          <ToolChip />
          {on && (
            <div class="measure tbar-item">
              <span id="measure-km">
                {pts.length < 2
                  ? `Кликайте по карте: точек ${pts.length}`
                  : `${ru(total)} км${pts.length > 2 ? ` · по прямой ${ru(straight)} км` : ''}`}
              </span>
              <button type="button" onClick={() => setPts((p) => p.slice(0, -1))} disabled={!pts.length}>
                Убрать точку
              </button>
              <button type="button" onClick={() => setPts([])} disabled={!pts.length}>
                Сбросить
              </button>
            </div>
          )}
          {!on && pts.length > 1 && (
            <button type="button" class="keep-pill" title="Убрать измерение" onClick={() => setPts([])}>
              Измерение: {ru(total)} км ✕
            </button>
          )}
        </>,
        toolBar(),
      )}
    </>
  )
}
