// Проверки data/geo/*.geojson: структура GeoJSON, обязательные свойства, ссылки на реестр, столицы внутри своей страны.
// Координаты — пиксели карты 7920×5960 (x слева, y сверху).
export type Pt = [number, number]
export type Ring = Pt[]
export type Poly = Ring[] // [внешнее кольцо, дыры…]

/** Лучевой алгоритм; точка на границе считается внутри. */
export function inRing(p: Pt, ring: Ring): boolean {
  const [x, y] = p
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j]
    const cross = (xj - xi) * (y - yi) - (yj - yi) * (x - xi)
    if (cross === 0 && Math.min(xi, xj) <= x && x <= Math.max(xi, xj) && Math.min(yi, yj) <= y && y <= Math.max(yi, yj))
      return true
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
export const inPolygon = (p: Pt, poly: Poly) =>
  poly.length > 0 && inRing(p, poly[0]) && !poly.slice(1).some((h) => inRing(p, h))
export const inMulti = (p: Pt, polys: Poly[]) => polys.some((pl) => inPolygon(p, pl))

type Json = any
export type GeoCtx = {
  file: string
  resolves: (id: string) => boolean // id есть в places/реестре страниц вики
  sourceOk: (s: string) => boolean
  w: number
  h: number
}
const CONF = ['canon', 'derived', 'speculative']

/** Проверка одной коллекции. Возвращает сообщения об ошибках; в `polys` кладёт разобранные полигоны по id. */
export function checkCollection(fc: Json, ctx: GeoCtx, polys: Map<string, Poly[]>): string[] {
  const out: string[] = []
  const e = (m: string) => out.push(`${ctx.file}: ${m}`)
  if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    e('не FeatureCollection')
    return out
  }
  const seen = new Set<string>()
  fc.features.forEach((f: Json, i: number) => {
    const p = f?.properties ?? {}
    const who = `фича #${i}${typeof p.id === 'string' ? ` «${p.id}»` : ''}`
    if (f?.type !== 'Feature') {
      e(`${who}: type ≠ Feature`)
      return
    }
    if (typeof p.id !== 'string' || !p.id) e(`${who}: нет properties.id`)
    else {
      if (seen.has(p.id)) e(`${who}: id повторяется`)
      seen.add(p.id)
      if (!ctx.resolves(p.id)) e(`${who}: id не найден ни в places.yaml, ни среди страниц вики`)
    }
    if (typeof p.name !== 'string' || !p.name.trim()) e(`${who}: нет properties.name`)
    if (!CONF.includes(p.confidence)) e(`${who}: confidence «${p.confidence}» не из ${CONF.join('/')}`)
    if (!Array.isArray(p.sources) || !p.sources.length) e(`${who}: нет непустого properties.sources`)
    else
      for (const s of p.sources) if (typeof s !== 'string' || !ctx.sourceOk(s)) e(`${who}: источник «${s}» неизвестен`)
    if (p.parent !== undefined && !ctx.resolves(p.parent)) e(`${who}: parent «${p.parent}» не найден`)
    const g = f.geometry
    let mp: Poly[]
    if (g?.type === 'Polygon') mp = [g.coordinates]
    else if (g?.type === 'MultiPolygon') mp = g.coordinates
    else {
      e(`${who}: geometry ${g?.type ?? 'нет'} — ожидается Polygon/MultiPolygon`)
      return
    }
    let bad = ''
    if (!Array.isArray(mp) || !mp.length) bad = 'пустая геометрия'
    else
      for (const poly of mp) {
        if (!Array.isArray(poly) || !poly.length) {
          bad = 'полигон без колец'
          break
        }
        for (const r of poly) {
          if (!Array.isArray(r) || r.length < 4) {
            bad = 'кольцо короче 4 точек'
            break
          }
          const a = r[0],
            b = r[r.length - 1]
          if (a[0] !== b[0] || a[1] !== b[1]) {
            bad = 'кольцо не замкнуто'
            break
          }
          if (
            r.some(
              (q: Json) =>
                !Array.isArray(q) ||
                q.length < 2 ||
                !Number.isFinite(q[0]) ||
                !Number.isFinite(q[1]) ||
                q[0] < 0 ||
                q[1] < 0 ||
                q[0] > ctx.w ||
                q[1] > ctx.h,
            )
          ) {
            bad = `координата вне 0…${ctx.w}×0…${ctx.h} или не число`
            break
          }
        }
        if (bad) break
      }
    if (bad) e(`${who}: ${bad}`)
    else if (typeof p.id === 'string') polys.set(p.id, mp as Poly[])
  })
  return out
}

export type Capital = { place: string; state: string; at: Pt; why: string }
/** Каждая столица — внутри полигона своей страны. */
export function checkCapitals(caps: Capital[], states: Map<string, Poly[]>, file: string): string[] {
  const out: string[] = []
  for (const c of caps) {
    const poly = states.get(c.state)
    if (!poly) {
      out.push(`${file}: столица ${c.place} (${c.why}): у страны «${c.state}» нет полигона`)
      continue
    }
    if (!inMulti(c.at, poly))
      out.push(`${file}: столица ${c.place} (${c.at[0]},${c.at[1]}) вне полигона страны «${c.state}» (${c.why})`)
  }
  return out
}
