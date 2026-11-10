// Площадные слои: разбор data/areas.yaml и раскладка по ячейкам. Чистые функции (браузер, Node, тесты).
import type { AreaRecT, AreasFileT } from '../data/schema'

export type CellProps = { id: string; name: string; state_1006: string; region: string | null }
export type AreaLayerKey = 'religion' | 'language' | 'currency' | 'guild'
/** id слоя панели (data/layers.yaml) -> ключ данных. */
export const AREA_LAYER_IDS: Record<string, AreaLayerKey> = {
  religions: 'religion',
  languages: 'language',
  currencies: 'currency',
  'guild-spheres': 'guild',
}

const SPEC = { cells: 3, region: 2, state_1006: 1 } as const
/** Записи слоя, подходящие ячейке, от конкретных (ячейка, регион) к общим (государство). */
export function recordsFor(f: AreasFileT, layer: AreaLayerKey, c: CellProps): AreaRecT[] {
  return f.areas
    .filter(
      (a) =>
        a.layer === layer &&
        (a.scope === 'cells'
          ? a.ids.includes(c.id)
          : a.scope === 'region'
            ? !!c.region && a.ids.includes(c.region)
            : a.ids.includes(c.state_1006)),
    )
    .sort((a, b) => SPEC[b.scope] - SPEC[a.scope])
}
/** Основное значение ячейки (самая конкретная primary-запись) и остальные записи для карточки. Для гильдий основных нет: все — штриховка. */
export function resolveCell(
  f: AreasFileT,
  layer: AreaLayerKey,
  c: CellProps,
): { main: AreaRecT | null; others: AreaRecT[]; guilds: AreaRecT[] } {
  const rs = recordsFor(f, layer, c)
  if (layer === 'guild') return { main: null, others: [], guilds: rs }
  const main = rs.find((r) => r.primary) ?? null
  return { main, others: rs.filter((r) => r !== main && r.value !== main?.value), guilds: [] }
}
/** Сводка слоя: записей, закрашенных ячеек, число ячеек на значение (для легенды). */
export function summary(f: AreasFileT, layer: AreaLayerKey, cells: CellProps[]) {
  const per = new Map<string, number>()
  let filled = 0
  for (const c of cells) {
    const r = resolveCell(f, layer, c)
    const vals = layer === 'guild' ? r.guilds.map((g) => g.value) : r.main ? [r.main.value] : []
    if (vals.length) filled++
    for (const v of new Set(vals)) per.set(v, (per.get(v) ?? 0) + 1)
  }
  return {
    records: f.areas.filter((a) => a.layer === layer).length,
    filled,
    legend: [...per]
      .map(([value, n]) => ({ value, n }))
      .sort((a, b) => b.n - a.n || a.value.localeCompare(b.value, 'ru')),
  }
}
