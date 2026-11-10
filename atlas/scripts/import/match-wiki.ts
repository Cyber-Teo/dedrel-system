// pnpm tsx scripts/import/match-wiki.ts — сопоставление мест с вики: slug по заголовку страницы, варианты написания
// (расстояние Левенштейна ≤ 2) → aliases, слияние «только на карте» geo:* с одноимённым местом реестра без координат.
// Пишет data/places.yaml, docs/research/gazetteer-wiki-match.md, дописывает новые расхождения в docs/errata.md.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { parse, stringify } from 'yaml'
import { kscore, levenshtein, normName, wildcardMatch } from '../lib/names'

type Place = Record<string, any> & { id: string; name: string; kind: string; sources: string[]; aliases?: string[] }
const MAP_SRC = 'map:газеттир'
const raw = readFileSync('data/places.yaml', 'utf8')
const head =
  raw
    .split('\n')
    .filter((l) => l.startsWith('#'))
    .join('\n') + '\n'
let places: Place[] = parse(raw)
const pages: Record<string, { title: string }> = JSON.parse(readFileSync('data/site/pages.json', 'utf8'))
const gz: { name: string; alt: string | null; x: number; y: number }[] = JSON.parse(
  readFileSync('data/raw/map/gazetteer_v2.json', 'utf8'),
)
const errata = readFileSync('docs/errata.md', 'utf8')

const GEO_PAGE = /^(countries|geography)\//
const STRIP_WORD = /^(?:королевство|княжество|республика|город|префектура|регион|земли|страна)\s+/
const stripWord = (k: string) => k.replace(STRIP_WORD, '')
const hasXY = (p: Place) => p.x !== undefined
const mapOnly = (p: Place) => p.sources.length === 1 && p.sources[0] === MAP_SRC
const log = {
  slug: [] as string[],
  fuzzySlug: [] as string[],
  merged: [] as string[],
  dup: [] as string[],
  variants: [] as { map: string; wiki: string; slug?: string; d: number }[],
}

// --- 1. fuzzy-слияние: «только на карте» ↔ место реестра без координат
const keys = (p: Place) => [p.name, ...(p.aliases ?? []).flatMap((a) => a.split(' / '))].map(normName).filter(Boolean)
// пары из docs/errata.md: на карте один значок, вики называет по-разному
const CURATED: [string, string][] = [
  ['аселенора', 'имрелон'],
  ['королевская гавань', 'королевская бухта'],
]
const isCurated = (a: string, b: string) => CURATED.some(([x, y]) => (a === x && b === y) || (a === y && b === x))
const sim = (a: string, b: string) => {
  if (isCurated(a, b)) return 0
  const d = Math.min(levenshtein(a, b), levenshtein(stripWord(a), stripWord(b)))
  const lim = Math.min(a.length, b.length) >= 6 ? 2 : Math.min(a.length, b.length) >= 4 ? 1 : 0
  return d <= lim ? d : 99
}
const removed = new Set<string>()
for (const g of places.filter(mapOnly)) {
  const gk = keys(g)
  const cands = places
    .filter((p) => p !== g && !hasXY(p) && !removed.has(p.id) && kscore(g.kind, p.kind) > 0)
    .map((p) => ({ p, d: Math.min(...gk.flatMap((a) => keys(p).map((b) => sim(a, b)))) }))
    .filter((c) => c.d <= 2)
    .sort(
      (a, b) =>
        a.d - b.d || kscore(g.kind, b.p.kind) - kscore(g.kind, a.p.kind) || (b.p.slug ? 1 : 0) - (a.p.slug ? 1 : 0),
    )
  if (!cands.length) continue
  const t = cands[0].p
  if (
    cands.length > 1 &&
    cands[1].d === cands[0].d &&
    kscore(g.kind, cands[1].p.kind) === kscore(g.kind, t.kind) &&
    !!cands[1].p.slug === !!t.slug
  ) {
    log.dup.push(
      `«${g.name}» — неоднозначно: ${cands
        .filter((c) => c.d === cands[0].d)
        .map((c) => c.p.id)
        .join(' | ')}; не слито`,
    )
    continue
  }
  const al = new Set((t.aliases ?? []).map(normName))
  al.add(normName(t.name))
  const add = [g.name, ...(g.aliases ?? [])].filter((a) => !al.has(normName(a)) && !a.includes('?'))
  Object.assign(t, { x: g.x, y: g.y, symbol: g.symbol, pos_confidence: g.pos_confidence })
  if (add.length) t.aliases = [...(t.aliases ?? []), ...add]
  if (!t.sources.includes(MAP_SRC)) t.sources = [...t.sources, MAP_SRC]
  removed.add(g.id)
  log.merged.push(
    `«${g.name}» (карта) → «${t.name}» \`${t.id}\`, d=${cands[0].d}${cands[0].d ? '' : ' (после снятия префикса)'}`,
  )
  if (cands[0].d > 0 || normName(g.name) !== normName(t.name))
    log.variants.push({ map: g.name, wiki: t.name, slug: t.slug, d: cands[0].d })
}
places = places.filter((p) => !removed.has(p.id))
// близнецы реестра (оба из вики, id не удаляем — на них ссылаются события): координаты — обоим, написание — в aliases
const TWINS: [string, string][] = [['камераска', 'камераски']]
for (const [a, b] of TWINS) {
  const pa = places.find((p) => normName(p.name) === a),
    pb = places.find((p) => normName(p.name) === b)
  if (!pa || !pb) continue
  const [src, dst] = hasXY(pa) && !hasXY(pb) ? [pa, pb] : hasXY(pb) && !hasXY(pa) ? [pb, pa] : [undefined, undefined]
  if (!src || !dst) continue
  Object.assign(dst, { x: src.x, y: src.y, symbol: src.symbol, pos_confidence: src.pos_confidence })
  dst.aliases = [...new Set([...(dst.aliases ?? []), src.name])]
  src.aliases = [...new Set([...(src.aliases ?? []), dst.name])]
  if (!dst.sources.includes(MAP_SRC)) dst.sources = [...dst.sources, MAP_SRC]
  log.merged.push(
    `близнецы: «${src.name}» \`${src.id}\` и «${dst.name}» \`${dst.id}\` — один значок, координаты скопированы (дубль реестра, id сохранены)`,
  )
  log.variants.push({ map: src.name, wiki: dst.name, slug: dst.slug, d: levenshtein(a, b) })
}

