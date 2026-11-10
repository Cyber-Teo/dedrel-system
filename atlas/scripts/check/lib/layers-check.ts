// Проверка слоёв: data/layers.yaml + точечные файлы слоёв (схемы, ссылки на места/орг./людей/страницы вики) и сводка по слоям.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { LayerRecords, LayersFile } from '../../../src/data/schema'
import { build, type Raw } from '../../../src/layers/buildRaw'
import { AREA_LAYER_IDS } from '../../../src/layers/areaData'
const FLOW_LAYER_IDS = new Set(['trade-routes', 'slavery', 'campaigns', 'world-miniatures'])

export const FILES: Record<Exclude<keyof Raw, 'states' | 'miniatures'>, string> = {
  layers: 'layers.yaml',
  places: 'places.yaml',
  orgs: 'orgs.yaml',
  people: 'people.yaml',
  military: 'military.yaml',
  fortressDates: 'fortress-dates.yaml',
  religion: 'religion.yaml',
  hazards: 'hazards.yaml',
  magic: 'magic.yaml',
  resources: 'resources.yaml',
  guildHq: 'guild-hq.yaml',
  peopleLoc: 'people-loc.yaml',
  anchors: 'anchors.yaml',
}
export const readRaw = (dir: string): Raw => ({
  ...(Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, readFileSync(join(dir, f), 'utf8')])) as Raw),
  miniatures: existsSync(join(dir, 'miniatures.yaml')) ? readFileSync(join(dir, 'miniatures.yaml'), 'utf8') : undefined,
  states: existsSync(join(dir, 'geo/states-1006.geojson'))
    ? readFileSync(join(dir, 'geo/states-1006.geojson'), 'utf8')
    : undefined,
})

export function checkLayers(dir: string, pages: Record<string, unknown>, err: (m: string) => void): string[] {
  const lines: string[] = []
  for (const f of Object.values(FILES))
    if (!existsSync(join(dir, f))) {
      err(`${join(dir, f)}: файла нет`)
      return lines
    }
  const raw = readRaw(dir)
  const reg = LayersFile.safeParse(parse(raw.layers))
  if (!reg.success) {
    for (const i of reg.error.issues) err(`layers.yaml ${i.path.join('.')}: ${i.message}`)
    return lines
  }
  const groups = new Set(reg.data.groups.map((g) => g.id)),
    seen = new Set<string>()
  for (const l of reg.data.layers) {
    if (seen.has(l.id)) err(`layers.yaml: id «${l.id}» повторяется`)
    seen.add(l.id)
    if (!groups.has(l.group)) err(`layers.yaml [${l.id}]: группа «${l.group}» не объявлена`)
    if (l.status === 'ready' && !l.data) err(`layers.yaml [${l.id}]: готовый слой без data`)
    if (l.status === 'ready' && (!l.icon || !l.color)) err(`layers.yaml [${l.id}]: готовому слою нужны icon и color`)
  }
  if (reg.data.layers.length !== 63) err(`layers.yaml: слоёв ${reg.data.layers.length}, ожидается 63`)
  const places = new Set((parse(raw.places) as any[]).map((p) => p.id)),
    orgs = new Set((parse(raw.orgs) as any[]).map((p) => p.id)),
    people = new Set((parse(raw.people) as any[]).map((p) => p.id))
  const srcOk = (who: string, s: string) => {
    if (!(s.startsWith('map:') || s in pages)) err(`${who}: источник «${s}» — нет в data/site/pages.json`)
  }
  const ids = new Set<string>()
  for (const [k, schema] of Object.entries(LayerRecords)) {
    const key = k as keyof typeof LayerRecords
    const rows = parse(raw[key]) as any[]
    if (!Array.isArray(rows)) {
      err(`${FILES[key]}: ожидается список`)
      continue
    }
    rows.forEach((rec, i) => {
      const who = `${FILES[key]} [${rec?.id ?? rec?.ref ?? rec?.place ?? '#' + i}]`
      const r = schema.safeParse(rec)
      if (!r.success) {
        for (const is of r.error.issues) err(`${who} поле «${is.path.join('.') || '—'}»: ${is.message}`)
        return
      }
      const d = r.data as any
      if (d.id && key !== 'anchors') {
        if (ids.has(d.id)) err(`${who}: id повторяется`)
        ids.add(d.id)
      }
      for (const f of ['place', 'xy_place', 'anchor'] as const)
        if (d[f] && !places.has(d[f])) err(`${who}: ${f} «${d[f]}» нет среди мест`)
      if (key === 'guildHq' && !orgs.has(d.ref)) err(`${who}: организация не найдена`)
      if (key === 'peopleLoc' && !people.has(d.ref)) err(`${who}: персонаж не найден`)
      for (const s of d.sources ?? []) srcOk(who, s)
    })
  }
  // сводка по слоям
  const b = build(raw)
  for (const l of b.layers.filter(
    (x) => x.status === 'ready' && x.id !== 'events' && !AREA_LAYER_IDS[x.id] && !FLOW_LAYER_IDS.has(x.id),
  )) {
    // площадные и потоковые слои проверяются в areas-check / routes-check
    const n = b.objs.get(l.id)!.length,
      m = b.missing.get(l.id)!.length
    const ap = b.objs.get(l.id)!.filter((o) => o.approx).length
    lines.push(`слой ${l.id}: на карте ${n} (приблизительно ${ap}), без координат ${m}`)
    if (n === 0) err(`слой ${l.id}: на карте 0 объектов`)
  }
  return lines
}
