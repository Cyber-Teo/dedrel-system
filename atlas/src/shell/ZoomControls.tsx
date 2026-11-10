import { createPortal } from 'preact/compat'
import type { Map } from 'maplibre-gl'
import { MAX_ZOOM, pxToLngLat } from '../geo/pixel'
import { fitView, pad } from '../map/camera'
import { byId } from '../ui/dom'
import { Ic } from '../ui/uiIcons'

/** Допуск у верхней границы зума: кнопка «Приблизить» гаснет чуть раньше. */
const ZOOM_EDGE_EPS = 0.01
const ICON_PX = 20

export function ZoomControls({ map, zoom }: { map: Map; zoom: number }) {
  const fitAll = () => {
    const f = fitView()
    map.easeTo({ center: pxToLngLat(f.center), zoom: f.zoom, padding: pad() })
  }
  return createPortal(
    <>
      <button
        type="button"
        aria-label="Приблизить"
        title="Приблизить"
        disabled={zoom >= MAX_ZOOM - ZOOM_EDGE_EPS}
        onClick={() => map.zoomIn()}
      >
        <Ic n="plus" size={ICON_PX} />
      </button>
      <button type="button" aria-label="Отдалить" title="Отдалить" onClick={() => map.zoomOut()}>
        <Ic n="minus" size={ICON_PX} />
      </button>
      <button type="button" aria-label="Вся карта" title="Вся карта" onClick={fitAll}>
        <Ic n="fit" size={ICON_PX} />
      </button>
    </>,
    byId('zoomc'),
  )
}
