import { describe, expect, it, vi } from 'vitest'
import { PRESETS, applyPreset } from './presets'
import { readHistoryLayers, readLayerIds, withLayerIds } from '../layers/layerHash'
import { built, LAYER_BLURB } from '../layers/registry'
import { iconFor } from '../layers/icons'
import { events, hasCoords } from '../events'

vi.mock('../ui/toast', () => ({ toast: () => {} }))
vi.mock('../dossier', () => ({ closeTopDossier: () => {} }))
const ready = new Set(built.layers.filter((l) => l.status === 'ready').map((l) => l.id))
describe('пресеты и панель слоёв', () => {
  it('все слои пресетов существуют и готовы; камеры в пресетах нет', () => {
    for (const p of PRESETS) {
      expect(
        p.layers.filter((id) => !ready.has(id)),
        p.id,
      ).toEqual([])
      expect('camera' in p).toBe(false)
    }
  })
  it('«Великая война» не обещает походов, которых в −200 нет; в окне ±5 лет ≥2 события с точкой на карте', () => {
    const w = PRESETS.find((p) => p.id === 'great-war')!
    expect(w.layers).not.toContain('campaigns')
    expect(w.label).toBe('Великая война (−200)')
    expect(w.year).toBe(-200)
    expect(events.filter((e) => Math.abs(e.year! - w.year) <= 5 && hasCoords(e)).length).toBeGreaterThanOrEqual(2)
  })
  it('у каждого рабочего слоя есть однострочное описание', () => {
    for (const id of ready) expect(LAYER_BLURB[id], id).toBeTruthy()
  })
  it('описание слоя не начинается с его названия', () => {
    const stem = (w: string) =>
      w
        .toLowerCase()
        .replace(/[^а-яa-z0-9]/g, '')
        .slice(0, 5)
    for (const l of built.layers)
      if (LAYER_BLURB[l.id])
        expect(
          stem(LAYER_BLURB[l.id].split(' ')[0]) === stem(l.name.split(' ')[0]),
          `${l.id}: «${LAYER_BLURB[l.id]}»`,
        ).toBe(false)
  })
  it('«Гильдии и подполье» без рабства; «Торговля» оставляет места по рангу', () => {
    const g = PRESETS.find((p) => p.id === 'underground')!
    expect(g.name).toBe('Гильдии и подполье')
    expect(g.layers).toEqual(['guild-spheres', 'guild-hq'])
    expect(PRESETS.find((p) => p.id === 'trade')!.layers).toContain('places-ranked')
    expect(PRESETS.find((p) => p.id === 'traveler')!.name).toBe('Крепости и опасности')
  })
  it('у крепостей разные значки по типу, у миниатюр есть страницы вики вместо газеттира', () => {
    expect(
      new Set(
        ['Цитадель Иллиора', 'Форт Болотный', 'Колючка'].map((n) => iconFor('fortresses', 'Иллиорская империя', n)),
      ).size,
    ).toBe(3)
    expect(iconFor('fortresses', 'руины', 'Х (руины)')).toBe('ruins')
    const cam = built.minis.find((m) => /caravan/.test(m.id))!
    expect(cam.sources.every((s) => s.startsWith('map:'))).toBe(true)
    expect(cam.via!.length).toBeGreaterThan(0)
  })
  it('applyPreset: после применения l= в хеше равно готовым слоям пресета, политика — флаг в хеше', async () => {
    // окружение без браузера: хеш, history и события — минимальные заглушки; LayersUI заменён слушателем atlas:layers
    const h = { v: '#cx=1&y=500&l=world-miniatures,places-ranked' }
    const ls = new Map<string, ((e: any) => void)[]>()
    const g = globalThis as any
    g.location = {
      get hash() {
        return h.v
      },
    }
    g.history = {
      replaceState: (_s: unknown, _t: string, u: string) => {
        h.v = u
      },
      state: null,
    }
    g.HashChangeEvent = class {
      type = 'hashchange'
    }
    g.CustomEvent = class {
      constructor(
        public type: string,
        public init: any,
      ) {}
      get detail() {
        return this.init?.detail
      }
    }
    g.dispatchEvent = (e: any) => {
      for (const f of ls.get(e.type) ?? []) f(e)
      return true
    }
    g.addEventListener = (t: string, f: any) => ls.set(t, [...(ls.get(t) ?? []), f])
    g.document = { querySelector: () => null }
    addEventListener('atlas:layers', (e: any) => {
      h.v = withLayerIds(
        h.v,
        e.detail.ids.filter((id: string) => ready.has(id)),
      )
    })
    for (const p of PRESETS) {
      applyPreset(p, ready, { setMode: () => {} })
      expect(readLayerIds(h.v), p.id).toEqual(p.layers.filter((id) => ready.has(id)))
      expect(readHistoryLayers(h.v).politics, p.id).toBe(p.politics)
    }
  })
  it('ни один набор не задаёт собственный крупный зум (камера — fitPreset, зум ≤1.3)', () => {
    for (const p of PRESETS) expect(Object.keys(p), p.id).not.toContain('z')
  })
})
