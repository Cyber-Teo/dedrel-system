// Сборка реестра: docs/research/lore/*.json + chronicle.json → data/{places,people,orgs,events,flows}.yaml
// Запуск: tsx scripts/import/build-registry.ts [--force]. Файлы перезаписываются только с --force (дальше их правят руками).
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { stringify } from 'yaml'

type R = Record<string, any>
const pages: Record<string, { title: string }> = JSON.parse(readFileSync('data/site/pages.json', 'utf8'))
const lore = readdirSync('docs/research/lore')
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync('docs/research/lore/' + f, 'utf8')) as R)
const chronicle: R = JSON.parse(readFileSync('docs/research/chronicle.json', 'utf8'))

const OUT = ['places', 'people', 'orgs', 'events', 'flows'].map((n) => `data/${n}.yaml`)
if (!process.argv.includes('--force') && OUT.some(existsSync)) {
  console.error('data/*.yaml уже есть; --force перезапишет (потеряются ручные правки)')
  process.exit(1)
}

// ---------- утилиты ----------
const TR: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
}
const translit = (s: string) =>
  s
    .toLowerCase()
    .replace(/[а-яё]/g, (c) => TR[c])
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
const squash = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
const stripParens = (s: string) => s.replace(/\s*\([^)]*\)/g, '').trim()
const parens = (s: string) => [...s.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim())
const ORG_TYPEWORDS = /^(гильдия|община|орден|церковь|клан|армия|банк|школа|университет|культ|союз|легион)$/i
const hasInference = (r: R) =>
  Object.values(r).some(
    (v) =>
      (typeof v === 'string' && /вывод:/i.test(v)) ||
      (Array.isArray(v) && v.some((x) => typeof x === 'string' && /вывод:/i.test(x))),
  )
const uniq = <T>(a: T[]) => [...new Set(a)]
const sourceRaw = (r: R): string[] =>
  (Array.isArray(r.sources) ? r.sources : String(r.source ?? '').split(/;\s*/)).filter(Boolean)

const unresolvedSources = new Set<string>()
const allSlugs = Object.keys(pages)
function resolveSource(s: string): string | null {
  if (s in pages) return s
  const tail = s.split('/').pop()!
  const c = allSlugs.filter((x) => x.endsWith('/' + tail))
  if (c.length === 1) return c[0]
  unresolvedSources.add(s)
  return null
}
const sourcesOf = (r: R) =>
  uniq(
    sourceRaw(r)
      .map(resolveSource)
      .filter((x): x is string => !!x),
  )

// ---------- сопоставление с вики ----------
const titleFull = new Map<string, string[]>(),
  titleBase = new Map<string, string[]>()
for (const [slug, p] of Object.entries(pages)) {
  if (slug.startsWith('rules/')) continue
  for (const [m, k] of [
    [titleFull, squash(p.title)],
    [titleBase, squash(stripParens(p.title))],
  ] as const)
    (m.get(k) ?? m.set(k, []).get(k)!).push(slug)
}
const PREF: Record<string, string[]> = {
  places: ['countries/', 'geography/', 'establishments/', 'guilds/', 'history/'],
  people: ['characters/'],
  orgs: ['guilds/', 'countries/', 'knowledges/', 'establishments/'],
}
function wikiSlug(type: string, key: string, loose: boolean): string | undefined {
  const cand = [...(titleFull.get(key) ?? []), ...(loose ? (titleBase.get(key) ?? []) : [])]
  for (const pre of PREF[type]) {
    const hit = cand.filter((s) => s.startsWith(pre)).sort((a, b) => a.length - b.length)[0]
    if (hit) return hit
  }
}

