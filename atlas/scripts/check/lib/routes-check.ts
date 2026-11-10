// Проверка data/routes.yaml: схема, места и потоки резолвятся, геометрия есть и концами совпадает с местами, походы датированы, прямые — не выше derived.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { ROUTE_KINDS, RoutesFile } from '../../../src/data/schema'

export function checkRoutes(
  dir: string,
  pages: Record<string, unknown>,
  err: (m: string) => void,
  places: Set<string>,
  flowIds: Set<string>,
): string[] {
  const p = join(dir, 'routes.yaml'),
    gp = join(dir, 'geo/routes.geojson')
  if (!existsSync(p) || !existsSync(gp)) {
    err(`${p} или ${gp}: файла нет (python3 scripts/geo/build-routes.py)`)
    return []
  }
  const r = RoutesFile.safeParse(parse(readFileSync(p, 'utf8')))
  if (!r.success) {
    for (const i of r.error.issues.slice(0, 15)) err(`routes.yaml [${i.path.join('.')}]: ${i.message}`)
    return []
  }
  const geo = new Map<string, any>(JSON.parse(readFileSync(gp, 'utf8')).features.map((f: any) => [f.properties.id, f]))
  const seen = new Set<string>()
  for (const x of r.data) {
    const who = `routes.yaml [${x.id}]`
    if (seen.has(x.id)) err(`${who}: id повторяется`)
    seen.add(x.id)
    for (const pl of [x.from, x.to, ...(x.via ?? [])]) if (!places.has(pl)) err(`${who}: место «${pl}» не найдено`)
    for (const f of x.flows) if (!flowIds.has(f)) err(`${who}: поток «${f}» не найден в flows.yaml`)
    for (const s of x.sources)
      if (!(s.startsWith('map:') || s in pages)) err(`${who}: источник «${s}» — нет в data/site/pages.json`)
    const g = geo.get(x.id)
    if (!g || g.geometry.coordinates.length < 2) err(`${who}: нет геометрии в routes.geojson`)
    if (x.geom === 'straight' && x.confidence === 'canon') err(`${who}: прямая линия не может быть canon`)
    if (x.kind === 'campaign' && (x.year_from === null || x.year_to === null || x.year_to < x.year_from))
      err(`${who}: поход без корректных дат`)
    if (x.kind !== 'campaign' && x.year_from !== null) err(`${who}: даты только у походов`)
  }
  for (const id of geo.keys()) if (!seen.has(id)) err(`routes.geojson: «${id}» нет в routes.yaml`)
  const by = ROUTE_KINDS.map((k) => `${k} ${r.data.filter((x) => x.kind === k).length}`).join(', ')
  const st = r.data.filter((x) => x.geom === 'straight').length
  const yrs = r.data.filter((x) => x.kind === 'campaign').map((x) => x.year_from!)
  return [
    `маршруты (routes.yaml): ${r.data.length} — ${by}; по дорогам/рекам/морю ${r.data.length - st}, прямых (пунктир) ${st}; походы датированы ${Math.min(...yrs)}–${Math.max(...yrs)}`,
  ]
}
