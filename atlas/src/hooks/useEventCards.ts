// Карточки событий: выбор на карте, точки слоя «События», сводная карточка слоя. Всё держится одной панелью досье.
import type { GeoJSONSource, Map, MapMouseEvent } from 'maplibre-gl'
import { useEffect, useState } from 'preact/hooks'
import { useDossier } from '../dossier'
import { events, lngLatOf, places, type Ev } from '../events'
import { eventIdsAt } from '../layers/eventsMap'

type Window = { near: Ev[]; nearMaster: Ev[] }
type Opts = { map: Map; year: number; win: number; evOn: boolean; rumOn: boolean; toolActive: boolean } & Window

export function useEventCards({ map, year, win, evOn, rumOn, toolActive, near, nearMaster }: Opts) {
  const [sel, setSel] = useState<Ev[]>([])
  const [si, setSi] = useState(0)
  const [layerCard, setLayerCard] = useState(false)
  const card = sel[si]

  const reset = () => {
    setSel([])
    setLayerCard(false)
  }
  useDossier('events', !!card || layerCard, reset, `${card?.id}|${layerCard}`)
  useEffect(() => {
    if (!evOn && !rumOn) reset()
  }, [evOn, rumOn])

  // Точки слоя на карте; выбранное событие подсвечено.
  useEffect(() => {
    const features = [...(evOn ? near : []), ...(rumOn ? nearMaster : [])].flatMap((e) =>
      e.places.flatMap((id) => {
        const ll = lngLatOf(places.get(id))
        return ll
          ? [
              {
                type: 'Feature' as const,
                properties: { id: e.id, sel: card?.id === e.id, master: !!e.master },
                geometry: { type: 'Point' as const, coordinates: ll },
              },
            ]
          : []
      }),
    )
    ;(map.getSource('events') as GeoJSONSource).setData({ type: 'FeatureCollection', features })
  }, [year, win, card?.id, evOn, rumOn, near, nearMaster])

  // Клик по точке открывает карточки; пока активен инструмент карты, клики карточек не открывают.
  useEffect(() => {
    const onClick = async (e: MapMouseEvent) => {
      if (toolActive) return
      // состав карточек = состав бейджа кластера, по близости к выбранному году (src/layers/eventsMap.ts)
      const hit = map.queryRenderedFeatures(e.point, { layers: ['events-pts'] }).map((f) => f.properties.id as string)
      const ids = await eventIdsAt(map, e.point, [...new Set<string>(hit)])
      if (!ids.length) return
      setLayerCard(false)
      setSel(ids.map((id) => events.find((x) => x.id === id)!).filter(Boolean))
      setSi(0)
    }
    const cursor = (value: string) => () => {
      map.getCanvas().style.cursor = toolActive ? 'crosshair' : value
    }
    const enter = cursor('pointer'),
      leave = cursor('')
    map.on('click', onClick)
    map.on('mouseenter', 'events-pts', enter)
    map.on('mouseleave', 'events-pts', leave)
    return () => {
      map.off('click', onClick)
      map.off('mouseenter', 'events-pts', enter)
      map.off('mouseleave', 'events-pts', leave)
    }
  }, [toolActive])

  return {
    sel,
    si,
    setSi,
    card,
    layerCard,
    closeLayerCard: () => setLayerCard(false),
    closeCards: () => setSel([]),
    /** Выбор из сводной карточки слоя: она остаётся под карточкой события и возвращается после её закрытия. */
    pickFromLayerCard: (e: Ev) => {
      setSel([e])
      setSi(0)
    },
    openEvent: (e: Ev) => {
      setSel([e])
      setSi(0)
      setLayerCard(false)
    },
    openLayerCard: () => {
      setSel([])
      setLayerCard(true)
    },
  }
}
