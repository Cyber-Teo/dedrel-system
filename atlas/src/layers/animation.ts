// Движение моделек: корабли и караваны бегут по путям, головы походов идут по ходу года; кадры ~2 в секунду и только пока модельки во вьюпорте.
import type { GeoJSONSource, Map } from 'maplibre-gl'
import { pxToLngLat } from '../geo/pixel'
import type { PointFeature } from '../lib/coords'
import { ensureModelImg } from './modelImage'
import { heading, inView, lines, posAt, routeById } from './modelLines'

export const FLAG_DEFAULT = '#8c1c13'
/** Доля ломаной, проходимая за миллисекунду на пути длиной 1000 px; на длинных путях медленнее. */
const ROUTE_SPEED = 0.00001
/** Пути короче этого (px карты) моделькам не нужны. */
const MIN_ROUTE_LEN_PX = 40
/** Пауза между кадрами при мелком зуме (мс): моделей много, видны мелко. */
const FRAME_MS_WORLD = 700
/** Пауза между кадрами при обычном зуме (мс). */
const FRAME_MS_NEAR = 500
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

const ICON_OF_KIND: Record<string, string[]> = {
  trade_sea: ['cog', 'galley', 'caravel'],
  trade_river: ['boat'],
  trade_land: ['cart'],
  caravan: ['caravan'],
}
export function campaignModel(name: string, what: string): string {
  const t = `${name} ${what}`.toLowerCase()
  if (/флот|корабл|морск/.test(t)) return 'fleet'
  if (/дракон/.test(t)) return 'dragon'
  if (/демон/.test(t)) return 'demon'
  if (/нежит|некромант|мертвец|мёртв/.test(t)) return 'undead-skull'
  return 'army'
}

export type Ctx = { shown: Set<string>; campaigns: Map2; year: number; win: number; flag: (routeId: string) => string }
type Map2 = { id: string; from: number; to: number; kind: string }[]
let ctx: Ctx = { shown: new Set(), campaigns: [], year: 0, win: 5, flag: () => FLAG_DEFAULT }
let timer = 0,
  installed: Map | null = null

const mkRoute = (id: string, t: number, idx: number, kind: string) => {
  const l = lines.get(id)!,
    keys = ICON_OF_KIND[kind] ?? ['cart']
  const p = t < 0.5 ? t * 2 : 2 - t * 2,
    rev = t >= 0.5
  const { c, dx, dy } = posAt(l, p),
    h = heading(rev ? -dx : dx, rev ? -dy : dy)
  return {
    type: 'Feature' as const,
    properties: { icon: `m|${keys[idx % keys.length]}|${h.flip ? 'f' : 'n'}|-`, rot: h.rot, sort: -l.len },
    geometry: { type: 'Point' as const, coordinates: pxToLngLat(c) },
  }
}
let prevEmpty = false,
  campKey = ''
