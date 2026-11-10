// Проверка data/relations.yaml, data/geo/sunny-islands-inset.yaml, data/illior-scheme.yaml: ссылки на людей/места/страницы, обязательные поля.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'

export const REL_TYPES = ['родство', 'брак', 'союз', 'вражда', 'покровительство', 'служба', 'betrayal']
type Ctx = { dir: string; people: Set<string>; places: Set<string>; pages: Record<string, unknown> }
const CONF = ['canon', 'derived', 'speculative']

export function checkGraph({ dir, people, places, pages }: Ctx) {
  const errors: string[] = [],
    stat: string[] = []
  const err = (m: string) => errors.push(m)
  const src = (who: string, s: unknown) => {
    if (!Array.isArray(s) || !s.length) err(`${who}: нет sources`)
    else
      for (const x of s)
        if (typeof x !== 'string' || !(x.startsWith('map:') || x in pages))
          err(`${who}: источник «${x}» не найден в pages.json`)
  }
  const load = (p: string) => {
    const f = join(dir, p)
    if (!existsSync(f)) {
      err(`${f}: файла нет`)
      return null
    }
    try {
      return parse(readFileSync(f, 'utf8'))
    } catch (e) {
      err(`${f}: не YAML — ${(e as Error).message}`)
      return null
    }
  }

  const rels = load('relations.yaml')
  if (rels) {
    const seen = new Set<string>(),
      per: Record<string, number> = {},
      nodes = new Set<string>()
    if (!Array.isArray(rels)) err('relations.yaml: ожидается список')
    else
      rels.forEach((r: any, i: number) => {
        const who = `relations[${i}] ${r?.a}→${r?.b}`
        if (!people.has(r.a)) err(`${who}: нет человека «${r.a}»`)
        if (!people.has(r.b)) err(`${who}: нет человека «${r.b}»`)
        if (r.a === r.b) err(`${who}: связь с самим собой`)
        if (!REL_TYPES.includes(r.type)) err(`${who}: тип «${r.type}» не из ${REL_TYPES.join('|')}`)
        if (!r.note) err(`${who}: нет note`)
        if (!CONF.includes(r.confidence)) err(`${who}: confidence`)
        src(who, r.sources)
        const k = [r.a, r.b].sort().join('|') + '|' + r.type
        if (seen.has(k)) err(`${who}: дубль связи`)
        seen.add(k)
        per[r.type] = (per[r.type] ?? 0) + 1
        nodes.add(r.a)
        nodes.add(r.b)
      })
    stat.push(
      `связей ${rels.length} (${REL_TYPES.map((t) => `${t} ${per[t] ?? 0}`).join(', ')}), персонажей в графе ${nodes.size}`,
    )
  }

  const ins = load('geo/sunny-islands-inset.yaml')
  if (ins) {
    let isl = 0
    const frame = ins.meta?.frame ?? { w: 0, h: 0 },
      inFrame = (x: number, y: number) => x >= 0 && y >= 0 && x <= frame.w && y <= frame.h
    src('inset.meta', ins.meta?.sources)
    if (ins.meta?.shape_confidence !== 'speculative' || ins.meta?.composition_confidence !== 'canon')
      err('inset.meta: форма — speculative, состав — canon')
    for (const id of ins.sea_route?.from ?? []) if (!places.has(id)) err(`inset.sea_route: место «${id}» не найдено`)
    for (const h of ins.holdings ?? []) {
      const who = `inset.holding ${h.id}`
      if (!places.has(h.place)) err(`${who}: место «${h.place}» не найдено`)
      src(who, h.sources)
      if (!Array.isArray(h.polygon) || h.polygon.length < 3) err(`${who}: полигон < 3 точек`)
      else for (const [x, y] of h.polygon) if (!inFrame(x, y)) err(`${who}: точка вне кадра врезки`)
      for (const i of h.islands ?? []) {
        isl++
        if (!places.has(i.place)) err(`${who}: остров «${i.name}» — место «${i.place}» не найдено`)
        if (!inFrame(i.x, i.y)) err(`${who}: остров «${i.name}» вне кадра`)
      }
    }
    for (const i of ins.independent ?? []) {
      isl++
      if (!places.has(i.place)) err(`inset.independent «${i.name}»: место «${i.place}» не найдено`)
      src(`inset.independent ${i.id}`, i.sources)
    }
    stat.push(
      `врезка Солнечных островов: владений ${ins.holdings?.length ?? 0}, островов на схеме ${isl}, без положения ${ins.unplaced_islands?.names?.length ?? 0}`,
    )
  }

  const sc = load('illior-scheme.yaml')
  if (sc) {
    const dist = new Set<string>((sc.districts ?? []).map((d: any) => d.id)),
      f = sc.meta?.frame ?? { w: 0, h: 0 }
    for (const d of sc.districts ?? []) {
      src(`scheme.district ${d.id}`, d.sources)
      if (d.place && !places.has(d.place)) err(`scheme.district ${d.id}: место «${d.place}» не найдено`)
      if (d.x < 0 || d.y < 0 || d.x + d.w > f.w || d.y + d.h > f.h) err(`scheme.district ${d.id}: вне кадра`)
    }
    for (const b of sc.bridges ?? []) src(`scheme.bridge ${b.id}`, b.sources)
    const kinds: Record<string, number> = {}
    for (const v of sc.venues ?? []) {
      src(`scheme.venue ${v.id}`, v.sources)
      if (v.district && !dist.has(v.district)) err(`scheme.venue ${v.id}: район «${v.district}» не найден`)
      if (!['tavern', 'inn', 'brothel', 'bank', 'school'].includes(v.kind)) err(`scheme.venue ${v.id}: kind`)
      if (!['cheap', 'mid', 'mid-dear', 'dear', 'none'].includes(v.price)) err(`scheme.venue ${v.id}: price`)
      kinds[v.kind] = (kinds[v.kind] ?? 0) + 1
    }
    stat.push(
      `схема Иллиора: районов ${dist.size}, мостов ${sc.bridges?.length ?? 0}, заведений ${sc.venues?.length ?? 0} (${Object.entries(
        kinds,
      )
        .map(([k, n]) => `${k} ${n}`)
        .join(', ')})`,
    )
  }
  return { errors, stat }
}
