// Синхронизация состояния с хешем адресной строки: вид карты (cx, cy, z), подложка (m), год (y), слои (l).
// Хеш → состояние: ручная правка адреса двигает карту, год и подложку. Состояние → хеш: год и камера.
import type { Map } from 'maplibre-gl'
import { useEffect, useRef } from 'preact/hooks'
import { clampYear } from '../chronicle/yearFormat'
import { lngLatToPx, pxToLngLat } from '../geo/pixel'
import { formatHash, hashParams, parseHash, readYear, withYear, type Mode } from '../hash'
import { HISTORY_LAYERS } from '../layers/layerHash'
import { built } from '../layers/registry'
import { emit } from '../lib/bus'

/** Хеш камеры переписывается не чаще раза в это время (хвостовой вызов сохраняется). */
export const HASH_WRITE_MS = 250
/** Пауза перед приведением битого хеша к реальному состоянию. */
export const HASH_NORMALIZE_MS = 400
/** Допуск расхождения хеша и камеры: чтобы не зациклиться с записью хеша. */
const ZOOM_EPS = 0.03
const CENTER_EPS_PX = 3

const mapCenterPx = (map: Map) => lngLatToPx(map.getCenter().toArray() as [number, number])

/** Хеш с реальным видом, подложкой и годом; неизвестные id слоёв отброшены. */
function normalizedHash(map: Map, h: string, year: number, mode: Mode): string {
  let out = withYear(
    formatHash({ center: mapCenterPx(map), zoom: map.getZoom(), mode }, h),
    clampYear(readYear(h) ?? year),
  )
  if (hashParams(out).has('l')) {
    const known = new Set<string>([...built.layers.map((l) => l.id), ...HISTORY_LAYERS, 'none'])
    const ids = (hashParams(out).get('l') ?? '').split(',').filter((x) => known.has(x.split(':')[0]))
    out = out.replace(/([#&])l=[^&]*/, `$1l=${ids.length ? ids.join(',') : 'none'}`)
  }
  return out
}

export function useHashSync(
  map: Map,
  year: number,
  setYear: (y: number) => void,
  mode: Mode,
  setMode: (m: Mode) => void,
) {
  const live = useRef({ year, mode, setYear, setMode })
  live.current = { year, mode, setYear, setMode }

  // Подписки на hashchange и запись камеры; состояние читают через ref, поэтому подписываемся один раз.
  useEffect(() => {
    let normTimer = 0
    const normalize = () => {
      const h = location.hash,
        out = normalizedHash(map, h, live.current.year, live.current.mode)
      if (out !== h) history.replaceState(null, '', out)
    }
    const onHashChange = () => {
      const { year: cur, mode: curMode } = live.current
      const y = readYear(location.hash)
      if (y !== null && clampYear(y) !== cur) live.current.setYear(clampYear(y))
      const m = hashParams().get('m') // подложка из нового адреса (без тоста: это не побочный эффект набора)
      if ((m === 'drawn' || m === 'muted') && m !== curMode) live.current.setMode(m)
      // ручная правка cx/cy/z в адресной строке двигает карту
      const p = hashParams()
      if (p.has('cx') && p.has('cy') && p.has('z')) {
        const v = parseHash(location.hash),
          c = mapCenterPx(map)
        if (
          Math.abs(v.zoom - map.getZoom()) > ZOOM_EPS ||
          Math.hypot(v.center[0] - c[0], v.center[1] - c[1]) > CENTER_EPS_PX
        ) {
          map.jumpTo({ center: pxToLngLat(v.center), zoom: v.zoom })
        }
      }
      clearTimeout(normTimer)
      normTimer = window.setTimeout(normalize, HASH_NORMALIZE_MS)
    }
    normTimer = window.setTimeout(normalize, HASH_NORMALIZE_MS)
    addEventListener('hashchange', onHashChange)
    return () => {
      clearTimeout(normTimer)
      removeEventListener('hashchange', onHashChange)
    }
  }, [map])

  // Год — в хеше (y=…); остальные панели узнают о смене по событию year (lib/bus).
  useEffect(() => {
    history.replaceState(history.state, '', withYear(location.hash, year))
    emit('year', year)
  }, [year])

  // Камера → хеш: не чаще раза в HASH_WRITE_MS; смена подложки переписывает хеш сразу.
  const write = useRef<() => void>(() => {})
  useEffect(() => {
    let timer = 0,
      last = 0
    const doWrite = () => {
      last = performance.now()
      timer = 0
      history.replaceState(
        null,
        '',
        formatHash({ center: mapCenterPx(map), zoom: map.getZoom(), mode: live.current.mode }),
      )
    }
    const onEnd = () => {
      const wait = HASH_WRITE_MS - (performance.now() - last)
      if (timer) return
      if (wait <= 0) doWrite()
      else timer = window.setTimeout(doWrite, wait)
    }
    write.current = doWrite
    map.on('moveend', onEnd)
    return () => {
      map.off('moveend', onEnd)
      clearTimeout(timer)
    }
  }, [map])
  useEffect(() => write.current(), [mode])
}