// --- 2. slug по заголовку страницы вики
const titleIdx = new Map<string, string[]>()
for (const [slug, pg] of Object.entries(pages)) {
  if (!GEO_PAGE.test(slug) || /^(countries|geography)\/index$/.test(slug)) continue
  for (const k of new Set([normName(pg.title), stripWord(normName(pg.title))])) {
    if (!k) continue
    titleIdx.set(k, [...(titleIdx.get(k) ?? []), slug])
  }
}
const slugOwner = new Map<string, Place>()
for (const p of places) if (p.slug) slugOwner.set(p.slug, p)
for (const pass of ['exact', 'fuzzy'] as const)
  for (const p of places) {
    if (p.slug) continue
    const ks = new Set(keys(p).flatMap((k) => [k, stripWord(k)]))
    let hit: string[] = [...new Set([...ks].flatMap((k) => titleIdx.get(k) ?? []))]
    let fuzzy = false
    if (pass === 'exact' && !hit.length) continue
    if (pass === 'fuzzy' && (hit.length || !p.sources.includes(MAP_SRC))) continue
    if (pass === 'fuzzy') {
      // варианты написания ≤ 2 — только для мест с положением
      const near: { s: string; d: number }[] = []
      for (const [k, slugs] of titleIdx)
        for (const q of ks) {
          const d = sim(q, k)
          if (d > 0 && d <= 2) for (const s of slugs) near.push({ s, d })
        }
      if (near.length) {
        const m = Math.min(...near.map((n) => n.d))
        hit = [...new Set(near.filter((n) => n.d === m).map((n) => n.s))]
        fuzzy = true
      }
    }
    if (hit.length > 1) {
      const sameKind = hit.filter((s) => slugOwner.get(s) === undefined)
      hit = sameKind.length ? sameKind : hit
    }
    if (hit.length !== 1) continue
    const slug = hit[0],
      owner = slugOwner.get(slug)
    if (owner && owner !== p) {
      log.dup.push(
        `«${p.name}» \`${p.id}\` и «${owner.name}» \`${owner.id}\` — обе указывают на страницу ${slug}; slug не проставлен`,
      )
      continue
    }
    if (!(slug in pages)) continue
    p.slug = slug
    slugOwner.set(slug, p)
    const title = pages[slug].title
    if (!p.sources.includes(slug)) p.sources = [slug, ...p.sources]
    ;(fuzzy ? log.fuzzySlug : log.slug).push(`«${p.name}» \`${p.id}\` → ${slug} («${title}»)`)
    if (fuzzy)
      log.variants.push({ map: p.name, wiki: title, slug, d: Math.min(...[...ks].map((q) => sim(q, normName(title)))) })
  }

