// pnpm validate [dir] — схемы zod + ссылки + slug вики. Выход 1 при ошибках.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { MAP_H, MAP_W, LandscapeFile, OwnersFile, schemas, type Kind } from '../../src/data/schema'
import { checkCells } from './lib/cells-check'
import { checkCapitals, checkCollection, type Capital, type Poly } from './lib/geo-check'
import { checkLayers } from './lib/layers-check'
import { checkAreas } from './lib/areas-check'
import { checkRoutes } from './lib/routes-check'
import { checkScenarios } from './lib/scenarios-check'
import { checkGraph } from './lib/graph-check'
import { checkService } from './lib/service-check'

const dir = process.argv[2] ?? 'data'
const FILES: Record<Kind, string> = {
  places: 'places.yaml',
  events: 'events.yaml',
  people: 'people.yaml',
  orgs: 'orgs.yaml',
  flows: 'flows.yaml',
}
const errors: string[] = []
const warns: string[] = []
const err = (m: string) => errors.push(m)

const pagesPath = join(dir, 'site/pages.json')
const pages: Record<string, unknown> = existsSync(pagesPath) ? JSON.parse(readFileSync(pagesPath, 'utf8')) : {}
if (!existsSync(pagesPath)) err(`${pagesPath}: нет снимка вики, сначала pnpm sync`)

const data: Partial<Record<Kind, any[]>> = {}
for (const kind of Object.keys(FILES) as Kind[]) {
  const path = join(dir, FILES[kind])
  const mpath = join(dir, 'master', FILES[kind]) // мастерские записи: data/master/*.yaml
  if (!existsSync(path)) {
    if (['places', 'events', 'people', 'orgs', 'flows'].includes(kind)) err(`${path}: файла нет`)
    continue
  }
  let raw: any[]
  try {
    raw = parse(readFileSync(path, 'utf8'))
  } catch (e) {
    err(`${path}: не YAML — ${(e as Error).message}`)
    continue
  }
  if (!Array.isArray(raw)) {
    err(`${path}: ожидается список записей`)
    continue
  }
  for (const r of raw as { visibility?: string; id?: string }[])
    if (r?.visibility === 'master')
      err(`${path} [${r.id}]: visibility master должен лежать в ${mpath}, не в публичном файле`)
  if (existsSync(mpath)) {
    try {
      const m = parse(readFileSync(mpath, 'utf8')) as { visibility?: string; id?: string }[] | null
      for (const r of m ?? []) {
        if (r?.visibility !== 'master') err(`${mpath} [${r?.id}]: в data/master нужна visibility: master`)
      }
      raw = [...raw, ...(m ?? [])]
    } catch (e) {
      err(`${mpath}: не YAML — ${(e as Error).message}`)
    }
  }
  data[kind] = []
  raw.forEach((rec, i) => {
    const r = schemas[kind].safeParse(rec)
    if (r.success) data[kind]!.push(r.data)
    else {
      const id = (rec as { id?: string })?.id ?? `#${i}`
      for (const is of r.error.issues) err(`${path} [${id}] поле «${is.path.join('.') || '—'}»: ${is.message}`)
    }
  })
}

// уникальность id по всем файлам
const owner = new Map<string, Kind>()
for (const kind of Object.keys(data) as Kind[])
  for (const r of data[kind]!) {
    if (owner.has(r.id)) err(`id «${r.id}» повторяется (${owner.get(r.id)} и ${kind})`)
    else owner.set(r.id, kind)
  }
const ids = (k: Kind) => new Set((data[k] ?? []).map((r) => r.id))
const placeIds = ids('places'),
  personOrg = new Set([...ids('people'), ...ids('orgs')])

const srcOk = (who: string, s: string) => {
  if (s.startsWith('map:')) return
  if (!(s in pages)) err(`${who}: источник «${s}» — нет такой страницы в data/site/pages.json`)
}
for (const kind of Object.keys(data) as Kind[])
  for (const r of data[kind]!) {
    const who = `${kind}/${r.id}`
    for (const s of r.sources) srcOk(who, s)
    for (const a of r.alt) for (const s of a.sources) srcOk(who, s)
    if (r.slug && !(r.slug in pages)) err(`${who}: slug «${r.slug}» не найден в data/site/pages.json`)
  }
