// pnpm tsx scripts/import/merge-gazetteer.ts [gazetteer.json] — вливает газеттир двойного чтения в data/places.yaml
// и пишет docs/research/gazetteer-report.md. Идемпотентен: повторный прогон ничего не дублирует.
import { readFileSync, writeFileSync } from 'node:fs'
import { parse, stringify } from 'yaml'
import { cls, kscore, normName, wildcardMatch } from '../lib/names'

type Gz = {
  name: string
  alt: string | null
  symbol: string
  kind: string
  x: number
  y: number
  tile: string
  confidence?: 'high' | 'medium' | 'low'
  arbitrated?: boolean
}
type Place = Record<string, any> & { id: string; name: string; kind: string; sources: string[]; aliases?: string[] }

const SRC = process.argv[2] ?? 'data/raw/map/gazetteer_v2.json'
const MAP_SRC = 'map:газеттир'
const DUP_PX = 250 // подписи одного имени ближе этого — перекрытие тайлов, один и тот же значок
const gz: Gz[] = JSON.parse(readFileSync(SRC, 'utf8'))
const raw = readFileSync('data/places.yaml', 'utf8')
const head =
  raw
    .split('\n')
    .filter((l) => l.startsWith('#'))
    .join('\n') + '\n'
const places: Place[] = parse(raw)

const rank = (g: Gz) => (g.confidence === 'low' ? 0 : g.confidence === 'medium' ? 1 : 2)
const posConf = (g: Gz): 'high' | 'medium' | 'low' => g.confidence ?? 'high' // оба прочтения совпали — high
const clean = (s: string) => s.replace(/[\u00ad\u200b]/g, '').trim()
const isPort = (g: Gz) => /\(порт\)\s*$/.test(g.name)
const dist = (a: Gz, b: Gz) => Math.hypot(a.x - b.x, a.y - b.y)

// --- индекс реестра: нормализованное имя/алиас → места
const idx = new Map<string, Place[]>()
const add = (k: string, p: Place) => {
  if (!k) return
  const a = idx.get(k) ?? []
  if (!a.includes(p)) a.push(p)
  idx.set(k, a)
}
for (const p of places) {
  add(normName(p.name), p)
  for (const al of p.aliases ?? []) for (const part of al.split(' / ')) add(normName(part), p)
}

// --- имена целиком известны: из газеттира, реестра — для разбора усечённых «?»
const known = new Set<string>(
  [...idx.keys(), ...gz.map((g) => normName(g.name)), ...gz.map((g) => normName(g.alt ?? ''))].filter(
    (k) => k && !k.includes('?'),
  ),
)
const resolveQ = (g: Gz): string | null => {
  const pats = [normName(g.name), normName(g.alt ?? '')].filter(
    (k) => k.includes('?') && k.replace(/[?\s]/g, '').length >= 4,
  )
  for (const pat of pats) {
    const c = [...known].filter((k) => wildcardMatch(pat, k))
    if (c.length === 1) return c[0]
  }
  return null
}

// --- группировка подписей в «места»
type Grp = { key: string; port: boolean; items: Gz[]; unresolved: boolean }
const groups: Grp[] = []
const unreadable: Gz[] = []
for (const g of gz) {
  let base = normName(g.name)
  if (base.includes('?')) {
    const r = resolveQ(g)
    if (!r) {
      unreadable.push(g)
      continue
    }
    base = r
  } else if (!base && g.alt) base = normName(g.alt)
  if (!base) {
    unreadable.push(g)
    continue
  }
  const port = isPort(g)
  // порт рядом с одноимённым не-портом — один значок
  let grp = groups.find(
    (x) =>
      x.key === base &&
      x.port === port &&
      cls(x.items[0].kind) === cls(g.kind) &&
      x.items.some((i) => dist(i, g) < DUP_PX),
  )
  if (!grp && port)
    grp = groups.find(
      (x) =>
        x.key === base && !x.port && cls(x.items[0].kind) === cls(g.kind) && x.items.some((i) => dist(i, g) < DUP_PX),
    )
  if (!grp && !port) {
    const pg = groups.find(
      (x) =>
        x.key === base && x.port && cls(x.items[0].kind) === cls(g.kind) && x.items.some((i) => dist(i, g) < DUP_PX),
    )
    if (pg) {
      pg.port = false
      grp = pg
    }
  }
  if (!grp) groups.push((grp = { key: base, port, items: [], unresolved: false }))
  grp.items.push(g)
}
for (const grp of groups) grp.items.sort((a, b) => rank(b) - rank(a) || (b.arbitrated ? 1 : 0) - (a.arbitrated ? 1 : 0))

