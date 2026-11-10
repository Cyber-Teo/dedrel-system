// Лёгкая силовая раскладка (отталкивание, пружины рёбер, тяготение к центру) — как в d3-force, без зависимости.
export type FNode = { id: string; x: number; y: number; vx: number; vy: number; fx?: number; fy?: number }
export type FLink = { a: string; b: string }

export function layout<T extends FNode>(
  nodes: T[],
  links: FLink[],
  w: number,
  h: number,
  ticks = 320,
  opts = { charge: -520, dist: 62, gravity: 0.045 },
) {
  const by = new Map(nodes.map((n) => [n.id, n]))
  const ls = links.map((l) => [by.get(l.a)!, by.get(l.b)!] as const).filter(([a, b]) => a && b)
  let alpha = 1
  const decay = 1 - Math.pow(0.001, 1 / ticks)
  for (let t = 0; t < ticks; t++) {
    alpha += (0 - alpha) * decay
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]
        let dx = b.x - a.x,
          dy = b.y - a.y,
          d2 = dx * dx + dy * dy
        if (d2 < 1) {
          dx = Math.random() - 0.5
          dy = Math.random() - 0.5
          d2 = 1
        }
        if (d2 > 640000) continue
        const f = (opts.charge * alpha) / d2,
          d = Math.sqrt(d2)
        a.vx += (dx / d) * f
        a.vy += (dy / d) * f
        b.vx -= (dx / d) * f
        b.vy -= (dy / d) * f
      }
    }
    for (const [a, b] of ls) {
      const dx = b.x + b.vx - a.x - a.vx,
        dy = b.y + b.vy - a.y - a.vy
      const d = Math.sqrt(dx * dx + dy * dy) || 1,
        k = ((d - opts.dist) / d) * alpha * 0.35
      a.vx += dx * k
      a.vy += dy * k
      b.vx -= dx * k
      b.vy -= dy * k
    }
    for (const n of nodes) {
      n.vx += (w / 2 - n.x) * opts.gravity * alpha
      n.vy += (h / 2 - n.y) * opts.gravity * alpha
      n.vx *= 0.6
      n.vy *= 0.6
      n.x = n.fx ?? n.x + n.vx
      n.y = n.fy ?? n.y + n.vy
    }
  }
  return nodes
}

export type LabelIn = { id: string; x: number; y: number; r: number; w: number; force?: boolean }
export type LabelOut = {
  id: string
  x: number
  y: number
  anchor: 'middle' | 'start' | 'end'
  box: { x0: number; y0: number; x1: number; y1: number }
}
/** Расстановка подписей узлов без взаимных наложений: порядок = приоритет (первые ставятся первыми). Подпись смещается от центра графа
 *  (по углу), при занятом месте пробуем соседние стороны; не поместилась — пропускается (кроме force: фокус и наведение ставятся всегда). */
