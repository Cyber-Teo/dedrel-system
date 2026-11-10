import { describe, expect, it } from 'vitest'
import { layout, placeLabels, type FNode } from './force'
import { allNodes, groupOf, relations, TYPES } from './data'

describe('граф связей', () => {
  it('рёбра ссылаются на людей, типы из списка, нет дублей', () => {
    const ids = new Set(allNodes.map((n) => n.id)),
      seen = new Set<string>()
    for (const r of relations) {
      expect(TYPES).toContain(r.type)
      expect(ids.has(r.a) && ids.has(r.b)).toBe(true)
      expect(r.a).not.toBe(r.b)
      const k = [r.a, r.b].sort().join('|') + r.type
      expect(seen.has(k)).toBe(false)
      seen.add(k)
    }
  })
  it('дом определяется по affiliation', () => {
    expect(groupOf('Дом Тарквиниев')).toBe('Тарквинии')
    expect(groupOf('Фурии')).toBe('Фурии')
    expect(groupOf(undefined)).toBe('Прочие')
  })
  it('раскладка разводит узлы и держит связанных ближе несвязанных', () => {
    const mk = (id: string, x: number): FNode => ({ id, x, y: 100 + x * 0.01, vx: 0, vy: 0 })
    const ns = [mk('a', 0), mk('b', 1), mk('c', 2), mk('d', 3)]
    layout(
      ns,
      [
        { a: 'a', b: 'b' },
        { a: 'c', b: 'd' },
      ],
      800,
      600,
    )
    const d = (p: FNode, q: FNode) => Math.hypot(p.x - q.x, p.y - q.y)
    expect(d(ns[0], ns[1])).toBeGreaterThan(5)
    expect(d(ns[0], ns[1])).toBeLessThan(d(ns[0], ns[2]))
  })
})

describe('подписи узлов', () => {
  it('на полном графе подписано не меньше 10 узлов степени ≥3 без наложений подписей', () => {
    const W = 1500,
      H = 640
    const ids = new Set(relations.flatMap((r) => [r.a, r.b]))
    const byId = new Map(allNodes.map((n) => [n.id, n]))
    const list = [...ids].map((id, i) => {
      const a = (i / ids.size) * Math.PI * 2
      return { ...byId.get(id)!, x: W / 2 + Math.cos(a) * 520, y: H / 2 + Math.sin(a) * 250, vx: 0, vy: 0 }
    })
    layout(list, relations, W, H, 420, { charge: -9000, dist: 120, gravity: 0.012 })
    for (const n of list) {
      n.x = Math.max(40, Math.min(W - 40, n.x))
      n.y = Math.max(40, Math.min(H - 40, n.y))
    }
    const r = (n: { deg: number }) => 11 + Math.min(8, n.deg * 1.2)
    const cand = list.filter((n) => n.deg >= 3).sort((a, b) => b.deg - a.deg)
    const out = placeLabels(
      cand.map((n) => ({ id: n.id, x: n.x, y: n.y, r: r(n), w: Math.min(n.name.length, 28) * 8.2 + 8 })),
      list.map((n) => ({ x: n.x, y: n.y, r: r(n) })),
      W / 2,
      H / 2,
      20,
      { w: W, h: H },
    )
    expect(out.length).toBeGreaterThanOrEqual(10)
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i].box,
          b = out[j].box
        expect(a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0).toBe(false)
      }
  })
})