// --- транслитерация для id geo:*
const TR: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
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
  х: 'kh',
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
const used = new Set(places.map((p) => p.id))
const mkId = (name: string) => {
  const base =
    'geo:' +
    normName(name)
      .split('')
      .map((c) => TR[c] ?? (/[a-z0-9]/.test(c) ? c : '_'))
      .join('')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
  let id = base,
    n = 2
  while (used.has(id)) id = `${base}_${n++}`
  used.add(id)
  return id
}
const KIND: Record<string, string> = { country_label: 'country', other: 'other' }

// --- слияние
const stat = { matched: 0, created: 0, ambiguous: [] as string[], multi: [] as string[], aliasAdded: 0 }
const matchedIds = new Set<string>()
const createdIds: string[] = []
const lines = { matched: [] as string[], created: [] as string[] }
for (const grp of groups) {
  const g = grp.items[0]
  const label = clean(g.name).replace(/\s*\(порт\)$/, '')
  const alt = g.alt ? clean(g.alt) : null
  let cands = idx.get(grp.key) ?? []
  if (grp.port && cands.length > 1) {
    const pc = cands.filter((p) => p.kind === 'port')
    if (pc.length) cands = pc
  }
  if (grp.port) {
    const pc = idx.get(normName('порт ' + label)) ?? []
    if (pc.length && !cands.some((p) => p.kind === 'port')) cands = pc
  }
  let pl: Place | undefined
  let secondary = false
  if (cands.length > 1) stat.ambiguous.push(`${label} → ${cands.map((c) => c.id).join(' | ')}`)
  if (cands.length) {
    const sc = (c: Place) => kscore(g.kind, c.kind) * 10 + (c.slug ? 1 : 0)
    const free = cands.filter((c) => !matchedIds.has(c.id)).sort((a, b) => sc(b) - sc(a))
    const taken = cands.filter((c) => matchedIds.has(c.id) && kscore(g.kind, c.kind) >= 2)
    if (free.length && (kscore(g.kind, free[0].kind) > 0 || !taken.length)) pl = free[0]
    else if (taken.length) {
      secondary = true
      pl = taken[0]
    } else pl = free[0]
  }
  if (grp.items.length > 1) {
    const far = grp.items.filter((i) => dist(i, g) >= DUP_PX)
    if (far.length)
      stat.multi.push(`${label}: основная (${g.x}, ${g.y}) + ещё ${far.map((i) => `(${i.x}, ${i.y})`).join(', ')}`)
  }
  const readings = new Set<string>()
  readings.add(normName(label))
  const extra: string[] = []
  const tryAlias = (s: string | null) => {
    if (!s) return
    const c = clean(s)
    if (c.includes('?') || readings.has(normName(c))) return
    readings.add(normName(c))
    extra.push(c)
  }
  if (pl && secondary) {
    stat.multi.push(`${label}: вторая подпись (${g.x}, ${g.y}, ${g.kind}) к уже размеченному ${pl.id}; не записана`)
    continue
  }
  if (pl) {
    for (const k of [pl.name, ...(pl.aliases ?? [])]) readings.add(normName(k))
    tryAlias(alt)
    for (const i of grp.items.slice(1)) tryAlias(i.alt)
    Object.assign(pl, { x: g.x, y: g.y, symbol: g.symbol, pos_confidence: posConf(g) })
    if (extra.length) {
      pl.aliases = [...(pl.aliases ?? []), ...extra]
      stat.aliasAdded += extra.length
    }
    if (!pl.sources.includes(MAP_SRC)) pl.sources = [...pl.sources, MAP_SRC]
    stat.matched++
    matchedIds.add(pl.id)
    lines.matched.push(`${label} → ${pl.id}${pl.slug ? ' [slug]' : ''}`)
  } else {
    const id = mkId(grp.port ? label + ' порт' : label)
    const np: Place = {
      id,
      name: grp.port ? `${label} (порт)` : label,
      kind: grp.port ? 'port' : (KIND[g.kind] ?? g.kind),
      symbol: g.symbol,
      x: g.x,
      y: g.y,
      pos_confidence: posConf(g),
    } as unknown as Place
    tryAlias(alt)
    if (extra.length) np.aliases = extra
    Object.assign(np, { sources: [MAP_SRC], confidence: 'canon', visibility: 'public', alt: [] })
    places.push(np)
    createdIds.push(id)
    stat.created++
    lines.created.push(`${np.name} → ${id} (${np.kind}, ${posConf(g)})`)
  }
}