for (const p of data.places ?? []) {
  if (p.parent && !placeIds.has(p.parent)) err(`places/${p.id}: parent «${p.parent}» не найден среди мест`)
  if ((p.x === undefined) !== (p.y === undefined)) err(`places/${p.id}: x и y задаются вместе`)
}
for (const e of data.events ?? []) {
  for (const pl of e.places) if (!placeIds.has(pl)) err(`events/${e.id}: место «${pl}» не найдено`)
  for (const h of [...(e.territorial_change?.gains ?? []), ...(e.territorial_change?.losses ?? [])])
    for (const pl of h.places)
      if (!placeIds.has(pl)) err(`events/${e.id}: territorial_change «${h.polity}»: место «${pl}» не найдено`)
  for (const a of e.actors)
    if (a.id && !personOrg.has(a.id)) err(`events/${e.id}: действующее лицо «${a.id}» не найдено среди людей/орг.`)
}

// ---------- геоданные: data/geo/*-1006.geojson ----------
const geoStat: string[] = []
let cellIdsGeo = new Set<string>()
{
  const placeById = new Map((data.places ?? []).map((p: any) => [p.id as string, p]))
  const zonesPath = join(dir, 'zones.yaml')
  const zones: { id: string; place?: string; sources?: string[]; confidence?: string }[] = existsSync(zonesPath)
    ? parse(readFileSync(zonesPath, 'utf8'))
    : []
  for (const z of zones) {
    if (!z.sources?.length || !z.confidence) err(`${zonesPath}: «${z.id}» без sources/confidence`)
    if (z.place && !placeById.has(z.place)) err(`${zonesPath}: «${z.id}»: место «${z.place}» не найдено`)
  }
  const zoneIds = new Set(zones.map((z) => z.id))
  const resolves = (id: string) => placeById.has(id) || id in pages || zoneIds.has(id)
  const sourceOk = (s: string) =>
    s.startsWith('map:') || s.startsWith('frames:') || s.startsWith('gazetteer-') || s in pages || placeById.has(s)
  const states = new Map<string, Poly[]>(),
    regions = new Map<string, Poly[]>()
  for (const [name, into] of [
    ['states-1006.geojson', states],
    ['regions-1006.geojson', regions],
  ] as const) {
    const path = join(dir, 'geo', name)
    if (!existsSync(path)) {
      err(`${path}: файла нет`)
      continue
    }
    let fc: unknown
    try {
      fc = JSON.parse(readFileSync(path, 'utf8'))
    } catch (e) {
      err(`${path}: не JSON — ${(e as Error).message}`)
      continue
    }
    for (const m of checkCollection(fc, { file: path, resolves, sourceOk, w: MAP_W, h: MAP_H }, into)) err(m)
    geoStat.push(`${name}: ${into.size}`)
    // регионы: parent-государство должно иметь полигон
    if (into === regions)
      for (const f of (fc as any).features ?? []) {
        const par = f?.properties?.parent
        if (par && states.size && !states.has(par))
          err(`${path}: «${f.properties.id}» parent «${par}» без полигона в states-1006.geojson`)
      }
    // собственная столица государства (capital_px) внутри своего полигона
    if (into === states)
      for (const f of (fc as any).features ?? []) {
        const cp = f?.properties?.capital_px,
          id = f?.properties?.id
        // capital_px — производное свойство геопакета (другой исполнитель), поэтому лишь предупреждение; места-столицы ниже — ошибки
        if (cp && states.has(id))
          for (const m of checkCapitals(
            [{ place: `(capital_px «${id}»)`, state: id, at: cp, why: 'свойство capital_px' }],
            states,
            path,
          ))
            warns.push(m)
      }
  }
  // мозаика ячеек data/geo/cells.geojson
  {
    const cp = join(dir, 'geo/cells.geojson'),
      lp = join(dir, 'geo/land.geojson')
    if (existsSync(cp) && existsSync(lp)) {
      const fc = JSON.parse(readFileSync(cp, 'utf8')),
        land: Poly[] = []
      for (const f of JSON.parse(readFileSync(lp, 'utf8')).features)
        land.push(...(f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates))
      const cells = new Map<string, { polys: Poly[]; state: string }>(),
        seen = new Set<string>()
      for (const f of fc.features ?? []) {
        const p = f.properties ?? {},
          id = p.id
        if (typeof id !== 'string' || !/^cell:\d+$/.test(id)) {
          err(`${cp}: id «${id}» не вида cell:<n>`)
          continue
        }
        if (seen.has(id)) err(`${cp}: id «${id}» повторяется`)
        seen.add(id)
        if (!p.name || !p.state_1006 || typeof p.area_km2 !== 'number' || !Array.isArray(p.centroid))
          err(`${cp}: «${id}» без name/state_1006/area_km2/centroid`)
        if (
          !Array.isArray(p.sources) ||
          !p.sources.length ||
          !['canon', 'derived', 'speculative'].includes(p.confidence)
        )
          err(`${cp}: «${id}» без sources/confidence`)
        if (p.region && !regions.has(p.region)) err(`${cp}: «${id}» region «${p.region}» нет в regions-1006`)
        cells.set(id, {
          polys: f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates,
          state: p.state_1006,
        })
      }
      const r = checkCells(cells, land, states, MAP_W, MAP_H)
      for (const m of r.errors) err(m)
      geoStat.push(r.stat)
      cellIdsGeo = new Set(cells.keys())
    } else warns.push(`${cp}: нет ячеек`)
  }
  // data/history/owners.yaml: у каждой ячейки есть запись, polity резолвятся, годы строго по возрастанию
  {
    const op = join(dir, 'history/owners.yaml')
    if (existsSync(op)) {
      let raw: unknown
      try {
        raw = parse(readFileSync(op, 'utf8'))
      } catch (e) {
        err(`${op}: не YAML — ${(e as Error).message}`)
      }
      const r = OwnersFile.safeParse(raw)
      if (raw !== undefined && !r.success)
        for (const is of r.error.issues.slice(0, 20)) err(`${op} [${is.path.join('.')}]: ${is.message}`)
      if (r.success) {
        const o = r.data
        let runs = 0,
          nil = 0
        for (const id of cellIdsGeo) if (!o.cells[id]) err(`${op}: у ячейки «${id}» нет записи`)
        for (const [id, rs] of Object.entries(o.cells)) {
          if (cellIdsGeo.size && !cellIdsGeo.has(id)) err(`${op}: ячейка «${id}» не найдена в cells.geojson`)
          rs.forEach(([y, pid, , src], i) => {
            runs++
            if (pid === null && i === rs.length - 1) nil++
            if (i && y <= rs[i - 1][0]) err(`${op}: «${id}»: годы не по возрастанию (${rs[i - 1][0]} → ${y})`)
            if (pid !== null && !o.polities[pid]) err(`${op}: «${id}», ${y}: polity «${pid}» не описан в polities`)
            for (const s of src) if (!sourceOk(s)) err(`${op}: «${id}», ${y}: источник «${s}» неизвестен`)
          })
        }
        // все ячейки начинаются с одного и того же года (первого опорного кадра реконструкции)
        const firstYears = new Set(Object.values(o.cells).map((rs) => rs[0][0]))
        if (firstYears.size > 1)
          err(`${op}: ячейки начинаются в разные годы: ${[...firstYears].sort((x, y) => x - y).join(', ')}`)
        for (const pid of Object.keys(o.polities))
          if (states.size && !/^(hist|new):/.test(pid) && !states.has(pid))
            warns.push(`${op}: polity «${pid}» нет среди государств states-1006`)
        geoStat.push(
          `owners: ячеек ${Object.keys(o.cells).length}, записей ${runs}, государств ${Object.keys(o.polities).length}, без владельца сейчас ${nil}`,
        )
      }
    } else warns.push(`${op}: файла нет`)
  }
  // data/history/landscape.yaml: геометрия резолвится, событие есть, год не расходится с событием больше чем на 10 лет
  {
    const lp = join(dir, 'history/landscape.yaml')
    if (existsSync(lp)) {
      let raw: unknown
      try {
        raw = parse(readFileSync(lp, 'utf8'))
      } catch (e) {
        err(`${lp}: не YAML — ${(e as Error).message.split('\n')[0]}`)
      }
      const r = LandscapeFile.safeParse(raw)
      if (!r.success) {
        if (raw !== undefined)
          for (const is of r.error.issues.slice(0, 20)) err(`${lp} [${is.path.join('.')}]: ${is.message}`)
      } else {
        const geom = new Set<string>()
        for (const f of ['terrain.geojson', 'inner-sea.geojson', 'cells.geojson']) {
          const p = join(dir, 'geo', f)
          if (existsSync(p)) for (const ft of JSON.parse(readFileSync(p, 'utf8')).features) geom.add(ft.properties.id)
        }
        const evById = new Map((data.events ?? []).map((e: any) => [e.id as string, e]))
        const ids = new Set<string>()
        for (const it of r.data) {
          if (ids.has(it.id)) err(`${lp}: id «${it.id}» повторяется`)
          ids.add(it.id)
          for (const g of it.geometry)
            if (!geom.has(g)) err(`${lp}: «${it.id}»: полигон «${g}» не найден в terrain/inner-sea`)
          for (const s of it.sources) if (!sourceOk(s)) err(`${lp}: «${it.id}»: источник «${s}» неизвестен`)
          if (it.event) {
            const e: any = evById.get(it.event)
            if (!e) err(`${lp}: «${it.id}»: событие «${it.event}» не найдено`)
            else if (e.year != null && Math.abs(e.year - it.absent_before) > 10)
              err(`${lp}: «${it.id}»: год ${it.absent_before} расходится с событием (${e.year}) больше чем на 10 лет`)
          }
        }
        geoStat.push(`landscape: ${r.data.length} объектов`)
      }
    } else warns.push(`${lp}: файла нет`)
  }
  // territorial_change.polity_id — государство с полигоном
  for (const e of data.events ?? [])
    for (const h of [...(e.territorial_change?.gains ?? []), ...(e.territorial_change?.losses ?? [])])
      if (h.polity_id && states.size && !states.has(h.polity_id))
        err(
          `events/${e.id}: territorial_change «${h.polity}»: polity_id «${h.polity_id}» нет среди государств states-1006.geojson`,
        )
  // столицы мест
  const capPath = join(dir, 'capitals.yaml')
  const caps: Capital[] = []
  if (existsSync(capPath)) {
    const list = parse(readFileSync(capPath, 'utf8')) as {
      place: string
      state: string
      sources?: string[]
      confidence?: string
    }[]
    for (const c of list) {
      const p: any = placeById.get(c.place)
      if (!p) {
        err(`${capPath}: место «${c.place}» не найдено`)
        continue
      }
      if (!c.sources?.length || !c.confidence) err(`${capPath}: «${c.place}» без sources/confidence`)
      if (!states.has(c.state) && states.size) err(`${capPath}: «${c.place}»: у государства «${c.state}» нет полигона`)
      if (p.x === undefined) {
        err(`${capPath}: у столицы «${c.place}» нет координат`)
        continue
      }
      caps.push({ place: c.place, state: c.state, at: [p.x, p.y], why: 'capitals.yaml' })
    }
    const listed = new Set(list.map((c) => c.place))
    for (const p of data.places ?? [])
      if (p.symbol === 'capital_star' && p.x !== undefined && !listed.has(p.id))
        err(`places/${p.id}: значок столицы (capital_star), но нет в ${capPath} — неизвестно, чья это столица`)
  } else err(`${capPath}: файла нет`)
  for (const m of checkCapitals(caps, states, 'data/geo')) err(m)
  geoStat.push(`столиц проверено: ${caps.length}`)
}

