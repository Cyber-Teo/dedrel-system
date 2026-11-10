// События в окне лет вокруг выбранного года: что на карте, что без координат, что относится к мастеру.
import { useMemo } from 'preact/hooks'
import { events, hasCoords, inWindow } from '../events'

/** Всего событий с координатами: публичные и мастерские отдельно (знаменатели счётчиков слоя). */
export const eventTotals = {
  public: events.filter((e) => !e.master && hasCoords(e)).length,
  master: events.filter((e) => e.master && hasCoords(e)).length,
}

export function useEventWindow(year: number, win: number, master: boolean) {
  return useMemo(() => {
    const all = inWindow(year, win)
    const near = all.filter((e) => !e.master)
    const nearMaster = all.filter((e) => e.master)
    const listed = master ? all : near
    return {
      near,
      nearMaster,
      listed,
      noXY: listed.filter((e) => !hasCoords(e)),
      onMap: near.filter(hasCoords).length,
      rumOnMap: nearMaster.filter(hasCoords).length,
    }
  }, [year, win, master])
}