// ключи в стабильном порядке: новые поля сразу после kind/symbol
writeFileSync('data/places.yaml', head + stringify(places, { lineWidth: 0 }))

// --- отчёт
const withXY = places.filter((p) => p.x !== undefined)
const noXY = places.filter((p) => p.x === undefined)
const wikiNoXY = noXY.filter((p) => !p.id.startsWith('geo:'))
const conf = { high: 0, medium: 0, low: 0 }
for (const g of gz) conf[posConf(g)]++
const rep = `# Газеттир → реестр: отчёт слияния

Источник: \`${SRC}\` (двойное чтение, ${gz.length} подписей). Скрипт: \`scripts/import/merge-gazetteer.ts\`. Положение — по карте (правило владельца).

## Итог
- подписей растра: ${gz.length} (уверенность: high ${conf.high}, medium ${conf.medium}, low ${conf.low})
- нечитаемых подписей без имени (остаются «?», мест не создают): ${unreadable.length}
- уникальных мест на карте (после слияния дублей из перекрытия тайлов): ${groups.length}
- совпало с местом реестра: ${stat.matched}
- новых мест geo:* (есть на карте, нет в реестре): ${stat.created}
- мест реестра без координат (не найдены на карте): ${noXY.length}, из них из вики/хроники (не geo:*): ${wikiNoXY.length}
- мест с координатами: ${withXY.length} из ${places.length}
- добавлено вариантов написания в aliases: ${stat.aliasAdded}

## Нечитаемые подписи (остаются «?»)
${unreadable.map((g) => `- «${clean(g.name)}» / «${g.alt ?? '—'}» (${g.x}, ${g.y}), тайл ${g.tile}, ${posConf(g)}`).join('\n') || '—'}

## Неоднозначные совпадения имён (выбор: вид, затем slug; дубли реестра остаются без координат)
${stat.ambiguous.map((s) => '- ' + s).join('\n') || '—'}

## Одно имя в разных местах карты (взята самая уверенная подпись)
${stat.multi.map((s) => '- ' + s).join('\n') || '—'}

## Новые места geo:*
${lines.created.map((s) => '- ' + s).join('\n') || '—'}

## Места реестра без координат (из вики/хроники)
${wikiNoXY.map((p) => `- ${p.name} — \`${p.id}\`${p.slug ? ' [slug]' : ''}`).join('\n') || '—'}

## Места geo:* без координат
${
  noXY
    .filter((p) => p.id.startsWith('geo:'))
    .map((p) => `- ${p.name} — \`${p.id}\``)
    .join('\n') || '—'
}
`
writeFileSync('docs/research/gazetteer-report.md', rep)
console.log(
  `газеттир ${gz.length} подписей → мест на карте ${groups.length}: совпало ${stat.matched}, новых geo:* ${stat.created}, нечитаемых ${unreadable.length}; реестр без координат ${noXY.length} (вики/хроника ${wikiNoXY.length}); неоднозначных ${stat.ambiguous.length}`,
)
