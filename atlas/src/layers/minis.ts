// «Миниатюры мира»: фишки на карте по году; разведение нескольких фишек на одной точке и у городов.
import type { ExpressionSpecification, GeoJSONSource, Map } from 'maplibre-gl'
import { pxToLngLat } from '../geo/pixel'
import { loadData } from '../data/load'
import { warn } from '../lib/log'
import { restartLoop } from './animation'
import { ensureModelImg } from './modelImage'
import { loadSvg } from './icons'
import { built } from './registry'

/** Миниатюры мира на год: только объекты, верные по лору в этот год. */
export function miniVisible(m: { from: number | null; to: number | null }, year: number) {
  return (m.from === null || year >= m.from) && (m.to === null || year < m.to)
}
export function setMinis(map: Map, on: boolean, year: number) {
  const vis = on ? built.minis.filter((m) => miniVisible(m, year)) : []
  if (vis.some((m) => !ensureModelImg(map, `m|${m.icon}|n|-`, restartLoop))) {
    Promise.all(vis.map((m) => loadSvg(m.icon)))
      .then(() => setMinis(map, on, year))
      .catch((e) => warn('minis: значки', e))
    return
  }
  const offs = miniOffsets(vis),
    mzs = miniDeclutter(vis)
  const feats = on
    ? vis.map((m) => ({
        type: 'Feature' as const,
        properties: {
          icon: `m|${m.icon}|n|-`,
          id: m.id,
          name: m.name,
          from: m.from,
          ...(offs.get(m.id) ? { ok: offs.get(m.id)!.join('|') } : {}),
          ...(mzs.get(m.id) ? { mz: mzs.get(m.id) } : {}),
        },
        geometry: { type: 'Point' as const, coordinates: pxToLngLat([m.x + (m.dx ?? 0), m.y + (m.dy ?? 0)]) },
      }))
    : []
  // смещение — выражением по ключу «x|y»: массив в свойстве GeoJSON приходит строкой, и MapLibre предупреждает об ошибке типа
  const keys = [...new Set([...offs.values()].map((o) => o.join('|')))]
  if (map.getLayer('models-mini'))
    map.setLayoutProperty(
      'models-mini',
      'icon-offset',
      keys.length
        ? ([
            'match',
            ['get', 'ok'],
            ...keys.flatMap((k) => [k, ['literal', k.split('|').map(Number)]]),
            ['literal', [0, 0]],
          ] as unknown as ExpressionSpecification) // длина «match» переменная — типы MapLibre её не выражают
        : [0, 0],
    )
  ;(map.getSource('models-mini') as GeoJSONSource)?.setData({ type: 'FeatureCollection', features: feats })
}

// --- Разведение миниатюр на одной координате: по кругу со смещением 14 px экрана (в группе из ≥2 или на точке города).
const RING_PX = 14,
  NEAR = 24 // NEAR — «одна координата» в пикселях карты
let townPts: { x: number; y: number }[] = []
loadData<{ kind: string; x?: number; y?: number }[]>('places')
  .then((ps) => {
    townPts = ps
      .filter((p) => ['capital', 'city', 'port', 'village'].includes(p.kind) && p.x !== undefined)
      .map((p) => ({ x: p.x!, y: p.y! }))
  })
  .catch((e) => warn('minis: места', e))
/** Не больше 2 фишек у одного города до z4 (остальные — с z4); легионы на одной точке — одна фишка (прочие скрыты, они видны в слое «Легионы»). Значение — мин. зум (99 — скрыта). */
export function miniDeclutter(
  list: { id: string; icon?: string; x: number; y: number }[],
): globalThis.Map<string, number> {
  const out = new globalThis.Map<string, number>(),
    cnt = new globalThis.Map<number, number>(),
    legs = new Set<string>()
  const ord = [...list].sort((a, b) => Number(a.icon === 'legion') - Number(b.icon === 'legion'))
  for (const m of ord) {
    if (m.icon === 'legion') {
      const k = `${Math.round(m.x / 24)}|${Math.round(m.y / 24)}`
      if (legs.has(k)) {
        out.set(m.id, 99)
        continue
      }
      legs.add(k)
    }
    const ti = townPts.findIndex((t) => Math.hypot(t.x - m.x, t.y - m.y) < 150)
    if (ti < 0) continue
    const n = cnt.get(ti) ?? 0
    cnt.set(ti, n + 1)
    if (n >= 2) out.set(m.id, 4)
  }
  return out
}
export function miniOffsets(
  list: { id: string; x: number; y: number; dx?: number; dy?: number }[],
): globalThis.Map<string, [number, number]> {
  const out = new globalThis.Map<string, [number, number]>(),
    used = new Set<string>()
  const at = (m: (typeof list)[number]) => ({ x: m.x + (m.dx ?? 0), y: m.y + (m.dy ?? 0) })
  for (const a of list) {
    if (used.has(a.id)) continue
    const pa = at(a),
      grp = list.filter((b) => !used.has(b.id) && Math.hypot(at(b).x - pa.x, at(b).y - pa.y) < NEAR)
    grp.forEach((b) => used.add(b.id))
    const town = townPts.some((t) => Math.hypot(t.x - pa.x, t.y - pa.y) < NEAR)
    if (grp.length < 2 && !town) continue
    const n = grp.length + (town ? 1 : 0) // в кольце остаётся место для самого города
    grp.forEach((b, i) => {
      const ang = -Math.PI / 2 + ((i + (town ? 1 : 0)) * 2 * Math.PI) / n
      out.set(b.id, [Math.round(Math.cos(ang) * RING_PX * 10) / 10, Math.round(Math.sin(ang) * RING_PX * 10) / 10])
    })
  }
  return out
}
