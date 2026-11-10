// Чистый расчёт маршрута: граф мест и дорог, переходы по морским линиям, бездорожье по местности, Дейкстра.
import { type Px } from '../geo/pixel'
import { distPx, KM_PER_PX, pathLenPx } from '../lib/geo'
import { MODES, OPEN_FACTOR, ROAD_FACTOR, TERRAIN_FACTOR, type Cat, type Mode } from './constants'
import { CAT_NAME, accusative, edgeDays, legHpd } from './travel'

export type Pt = { id: string; name: string; x: number; y: number; port?: boolean; kind?: string }
export type Edge = {
  to: string
  km: number
  cat: Cat
  f: number
  geom: Px[]
  up?: boolean
  terr?: string[]
  label?: string
}
export type Terr = { kind: string; name: string; bbox: [number, number, number, number]; polys: Px[][][] }
export type Graph = {
  pts: Map<string, Pt>
  adj: Map<string, Edge[]>
  terr: Terr[]
  roadComp: Map<string, number>
  seas: Pt[]
}

export type Step = { to: string; w: number; edge: Edge }

/** Дейкстра с бинарной кучей. neighbors даёт переходы с весом (Infinity — нет прохода). */
export function dijkstra(
  start: string,
  goal: string,
  neighbors: (id: string) => Iterable<{ to: string; w: number; edge: Edge }>,
) {
  const dist = new Map<string, number>([[start, 0]])
  const prev = new Map<string, { from: string; edge: Edge; w: number }>()
  const heap: [number, string][] = [[0, start]]
  const push = (it: [number, string]) => {
    heap.push(it)
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p][0] <= heap[i][0]) break
      ;[heap[p], heap[i]] = [heap[i], heap[p]]
      i = p
    }
  }
  const pop = () => {
    const top = heap[0],
      last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1,
          r = l + 1
        let m = i
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }
  const done = new Set<string>()
  while (heap.length) {
    const [d, u] = pop()
    if (done.has(u)) continue
    done.add(u)
    if (u === goal) break
    for (const s of neighbors(u)) {
      if (!isFinite(s.w)) continue
      const nd = d + s.w
      if (nd < (dist.get(s.to) ?? Infinity)) {
        dist.set(s.to, nd)
        prev.set(s.to, { from: u, edge: s.edge, w: s.w })
        push([nd, s.to])
      }
    }
  }
  if (!dist.has(goal)) return null
  const steps: { from: string; to: string; edge: Edge; w: number }[] = []
  for (let c = goal; c !== start;) {
    const p = prev.get(c)!
    steps.push({ from: p.from, to: c, edge: p.edge, w: p.w })
    c = p.from
  }
  return { cost: dist.get(goal)!, steps: steps.reverse() }
}

// ---------- геометрия ----------
export const polyKm = (g: Px[]) => pathLenPx(g) * KM_PER_PX
function inRing(x: number, y: number, r: Px[]) {
  let c = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if (r[i][1] > y !== r[j][1] > y && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c
  }
  return c
}
/** Участок местности в точке (самый тяжёлый, если полигоны перекрываются) */
export function terrainAt(terr: Terr[], x: number, y: number): Terr | null {
  let best: Terr | null = null
  for (const t of terr) {
    if (x < t.bbox[0] || x > t.bbox[2] || y < t.bbox[1] || y > t.bbox[3]) continue
    if (
      t.polys.some((p) => p.reduce((acc, ring) => (inRing(x, y, ring) ? !acc : acc), false)) &&
      (!best || (TERRAIN_FACTOR[t.kind] ?? 1) < (TERRAIN_FACTOR[best.kind] ?? 1))
    )
      best = t
  }
  return best
}
export const terrLabel = (t: Terr) => t.name

/** Прямое бездорожье a→b: коэффициент — по местности вдоль линии (шаг 8 px) */
export function offEdge(terr: Terr[], a: Pt, b: Pt): Edge {
  const L = distPx(a, b),
    n = Math.max(1, Math.ceil(L / 8))
  let eff = 0
  const names = new Set<string>()
  for (let i = 0; i < n; i++) {
    const t = terrainAt(terr, a.x + ((b.x - a.x) * (i + 0.5)) / n, a.y + ((b.y - a.y) * (i + 0.5)) / n)
    const f = t ? Math.min(OPEN_FACTOR, TERRAIN_FACTOR[t.kind] ?? OPEN_FACTOR) : OPEN_FACTOR
    if (t) names.add(terrLabel(t))
    eff += 1 / f
  }
  const f = n / eff
  return {
    to: b.id,
    km: L * KM_PER_PX,
    cat: 'off',
    f,
    geom: [
      [a.x, a.y],
      [b.x, b.y],
    ],
    terr: [...names],
  }
}

