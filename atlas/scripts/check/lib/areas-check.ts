// Проверка data/areas.yaml: схема, ссылки на государства/регионы/ячейки, цвета значений, конфликты основных значений, сводка по слоям.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AREA_LAYERS } from '../../../src/data/schema'
import { resolveCell, summary, type CellProps } from '../../../src/layers/areaData'
import { parseAreas } from '../../../src/layers/areaParse'

export function checkAreas(dir: string, pages: Record<string, unknown>, err: (m: string) => void): string[] {
  const p = join(dir, 'areas.yaml'),
    cp = join(dir, 'geo/cells.geojson')
  if (!existsSync(p)) {
    err(`${p}: файла нет`)
    return []
  }
  let f
  try {
    f = parseAreas(readFileSync(p, 'utf8'))
  } catch (e) {
    err(`${p}: ${(e as Error).message.split('\n').slice(0, 3).join(' ')}`)
    return []
  }
  const cells: CellProps[] = existsSync(cp)
    ? JSON.parse(readFileSync(cp, 'utf8')).features.map((x: any) => ({
        id: x.properties.id,
        name: x.properties.name,
        state_1006: x.properties.state_1006,
        region: x.properties.region ?? null,
      }))
    : []
  const states = new Set(cells.map((c) => c.state_1006)),
    regions = new Set(cells.map((c) => c.region).filter(Boolean)),
    cellIds = new Set(cells.map((c) => c.id))
  const seen = new Set<string>()
  for (const a of f.areas) {
    const who = `areas.yaml [${a.id}]`
    if (seen.has(a.id)) err(`${who}: id повторяется`)
    seen.add(a.id)
    const pool = a.scope === 'state_1006' ? states : a.scope === 'region' ? regions : cellIds
    for (const i of a.ids) if (!pool.has(i)) err(`${who}: ${a.scope} «${i}» не найден в cells.geojson`)
    for (const s of a.sources)
      if (!(s.startsWith('map:') || s in pages)) err(`${who}: источник «${s}» — нет в data/site/pages.json`)
    if ((a.primary || a.layer === 'guild') && !f.values[a.layer][a.value])
      err(`${who}: у значения «${a.value}» нет цвета в values.${a.layer}`)
    if (a.layer === 'guild' && f.values.guild[a.value]?.angle === undefined)
      err(`${who}: у гильдии «${a.value}» нет angle штриховки`)
  }
  // у ячейки на одном уровне конкретности не должно быть двух разных основных значений
  for (const layer of AREA_LAYERS.filter((l) => l !== 'guild'))
    for (const c of cells) {
      const rs = f.areas.filter(
        (a) =>
          a.layer === layer &&
          a.primary &&
          (a.scope === 'cells'
            ? a.ids.includes(c.id)
            : a.scope === 'region'
              ? c.region && a.ids.includes(c.region)
              : a.ids.includes(c.state_1006)),
      )
      for (const sc of ['cells', 'region', 'state_1006']) {
        const v = new Set(rs.filter((r) => r.scope === sc).map((r) => r.value))
        if (v.size > 1)
          err(`areas.yaml: ячейка ${c.id} (${layer}, ${sc}): несколько основных значений ${[...v].join(' / ')}`)
      }
    }
  const names: Record<string, string> = {
    religion: 'религии',
    language: 'языки',
    currency: 'валюты',
    guild: 'сферы гильдий',
  }
  return AREA_LAYERS.map((l) => {
    const s = summary(f, l, cells)
    return `слой ${names[l]} (areas.yaml): записей ${s.records}, ячеек с данными ${s.filled} из ${cells.length}, значений ${s.legend.length}, без данных ${cells.length - s.filled}`
  })
}
export { resolveCell }