// ---------- группировка ----------
type G = {
  type: string
  name: string
  names: string[]
  aliases: Set<string>
  keys: Set<string>
  recs: R[]
  sources: string[]
  derived: boolean[]
}
function group(type: 'places' | 'people' | 'orgs', recs: R[]): G[] {
  const byKey = new Map<string, G>()
  const groups: G[] = []
  for (const r of recs) {
    const raw = String(r.name).trim()
    const parts = raw.split(/\s+\/\s+/)
    const first = parts[0]
    const aliases = new Set<string>(parts.slice(1))
    let keyName = first
    if (type !== 'places') {
      keyName = stripParens(first)
      for (const p of parens(first)) {
        const t = p.replace(/[«»"]/g, '').trim()
        if (/^[«"]?\p{Lu}/u.test(p) && t.length <= 40 && !/\d|,/.test(t)) aliases.add(t)
        else if (type === 'orgs' && ORG_TYPEWORDS.test(t)) {
          /* тип орг. не различает */
        } else keyName = first // строчная пометка («император», «слухи») различает записи
      }
    }
    const key = squash(keyName)
    let g = byKey.get(key)
    if (!g) {
      g = {
        type,
        name: keyName,
        names: [],
        aliases: new Set(),
        keys: new Set([key]),
        recs: [],
        sources: [],
        derived: [],
      }
      byKey.set(key, g)
      groups.push(g)
    }
    if (raw !== g.name) g.aliases.add(raw)
    for (const a of aliases) g.aliases.add(a)
    g.recs.push(r)
    g.sources.push(...sourcesOf(r))
    g.derived.push(hasInference(r))
  }
  // слияние по алиасам: ключ одной группы == алиас другой
  const merged: G[] = []
  const idx = new Map<string, G>()
  for (const g of groups) idx.set(squash(g.name), g)
  const parent = new Map<G, G>()
  const find = (g: G): G => (parent.has(g) ? find(parent.get(g)!) : g)
  for (const g of groups)
    for (const a of g.aliases) {
      const o = idx.get(squash(a))
      if (o && find(o) !== find(g)) parent.set(find(o), find(g))
    }
  for (const g of groups) {
    const root = find(g)
    if (root === g) {
      merged.push(g)
      continue
    }
    root.recs.push(...g.recs)
    root.sources.push(...g.sources)
    root.derived.push(...g.derived)
    g.aliases.forEach((a) => root.aliases.add(a))
    root.aliases.add(g.name)
  }
  for (const g of merged) {
    g.aliases.delete(g.name)
    g.sources = uniq(g.sources)
  }
  return merged
}

const lc = (k: string) => lore.flatMap((d) => (d[k] ?? []) as R[])
const used = new Set<string>()
function mkId(g: G, prefix: string): { id: string; slug?: string } {
  const key = squash(g.name)
  const slug = wikiSlug(g.type, key, g.type !== 'places')
  let id = slug && !used.has(slug) ? slug : `${prefix}:${translit(g.name) || 'x'}`
  if (used.has(id)) {
    let n = 2
    while (used.has(`${id}-${n}`)) n++
    id = `${id}-${n}`
  }
  used.add(id)
  return { id, slug }
}
const first = (g: G, f: string) =>
  g.recs.map((r) => r[f]).find((v) => typeof v === 'string' && v.trim() && v.trim() !== '—')
const conf = (g: G) => (g.derived.some((d) => !d) ? 'canon' : 'derived')
const altOf = (g: G, f: string, label: string, chosen?: string) =>
  uniq(g.recs.filter((r) => r[f] && r[f] !== chosen && String(r[f]).trim()).map((r) => `${label}: ${r[f]}`)).map(
    (text) => ({ text, sources: uniq(g.recs.filter((r) => `${label}: ${r[f]}` === text).flatMap(sourcesOf)) }),
  )

// ---------- места ----------
const placeGroups = group('places', lc('places'))
const placeByKey = new Map<string, any>()
const places: R[] = placeGroups.map((g) => {
  const { id, slug } = mkId(g, 'geo')
  const kind = first(g, 'kind') ?? 'other'
  const rec = {
    id,
    name: g.name,
    kind,
    symbol: kind,
    aliases: [...g.aliases],
    slug,
    parent: undefined as string | undefined,
    parent_text: first(g, 'parent') as string | undefined,
    hint: first(g, 'location_hint'),
    facts:
      g.recs
        .map((r) => r.facts)
        .filter(Boolean)
        .join(' | ') || undefined,
    sources: g.sources,
    confidence: conf(g),
    visibility: 'public',
    alt: [...altOf(g, 'kind', 'тип', kind), ...altOf(g, 'parent', 'родитель', first(g, 'parent'))],
  }
  placeByKey.set(squash(g.name), rec)
  for (const a of g.aliases) if (!placeByKey.has(squash(a))) placeByKey.set(squash(a), rec)
  return rec
})
const baseIdx = new Map<string, any[]>()
for (const p of places)
  (
    baseIdx.get(squash(stripParens(p.name))) ??
    baseIdx.set(squash(stripParens(p.name)), []).get(squash(stripParens(p.name)))!
  ).push(p)
const findPlace = (name: string) =>
  placeByKey.get(squash(name)) ??
  (baseIdx.get(squash(stripParens(name)))?.length === 1 ? baseIdx.get(squash(stripParens(name)))![0] : undefined)
for (const p of places) {
  const par = p.parent_text && findPlace(p.parent_text)
  if (par && par.id !== p.id) {
    p.parent = par.id
    delete p.parent_text
  }
}

// ---------- люди, организации ----------
const mk = (type: 'people' | 'orgs', prefix: string, fields: string[], extra: (g: G) => R) =>
  group(type, lc(type)).map((g) => {
    const { id, slug } = mkId(g, prefix)
    const rec: R = { id, name: g.name, aliases: [...g.aliases], slug, ...extra(g) }
    for (const f of fields) rec[f] = first(g, f)
    rec.sources = g.sources
    rec.confidence = conf(g)
    rec.visibility = 'public'
    return rec
  })
const people = mk('people', 'person', ['role', 'affiliation', 'based_in', 'years', 'notable', 'relations'], (g) => ({
  alt: altOf(g, 'role', 'роль', first(g, 'role')),
}))
const orgGroups = group('orgs', lc('orgs'))
const orgs: R[] = orgGroups.map((g) => {
  const { id, slug } = mkId(g, 'org')
  const kinds = uniq(g.recs.map((r) => r.kind).filter(Boolean))
  const kind = kinds.find((k) => /гильд|guild/i.test(k)) ?? kinds[0]
  return {
    id,
    name: g.name,
    aliases: [...g.aliases],
    slug,
    kind,
    hq: first(g, 'hq'),
    leader: first(g, 'leader'),
    presence: first(g, 'presence'),
    influence: first(g, 'influence'),
    sources: g.sources,
    confidence: conf(g),
    visibility: 'public',
    alt: altOf(g, 'kind', 'тип', kind),
  }
})
const actorIdx = new Map<string, string>()
for (const r of [...orgs, ...people]) {
  actorIdx.set(squash(r.name), r.id)
  for (const a of r.aliases) if (!actorIdx.has(squash(a))) actorIdx.set(squash(a), r.id)
}

// ---------- события ----------
const MONTHS = 'январ|феврал|март|апрел|ма[яй]|июн|июл|август|сентябр|октябр|ноябр|декабр'
function precision(t: string): string {
  if (/≈|~|около|примерно|прибл|веке?\b|неизвестн/i.test(t)) return 'approx'
  if (new RegExp(`\\d{1,2}\\s+(${MONTHS})|\\d{1,2}\\.\\d{1,2}\\.\\d{2,4}`, 'i').test(t)) return 'day'
  if (new RegExp(MONTHS, 'i').test(t)) return 'month'
  if (/\d0-[хе]\b|десятилет/i.test(t)) return 'decade'
  return 'year'
}
const evRaw: R[] = [...(chronicle.chronology as R[]), ...lc('events')]
const events: R[] = []
const evKey = new Map<string, R>()
const stubs: R[] = []
const unresolvedActors = new Set<string>()
function placeId(name: string, ev: R, derived: boolean): string {
  let p = findPlace(name)
  if (!p) {
    const id0 = `geo:${translit(name) || 'x'}`
    let id = id0,
      n = 2
    while (used.has(id)) id = `${id0}-${n++}`
    used.add(id)
    p = {
      id,
      name,
      kind: 'other',
      symbol: 'other',
      aliases: [],
      sources: sourcesOf(ev),
      confidence: derived ? 'derived' : 'canon',
      visibility: 'public',
      alt: [],
      stub_from_event: true,
    }
    stubs.push(p)
    places.push(p)
    placeByKey.set(squash(name), p)
  }
  return p.id
}
for (const r of evRaw) {
  const key = `${r.year}|${squash(r.title)}`
  const derived = hasInference(r)
  let e = evKey.get(key)
  if (!e) {
    const yt = r.year_text ? String(r.year_text) : ''
    e = {
      id: '',
      year: r.year ?? null,
      date_precision: r.year == null ? 'approx' : precision(yt),
      date_text: yt || undefined,
      title: r.title,
      type: r.type,
      description: r.description,
      places: [],
      actors: [],
      territorial_change: undefined,
      sources: [],
      confidence: derived ? 'derived' : 'canon',
      visibility: 'public',
      alt: [],
      _d: [],
    }
    evKey.set(key, e)
    events.push(e)
  }
  e._d.push(derived)
  e.description ??= r.description
  e.territorial_change ??= r.territorial_change
  e.sources = uniq([...e.sources, ...sourcesOf(r)])
  e.places = uniq([...e.places, ...((r.places ?? []) as string[]).map((n) => placeId(n, r, derived))])
  for (const a of (r.actors ?? []) as string[]) {
    const id = actorIdx.get(squash(a)) ?? actorIdx.get(squash(stripParens(a)))
    if (!id) unresolvedActors.add(a)
    if (!e.actors.some((x: R) => x.name === a)) e.actors.push(id ? { name: a, id } : { name: a })
  }
}
events.sort((a, b) => (a.year ?? 1e9) - (b.year ?? 1e9))
for (const e of events) {
  e.confidence = e._d.some((d: boolean) => !d) ? 'canon' : 'derived'
  delete e._d
  let id = `ev:${e.year ?? 'x'}:${translit(e.title).slice(0, 36)}`,
    n = 2
  const base = id
  while (used.has(id)) id = `${base}-${n++}`
  used.add(id)
  e.id = id
}

// ---------- потоки ----------
const flowKeys = new Map<string, R>()
for (const r of lc('flows')) {
  const k = [r.kind, r.what, r.from, r.to].map((x) => squash(String(x ?? ''))).join('|')
  const f = flowKeys.get(k)
  if (f) {
    f.sources = uniq([...f.sources, ...sourcesOf(r)])
    continue
  }
  const id = `flow:${translit(r.kind)}-${createHash('sha1').update(k).digest('hex').slice(0, 6)}`
  flowKeys.set(k, {
    id,
    kind: r.kind,
    what: r.what,
    from: r.from,
    to: r.to,
    sources: sourcesOf(r),
    confidence: hasInference(r) ? 'derived' : 'canon',
    visibility: 'public',
    alt: [],
  })
}
const flows = [...flowKeys.values()]

// ---------- запись ----------
const strip = (o: R): R =>
  Object.fromEntries(
    Object.entries(o).filter(
      ([k, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length) && k !== 'stub_from_event',
    ),
  )
const HEAD = (what: string) =>
  `# ${what}. Собрано scripts/import/build-registry.ts из docs/research (lore/*.json, chronicle.json); дальше правится вручную.\n# Положение — по карте (x,y придут из газеттира), факты — по тексту вики.\n`
const dump = (file: string, what: string, rows: R[]) =>
  writeFileSync(`data/${file}.yaml`, HEAD(what) + stringify(rows.map(strip), { lineWidth: 0 }))
dump('places', 'Места', places)
dump('people', 'Люди', people)
dump('orgs', 'Организации', orgs)
dump('events', 'События', events)
dump('flows', 'Потоки', flows)

// ---------- отчёт ----------
const dupL = (gs: G[]) =>
  gs
    .filter((g) => g.recs.length > 1)
    .sort((a, b) => b.recs.length - a.recs.length)
    .map((g) => `- ${g.name} ×${g.recs.length}${g.aliases.size ? ` (алиасы: ${[...g.aliases].join('; ')})` : ''}`)
const near = [...baseIdx.entries()]
  .filter(([, v]) => v.length > 1)
  .map(([k, v]) => `- ${k}: ${v.map((p) => p.name).join(' | ')}`)
const rawN = (k: string) => lc(k).length
const report = `# Отчёт реестра (scripts/import/build-registry.ts)

| тип | в выжимках | уникальных |
|---|---|---|
| места | ${rawN('places')} | ${places.length - stubs.length} (+${stubs.length} из событий без записи в местах) |
| люди | ${rawN('people')} | ${people.length} |
| организации | ${rawN('orgs')} | ${orgs.length} |
| события | ${rawN('events')} + ${(chronicle.chronology as R[]).length} хроника | ${events.length} |
| потоки | ${rawN('flows')} | ${flows.length} |

Слияние: по нормализованному имени (ё→е, регистр, знаки) и алиасам; места различаются с учётом пометки в скобках («Старый город (Иллиор)»).
Уверенность записи: canon, если хотя бы одна склеенная выжимка без «вывод:»; иначе derived.
id = slug вики (страница с тем же названием), иначе geo:/person:/org: + транслит. С slug вики: мест ${places.filter((p) => p.slug).length}, людей ${people.filter((p) => p.slug).length}, орг. ${orgs.filter((p) => p.slug).length}.
Не охвачено: dynasties_and_rulers хроники (правители) и polities выжимок — отдельные сущности, не в этой задаче.

## Источники, не найденные в вики (${unresolvedSources.size})
${[...unresolvedSources].map((s) => `- ${s}`).join('\n') || '—'}

## Склеенные места (${dupL(placeGroups).length})
${dupL(placeGroups).join('\n')}

## Склеенные люди (${dupL(group('people', lc('people'))).length})
${dupL(group('people', lc('people'))).join('\n')}

## Склеенные организации (${dupL(orgGroups).length})
${dupL(orgGroups).join('\n')}

## Возможные дубли мест: одно имя без скобок, разные пометки (не склеены, проверить вручную) (${near.length})
${near.join('\n')}

## Места, созданные заглушками из событий (${stubs.length}); без координат, kind=other
${stubs.map((p) => `- ${p.name}`).join('\n')}

## Действующие лица событий без записи среди людей/орг. (${unresolvedActors.size}); остались текстом
${[...unresolvedActors]
  .sort()
  .map((a) => `- ${a}`)
  .join('\n')}
`
writeFileSync('docs/research/registry-report.md', report)
console.log(
  `registry: мест ${places.length} (заглушек ${stubs.length}), людей ${people.length}, орг. ${orgs.length}, событий ${events.length}, потоков ${flows.length}`,
)
