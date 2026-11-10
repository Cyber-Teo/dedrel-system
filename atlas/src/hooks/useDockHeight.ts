import type { Map } from 'maplibre-gl'
import { useEffect } from 'preact/hooks'
import { fitView, fitState } from '../map/camera'
import { pxToLngLat } from '../geo/pixel'
import { byId } from '../ui/dom'

/** Высота нижней линии (шкала времени) задаёт высоту карты: переменная --dock-h, пересчёт размера и стартового вида. */
export function useDockHeight(map: Map) {
  useEffect(() => {
    const dock = byId('dock')
    const ro = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--dock-h', `${dock.offsetHeight}px`)
      map.resize()
      if (fitState.pending) {
        const f = fitView()
        map.jumpTo({ center: pxToLngLat(f.center), zoom: f.zoom })
      }
    })
    ro.observe(dock)
    return () => ro.disconnect()
  }, [map])
}