/** Кадр моделей; возвращает число моделей во вьюпорте (0 — цикл можно остановить до сдвига карты). */
function frame(map: Map, now: number): number {
  if (!installed) return 0
  const still = reduced(),
    bounds = map.getBounds()
  const speed = ROUTE_SPEED // доля ломаной за мс при длине 1000 px; медленнее на длинных путях
  const rf: PointFeature[] = [],
    idx = new globalThis.Map<string, number>()
  let i = 0
  for (const id of ctx.shown) {
    const l = lines.get(id)
    if (!l || l.len < MIN_ROUTE_LEN_PX || !inView(l, bounds)) continue
    const phase = (i * 0.37) % 1,
      t = still ? 0.5 : ((now * speed * 1000) / (l.len + 400) + phase) % 1
    const f = mkRoute(id, t, i, l.kind)
    idx.set(id, i++)
    if (ensureModelImg(map, f.properties.icon, restartLoop)) rf.push(f)
  }
  const empty0 = !rf.length
  if (!(empty0 && prevEmpty))
    (map.getSource('models-route') as GeoJSONSource)?.setData({ type: 'FeatureCollection', features: rf })
  prevEmpty = empty0
  const ck = `${ctx.year}|${ctx.win}|${ctx.campaigns.map((c) => c.id).join()}|${bounds.getWest().toFixed(2)},${bounds.getNorth().toFixed(2)},${bounds.getEast().toFixed(2)}`
  if (ck === campKey) return rf.length + (ctx.campaigns.length ? 1 : 0)
  campKey = ck
  const cf: PointFeature[] = [],
    ef: PointFeature[] = []
  for (const c of ctx.campaigns) {
    const l = lines.get(c.id)
    if (!l || !inView(l, bounds)) continue
    const rr = routeById.get(c.id)
    const a = c.from - ctx.win,
      b = c.to + ctx.win,
      p = b > a ? (ctx.year - a) / (b - a) : 1
    const { c: xy, dx, dy } = posAt(l, p),
      h = heading(dx, dy),
      key = campaignModel(rr?.name ?? '', rr?.what ?? '')
    const cIcon = `m|${key}|${h.flip ? 'f' : 'n'}|${key === 'army' ? ctx.flag(c.id) : '-'}`
    if (ensureModelImg(map, cIcon, restartLoop))
      cf.push({
        type: 'Feature',
        properties: { icon: cIcon, rot: h.rot },
        geometry: { type: 'Point', coordinates: pxToLngLat(xy) },
      })
    if (!/размещени|развёртыван/i.test(rr?.name ?? ''))
      ef.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: pxToLngLat(l.px[l.px.length - 1]) },
      }) // размещение — не битва, без крестика
  }
  ;(map.getSource('models-camp') as GeoJSONSource)?.setData({ type: 'FeatureCollection', features: cf })
  ;(map.getSource('models-camp-end') as GeoJSONSource)?.setData({ type: 'FeatureCollection', features: ef })
  return rf.length + cf.length
}

// Кадры моделек уступают интерфейсу: пока открыто окно (граф, Гант) и ~0,8 с после клика/клавиши они стоят. Иначе перерисовка карты каждые 160 мс
// задерживает монтирование окна, и его регистрация для Esc (useEffect) запаздывает: быстрый Esc закрывал не окно, а панель слоёв.
let lastInput = -1e9
if (typeof window !== 'undefined')
  for (const ev of ['pointerdown', 'keydown'])
    window.addEventListener(
      ev,
      () => {
        lastInput = performance.now()
      },
      true,
    )
const busyUi = (now: number) =>
  now - lastInput < 800 || (typeof document !== 'undefined' && !!document.querySelector('.gwin, .gantt-ov'))
let last = 0,
  visHooked = false
export function startLoop(map: Map) {
  cancelAnimationFrame(timer)
  timer = 0
  campKey = ''
  const n = frame(map, performance.now())
  if (reduced() || !ctx.shown.size || !n) return // кадры бегут только пока есть корабли/караваны во вьюпорте; сдвиг карты (moveend) запускает снова
  const loop = (t: number) => {
    if (document.hidden) {
      timer = 0
      return
    }
    timer = requestAnimationFrame(loop)
    // при малом зуме моделей много, а видны они мелко: 1,5 кадра/с, ближе — 2: суда движутся медленно (≈1–2 px за кадр)
    if (t - last > (map.getZoom() < 1 ? FRAME_MS_WORLD : FRAME_MS_NEAR)) {
      last = t
      if (!busyUi(t) && frame(map, t) === 0) {
        cancelAnimationFrame(timer)
        timer = 0
      }
    }
  }
  timer = requestAnimationFrame(loop)
  if (!visHooked) {
    visHooked = true
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && installed && !timer) startLoop(installed)
    })
  }
}

/** Подключить анимацию к карте: сдвиг карты и смена prefers-reduced-motion перезапускают цикл. */
export function attachAnimation(map: Map): void {
  installed = map
  map.on('moveend', () => {
    if (!timer) startLoop(map)
  })
  matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener?.('change', () => startLoop(map))
}

/** Перезапустить цикл (после загрузки значка). */
export const restartLoop = () => {
  if (installed) startLoop(installed)
}

export function updateModels(map: Map, next: Partial<Ctx>) {
  ctx = { ...ctx, ...next }
  startLoop(map)
}