checkScenarios(dir, pages, err)
const layerStat = [
  ...checkLayers(dir, pages, err),
  ...checkAreas(dir, pages, err),
  ...checkRoutes(dir, pages, err, placeIds, ids('flows')),
]

for (const m of checkService(data as any)) err(m)
const n = (k: Kind) => data[k]?.length ?? 0
const noXY = (data.places ?? []).filter((p) => p.x === undefined).length
// гильдия: тип «гильдия/guild» или запись из раздела вики guilds/ (кроме общей страницы и знати/госорганов)
const guilds = (data.orgs ?? []).filter(
  (o) =>
    /гильд|guild/i.test(o.kind ?? '') ||
    (o.sources.some((s: string) => s.startsWith('guilds/') && s !== 'guilds/index') &&
      !/знать|госорган/.test(o.kind ?? '')),
).length
const graphRes = checkGraph({ dir, people: ids('people'), places: placeIds, pages })
for (const m of graphRes.errors) err(m)
console.log(
  `validate ${dir}: мест ${n('places')} (без координат ${noXY}), событий ${n('events')}, людей ${n('people')}, организаций ${n('orgs')} (гильдий ${guilds}), потоков ${n('flows')}`,
)
const evs = data.events ?? []
const vis = (v: string) => evs.filter((e) => e.visibility === v).length
const tc = evs.filter((e) => e.territorial_change)
for (const l of graphRes.stat) console.log(l)
console.log(`геоданные: ${geoStat.join(', ')}`)
for (const l of layerStat) console.log(l)
console.log(
  `события: public ${vis('public')}, master ${vis('master')}, campaign ${evs.filter((e) => e.campaign).length}; с territorial_change ${tc.length} (структурно ${tc.filter((e) => e.territorial_change.gains.length || e.territorial_change.losses.length).length} из ${tc.length}); с alt ${evs.filter((e) => e.alt.length).length}`,
)
for (const w of warns) console.log('ПРЕДУПРЕЖДЕНИЕ: ' + w)
if (errors.length) {
  console.log(`ОШИБОК: ${errors.length}`)
  for (const e of errors.slice(0, 30)) console.log('  ' + e)
  if (errors.length > 30) console.log(`  … ещё ${errors.length - 30}`)
  process.exit(1)
}
console.log('ОШИБОК: 0')
