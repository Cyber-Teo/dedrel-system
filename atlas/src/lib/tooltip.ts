// Всплывающая подсказка при наведении на объекты слоёв карты: общая часть для событий и миниатюр мира.
import { Popup, type Map, type MapGeoJSONFeature, type MapMouseEvent, type PositionAnchor } from 'maplibre-gl'

export type HoverTipOptions = {
  className?: string
  offset?: number
  maxWidth?: string
  /** Курсор-рука, пока подсказка показана. */
  pointer?: boolean
  /** Якорь всплывашки в зависимости от места курсора (например, чтобы не уходить под панель). */
  anchor?: (e: MapMouseEvent) => PositionAnchor | undefined
}

/**
 * Подсказка над объектом под курсором. render наполняет контейнер содержимым;
 * вернёт false — объект не годится, подсказка скрывается.
 */
export function createHoverTip(
  map: Map,
  layerIds: string[],
  render: (feature: MapGeoJSONFeature, content: HTMLElement, e: MapMouseEvent) => boolean | void,
  opts: HoverTipOptions = {},
): Popup {
  const tip = new Popup({
    closeButton: false,
    closeOnClick: false,
    className: opts.className ?? 'ev-tip',
    offset: opts.offset ?? 14,
    maxWidth: opts.maxWidth ?? '340px',
  })
  const cursor = (v: string) => {
    if (opts.pointer) map.getCanvas().style.cursor = v
  }
  const hide = () => {
    tip.remove()
    cursor('')
  }
  const onMove = (e: MapMouseEvent) => {
    const layers = layerIds.filter((id) => map.getLayer(id))
    const f = map.queryRenderedFeatures(e.point, { layers })[0]
    if (!f || f.geometry.type !== 'Point') return hide()
    tip.options.anchor = opts.anchor?.(e)
    tip
      .setLngLat(f.geometry.coordinates as [number, number])
      .setHTML('')
      .addTo(map)
    const content = tip.getElement().querySelector<HTMLElement>('.maplibregl-popup-content')!
    content.textContent = ''
    if (render(f, content, e) === false) return hide()
    cursor('pointer')
  }
  for (const id of layerIds) {
    map.on('mousemove', id, onMove)
    map.on('mouseleave', id, hide)
  }
  return tip
}
