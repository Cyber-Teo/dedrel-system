import type { Map } from 'maplibre-gl'
import { useEffect, useState } from 'preact/hooks'

/** Текущий зум карты (обновляется при движении). */
export function useZoom(map: Map): number {
  const [zoom, setZoom] = useState(map.getZoom())
  useEffect(() => {
    const onMove = () => setZoom(map.getZoom())
    map.on('move', onMove)
    return () => {
      map.off('move', onMove)
    }
  }, [map])
  return zoom
}