export function placeLabels(
  items: LabelIn[],
  all: { x: number; y: number; r: number }[],
  cx: number,
  cy: number,
  h = 20,
  bounds?: { w: number; h: number },
): LabelOut[] {
  const placed: LabelOut[] = []
  const hit = (a: LabelOut['box'], b: LabelOut['box']) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
  for (const it of items) {
    let dx = it.x - cx,
      dy = it.y - cy
    const d = Math.hypot(dx, dy) || 1
    dx /= d
    dy /= d
    const g = 3
    const c = [
      {
        ux: 0,
        uy: 1,
        anchor: 'middle' as const,
        box: { x0: it.x - it.w / 2, x1: it.x + it.w / 2, y0: it.y + it.r + g, y1: it.y + it.r + g + h },
        tx: it.x,
        ty: it.y + it.r + g + h - 4,
      },
      {
        ux: 0,
        uy: -1,
        anchor: 'middle' as const,
        box: { x0: it.x - it.w / 2, x1: it.x + it.w / 2, y0: it.y - it.r - g - h, y1: it.y - it.r - g },
        tx: it.x,
        ty: it.y - it.r - g - 4,
      },
      {
        ux: 1,
        uy: 0,
        anchor: 'start' as const,
        box: { x0: it.x + it.r + g, x1: it.x + it.r + g + it.w, y0: it.y - h / 2, y1: it.y + h / 2 },
        tx: it.x + it.r + g,
        ty: it.y + 4,
      },
      {
        ux: -1,
        uy: 0,
        anchor: 'end' as const,
        box: { x0: it.x - it.r - g - it.w, x1: it.x - it.r - g, y0: it.y - h / 2, y1: it.y + h / 2 },
        tx: it.x - it.r - g,
        ty: it.y + 4,
      },
      {
        ux: 0.7,
        uy: 0.7,
        anchor: 'start' as const,
        box: { x0: it.x + it.r * 0.7, x1: it.x + it.r * 0.7 + it.w, y0: it.y + it.r + g, y1: it.y + it.r + g + h },
        tx: it.x + it.r * 0.7,
        ty: it.y + it.r + g + h - 4,
      },
      {
        ux: -0.7,
        uy: 0.7,
        anchor: 'end' as const,
        box: { x0: it.x - it.r * 0.7 - it.w, x1: it.x - it.r * 0.7, y0: it.y + it.r + g, y1: it.y + it.r + g + h },
        tx: it.x - it.r * 0.7,
        ty: it.y + it.r + g + h - 4,
      },
      {
        ux: 0.7,
        uy: -0.7,
        anchor: 'start' as const,
        box: { x0: it.x + it.r * 0.7, x1: it.x + it.r * 0.7 + it.w, y0: it.y - it.r - g - h, y1: it.y - it.r - g },
        tx: it.x + it.r * 0.7,
        ty: it.y - it.r - g - 4,
      },
      {
        ux: -0.7,
        uy: -0.7,
        anchor: 'end' as const,
        box: { x0: it.x - it.r * 0.7 - it.w, x1: it.x - it.r * 0.7, y0: it.y - it.r - g - h, y1: it.y - it.r - g },
        tx: it.x - it.r * 0.7,
        ty: it.y - it.r - g - 4,
      },
    ].sort((a, b) => b.ux * dx + b.uy * dy - (a.ux * dx + a.uy * dy))
    const inside = (b: LabelOut['box']) =>
      !bounds || (b.x0 >= 4 && b.x1 <= bounds.w - 4 && b.y0 >= 4 && b.y1 <= bounds.h - 4)
    const free = (b: LabelOut['box']) =>
      inside(b) &&
      !placed.some((p) => hit(b, p.box)) &&
      !all.some((n) => b.x0 < n.x + n.r && b.x1 > n.x - n.r && b.y0 < n.y + n.r && b.y1 > n.y - n.r)
    const ok = c.find((k) => free(k.box)) ?? (it.force ? c[0] : null)
    if (ok) placed.push({ id: it.id, x: ok.tx, y: ok.ty, anchor: ok.anchor, box: ok.box })
  }
  return placed
}

/** Разводит узлы: расстояние между центрами ≥ сумме радиусов (+ зазор), узлы остаются в рамке с отступом pad. */
export function separate<T extends { x: number; y: number }>(
  nodes: T[],
  rad: (n: T) => number,
  w: number,
  h: number,
  pad = 24,
  gap = 4,
  iters = 200,
) {
  const clamp = (n: T) => {
    const r = rad(n)
    n.x = Math.max(pad + r, Math.min(w - pad - r, n.x))
    n.y = Math.max(pad + r, Math.min(h - pad - r, n.y))
  }
  for (const n of nodes) clamp(n)
  for (let it = 0; it < iters; it++) {
    let moved = false
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i],
          b = nodes[j],
          need = rad(a) + rad(b) + gap
        let dx = b.x - a.x,
          dy = b.y - a.y,
          d = Math.hypot(dx, dy)
        if (d >= need) continue
        if (d < 0.01) {
          dx = Math.cos(i + j)
          dy = Math.sin(i + j)
          d = 1
        }
        const k = (need - d) / 2 / d
        a.x -= dx * k
        a.y -= dy * k
        b.x += dx * k
        b.y += dy * k
        moved = true
      }
    for (const n of nodes) clamp(n)
    if (!moved) break
  }
  return nodes
}