// ---------- сборка графа ----------
export type RoadNode = { id: string; name: string; x: number; y: number }
export type RoadEdge = { from: string; to: string; type: 'paved' | 'gravel' | 'direction'; geom: Px[] }
export type SeaLine = { id: string; geom: Px[] }
export type RiverLine = { id: string; name: string | null; geom: Px[] }
export type GraphInput = {
  places: Pt[]
  roadNodes: RoadNode[]
  roads: RoadEdge[]
  sea: SeaLine[]
  rivers: RiverLine[]
  terr: Terr[]
  seas?: Pt[]
}

const add = (adj: Map<string, Edge[]>, from: string, e: Edge) => {
  if (!adj.has(from)) adj.set(from, [])
  adj.get(from)!.push(e)
}
const addBoth = (adj: Map<string, Edge[]>, a: string, b: string, e: Omit<Edge, 'to'>, rev?: Partial<Edge>) => {
  add(adj, a, { ...e, to: b })
  add(adj, b, { ...e, geom: [...e.geom].reverse(), to: a, ...rev })
}
const dist = distPx
const nearest = (pts: Pt[], x: number, y: number, k: number, skip?: (p: Pt) => boolean) =>
  pts
    .filter((p) => !skip?.(p))
    .map((p) => ({ p, d: distPx(p, { x, y }) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, k)

function projectOn(g: Px[], x: number, y: number): { d: number; t: number } {
  let best = { d: Infinity, t: 0 }
  for (let i = 1; i < g.length; i++) {
    const [ax, ay] = g[i - 1],
      [bx, by] = g[i],
      dx = bx - ax,
      dy = by - ay,
      l2 = dx * dx + dy * dy
    const u = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0
    const d = distPx({ x, y }, { x: ax + u * dx, y: ay + u * dy })
    if (d < best.d) best = { d, t: i - 1 + u }
  }
  return best
}
const slice = (g: Px[], t0: number, t1: number): Px[] => {
  const at = (t: number): Px => {
    const i = Math.min(Math.floor(t), g.length - 2),
      u = t - i
    return [g[i][0] + (g[i + 1][0] - g[i][0]) * u, g[i][1] + (g[i + 1][1] - g[i][1]) * u]
  }
  const lo = Math.min(t0, t1),
    hi = Math.max(t0, t1)
  const mid = g.slice(Math.floor(lo) + 1, Math.ceil(hi))
  const out = [at(lo), ...mid, at(hi)]
  return t0 <= t1 ? out : out.reverse()
}

export function buildGraph(inp: GraphInput): Graph {
  const pts = new Map<string, Pt>()
  for (const p of inp.places) pts.set(p.id, p)
  for (const n of inp.roadNodes) if (!pts.has(n.id)) pts.set(n.id, { id: n.id, name: n.name, x: n.x, y: n.y })
  const adj = new Map<string, Edge[]>()
  const roadIds = new Set<string>()
  // дороги
  for (const r of inp.roads) {
    if (!pts.has(r.from) || !pts.has(r.to)) continue
    roadIds.add(r.from)
    roadIds.add(r.to)
    addBoth(adj, r.from, r.to, { km: polyKm(r.geom), cat: r.type, f: ROAD_FACTOR[r.type], geom: r.geom })
  }
  // компоненты дорожного графа
  const roadComp = new Map<string, number>()
  let cn = 0
  for (const id of roadIds) {
    if (roadComp.has(id)) continue
    const st = [id]
    roadComp.set(id, cn)
    while (st.length)
      for (const e of adj.get(st.pop()!) ?? [])
        if (!roadComp.has(e.to)) {
          roadComp.set(e.to, cn)
          st.push(e.to)
        }
    cn++
  }
  // морские линии: концы — ближайшие места (до 6 px), иначе новая точка
  const all = () => [...pts.values()]
  const snap = (p: Px, label: string): Pt => {
    const [n] = nearest(all(), p[0], p[1], 1)
    if (n && n.d <= 6) return n.p
    const id = `xy:${Math.round(p[0])},${Math.round(p[1])}`
    if (!pts.has(id)) pts.set(id, { id, name: label, x: p[0], y: p[1] })
    return pts.get(id)!
  }
  const anchors = new Set(roadIds)
  for (const s of inp.sea) {
    const a = snap(s.geom[0], 'морской узел'),
      b = snap(s.geom[s.geom.length - 1], 'морской узел')
    if (a.id === b.id) continue
    a.port = b.port = true
    anchors.add(a.id)
    anchors.add(b.id)
    addBoth(adj, a.id, b.id, { km: polyKm(s.geom), cat: 'sea', f: 1, geom: s.geom, label: s.id })
  }
  // реки: места в 8 px от русла, по порядку вдоль течения
  for (const rv of inp.rivers) {
    const on = all()
      .map((p) => ({ p, ...projectOn(rv.geom, p.x, p.y) }))
      .filter((o) => o.d <= 8)
      .sort((a, b) => a.t - b.t)
    for (let i = 1; i < on.length; i++) {
      const a = on[i - 1],
        b = on[i]
      if (a.p.id === b.p.id) continue
      const g = slice(rv.geom, a.t, b.t)
      // a→b по течению (вдоль порядка точек), b→a — против течения
      addBoth(
        adj,
        a.p.id,
        b.p.id,
        { km: polyKm(g), cat: 'river', f: 1, geom: g, label: rv.name ?? rv.id },
        { up: true },
      )
    }
  }
  // бездорожье: k ближайших соседей + связи якорей между разными компонентами
  const comp = (id: string) => (roadComp.has(id) ? roadComp.get(id)! : -1 - [...pts.keys()].indexOf(id))
  const seen = new Set<string>()
  const link = (a: Pt, b: Pt) => {
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`
    if (seen.has(key) || a.id === b.id) return
    seen.add(key)
    const e = offEdge(inp.terr, a, b)
    addBoth(adj, a.id, b.id, { km: e.km, cat: 'off', f: e.f, geom: e.geom, terr: e.terr })
  }
  const list = all()
  for (const a of list) {
    for (const { p } of nearest(
      list,
      a.x,
      a.y,
      4,
      (p) => p.id === a.id || (roadComp.has(p.id) && roadComp.get(p.id) === roadComp.get(a.id)),
    ))
      link(a, p)
  }
  for (const id of anchors) {
    const a = pts.get(id)!
    for (const { p, d } of nearest(
      [...anchors].map((i) => pts.get(i)!),
      a.x,
      a.y,
      2,
      (p) => comp(p.id) === comp(a.id),
    ))
      if (d < 2400) link(a, p)
  }
  return { pts, adj, terr: inp.terr, roadComp, seas: inp.seas ?? [] }
}

// ---------- маршрут ----------
export type Leg = {
  cat: Cat
  from: string
  to: string
  km: number
  days: number
  hours: number
  geom: Px[]
  terr: string[]
  label?: string
}
export type Plan = {
  mode: Mode
  a: Pt
  b: Pt
  legs: Leg[]
  km: number
  days: number
  hours: number
  byCat: Partial<Record<Cat, { km: number; days: number }>>
  warnings: string[]
  straightKm: number
  /** ходовых часов в сутки по участкам (для «≈N сут (D ч в пути в день)») */
  hpds: number[]
  /** сухопутный способ с морским участком: «с пересадкой на корабль» */
  transfer: boolean
  /** корабль, но часть пути пешком (до порта и от порта) */
  composite: boolean
}

/** Если точки нет в графе (клик по пустому месту) — подвесить её бездорожьем к 4 ближайшим местам */
function attach(g: Graph, p: Pt, extra: Map<string, Edge[]>) {
  if (g.pts.has(p.id)) return
  for (const { p: q } of nearest([...g.pts.values()], p.x, p.y, 4)) {
    const e = offEdge(g.terr, p, q)
    add(extra, p.id, e)
    add(extra, q.id, { ...e, to: p.id, geom: [...e.geom].reverse() })
  }
}

export function planRoute(g: Graph, a: Pt, b: Pt, mode: Mode, hazards: Map<string, string> = new Map()): Plan | null {
  const straightKm = dist(a, b) * KM_PER_PX
  let legs: Leg[]
  let composite = false
  if (mode === 'griffon') {
    const geom: Px[] = [
      [a.x, a.y],
      [b.x, b.y],
    ]
    const days = straightKm / MODES.griffon.kmDay
    legs = [{ cat: 'air', from: a.id, to: b.id, km: straightKm, days, hours: days * MODES.griffon.hpd, geom, terr: [] }]
  } else {
    const extra = new Map<string, Edge[]>()
    attach(g, a, extra)
    attach(g, b, extra)
    // walk: корабль без чисто водного пути — на суше идём пешком (до порта и от порта)
    const nbOf = (walk: boolean) =>
      function* (id: string) {
        for (const e of [...(g.adj.get(id) ?? []), ...(extra.get(id) ?? [])])
          yield { to: e.to, w: edgeDays(e, walk && e.cat !== 'sea' && e.cat !== 'river' ? 'foot' : mode), edge: e }
      }
    let r = dijkstra(a.id, b.id, nbOf(false))
    if (!r && mode === 'ship') {
      r = dijkstra(a.id, b.id, nbOf(true))
      if (r && !r.steps.some((s) => s.edge.cat === 'sea' || s.edge.cat === 'river')) r = null // водного участка нет — это просто пеший путь, не корабль
      composite = !!r
    }
    if (!r) return null
    legs = r.steps.map((s) => ({
      cat: s.edge.cat,
      from: s.from,
      to: s.to,
      km: s.edge.km,
      days: s.w,
      hours: s.w * legHpd(s.edge.cat, mode),
      geom: s.edge.geom,
      terr: s.edge.terr ?? [],
      label: s.edge.label,
    }))
  }
  const byCat: Plan['byCat'] = {}
  for (const l of legs) {
    const c = (byCat[l.cat] ??= { km: 0, days: 0 })
    c.km += l.km
    c.days += l.days
  }
  const warnings: string[] = []
  const seen = new Set<string>()
  const warn = (w: string) => {
    if (!seen.has(w)) {
      seen.add(w)
      warnings.push(w)
    }
  }
  const hz = new Map([...hazards].map(([k, v]) => [k.toLowerCase(), v]))
  for (const l of legs)
    for (const t of l.terr)
      warn(hz.has(t.toLowerCase()) ? `Через ${accusative(t)}: ${hz.get(t.toLowerCase())}` : `Через ${accusative(t)}`)
  const name = (id: string) => g.pts.get(id)?.name ?? (id === a.id ? a.name : b.name)
  for (const l of legs)
    if (l.cat === 'sea') {
      const seas = new Set<string>()
      for (let i = 0; i < l.geom.length; i += 3) {
        const [s] = nearest(g.seas, l.geom[i][0], l.geom[i][1], 1)
        if (s && s.d < 1100) seas.add(s.p.name)
      }
      warn(
        `Морской переход ${name(l.from)} — ${name(l.to)}${seas.size ? `: ${[...seas].join(', ')}` : ''}${[...seas]
          .map((n) => hazards.get(n))
          .filter(Boolean)
          .map((t) => ` (${t})`)
          .join('')}`,
      )
    }
  return {
    mode,
    a,
    b,
    legs,
    straightKm,
    km: legs.reduce((s, l) => s + l.km, 0),
    days: legs.reduce((s, l) => s + l.days, 0),
    hours: legs.reduce((s, l) => s + l.hours, 0),
    byCat,
    warnings,
    hpds: [...new Set(legs.map((l) => legHpd(l.cat, mode)))],
    transfer: mode !== 'ship' && legs.some((l) => l.cat === 'sea'),
    composite,
  }
}
/** Подпись: «тракт», «бездорожье» … */
export const catName = (c: Cat) => CAT_NAME[c]

/** Есть ли у места водный выход (морская линия или река) */
export const onWater = (g: Graph, id: string) => (g.adj.get(id) ?? []).some((e) => e.cat === 'sea' || e.cat === 'river')

/** Для «Корабля» без водного пути: какой конец не у воды и сколько пешком до ближайшего места с водным выходом */
export function shipFallback(
  g: Graph,
  a: Pt,
  b: Pt,
  hazards: Map<string, string> = new Map(),
): { end: 'a' | 'b' | null; port?: Pt; km?: number } {
  const end = !onWater(g, a.id) ? 'a' : !onWater(g, b.id) ? 'b' : null
  if (!end) return { end }
  const p = end === 'a' ? a : b
  let best: { port: Pt; km: number } | undefined
  for (const { p: q } of nearest(
    [...g.pts.values()].filter((x) => onWater(g, x.id)),
    p.x,
    p.y,
    6,
  )) {
    const r = planRoute(g, p, q, 'foot', hazards)
    if (r && (!best || r.km < best.km)) best = { port: q, km: r.km }
  }
  return { end, ...best }
}