// --- 3. охват подписей растра
const alive = places.filter(hasXY)
const idxName = new Map<string, Place[]>()
for (const p of alive) for (const k of keys(p)) idxName.set(k, [...(idxName.get(k) ?? []), p])
const cls: Record<string, number> = { slug: 0, registry: 0, geo: 0, unreadable: 0 }
const unmapped: string[] = []
for (const g of gz) {
  const ks = [normName(g.name), normName(g.alt ?? '')].filter(Boolean)
  let ps = ks.flatMap((k) => idxName.get(k) ?? [])
  if (!ps.length) {
    const pats = ks.filter((k) => k.includes('?') && k.replace(/[?\s]/g, '').length >= 4)
    ps = pats.flatMap((pt) => [...idxName].filter(([k]) => wildcardMatch(pt, k)).flatMap(([, v]) => v))
  }
  if (!ps.length) {
    cls.unreadable++
    unmapped.push(`«${g.name}» (${g.x}, ${g.y})`)
    continue
  }
  if (ps.some((p) => p.slug)) cls.slug++
  else if (ps.some((p) => !p.id.startsWith('geo:'))) cls.registry++
  else cls.geo++
}
const ok = cls.slug + cls.registry + cls.geo
const pct = ((100 * ok) / gz.length).toFixed(1)

writeFileSync('data/places.yaml', head + stringify(places, { lineWidth: 0 }))

// --- errata: новые расхождения написания (которых ещё нет в docs/errata.md)
const norm = (s: string) => normName(s)
const eraNorm = errata.toLowerCase().replace(/ё/g, 'е').replace(/[­]/g, '')
const newVar = log.variants
  .filter((v) => v.d > 0)
  .filter((v) => !(eraNorm.includes(norm(v.map)) && eraNorm.includes(norm(v.wiki))))
if (newVar.length) {
  appendFileSync(
    'docs/errata.md',
    '\n' +
      newVar
        .map(
          (v) =>
            `- **low** — Название на карте и в вики: на карте «${v.map}», в вики/реестре «${v.wiki}»${v.d ? ` (расстояние ${v.d})` : ''}. Положение — по карте, написание — по вики.\n  - источники: ${v.slug ? v.slug + ', ' : ''}газеттир\n  - предложение: Автору подтвердить правильное написание; до ответа в данных оба варианта (aliases).`,
        )
        .join('\n') +
      '\n',
  )
}

const rep = `# Газеттир ↔ вики: сопоставление

Скрипт: \`scripts/import/match-wiki.ts\`. Страниц вики: ${Object.keys(pages).length}.

## Охват подписей растра
- подписей: ${gz.length}
- сопоставлено с местом, у которого есть slug вики: ${cls.slug}
- сопоставлено с местом реестра без страницы вики: ${cls.registry}
- явно geo:* (есть на карте, в тексте вики не названы): ${cls.geo}
- не сопоставлено (нечитаемые/усечённые «?»): ${cls.unreadable}
- итого сопоставлено: ${ok} из ${gz.length} = ${pct}%

## Слияния «только на карте» с местом реестра (варианты написания, Левенштейн ≤ 2)
${log.merged.map((s) => '- ' + s).join('\n') || '—'}

## slug проставлен по заголовку страницы
${log.slug.map((s) => '- ' + s).join('\n') || '—'}

## slug проставлен по близкому заголовку (≤ 2, проверить)
${log.fuzzySlug.map((s) => '- ' + s).join('\n') || '—'}

## Неоднозначности и дубли реестра (не тронуты)
${log.dup.map((s) => '- ' + s).join('\n') || '—'}

## Новые расхождения, дописанные в docs/errata.md
${newVar.map((v) => `- на карте «${v.map}» / вики «${v.wiki}»`).join('\n') || '—'}

## Подписи без места
${unmapped.map((s) => '- ' + s).join('\n') || '—'}
`
writeFileSync('docs/research/gazetteer-wiki-match.md', rep)
console.log(
  `подписей ${gz.length}: со slug ${cls.slug}, реестр без страницы ${cls.registry}, geo:* ${cls.geo}, не сопоставлено ${cls.unreadable} → ${ok}/${gz.length} = ${pct}%`,
)
console.log(
  `слито ${log.merged.length}, slug по заголовку ${log.slug.length} (+${log.fuzzySlug.length} по близкому), неоднозначных ${log.dup.length}, в errata дописано ${newVar.length}`,
)
