// Сборка data/history/owners.yaml: опорные кадры docs/research/owners-reconstruction.json (by_state по state_1006 ячейки,
// перекрытый overrides) + записи 1006 из текущего owners.yaml. Подряд идущие одинаковые записи схлопываются.
// «нет сведений» = polity null + confidence null (источники, если есть, — откуда это известно); «ничья/пустая земля» = polity null с confidence и sources.
// Запуск: ./node_modules/.bin/tsx scripts/import/build-owners.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { parse, stringify } from 'yaml'

type Conf = 'canon' | 'derived' | 'speculative' | null
type Run = [number, string | null, Conf, string[]]
type Rec = { polity: string | null; confidence: string; sources: string[] }
type Frame = {
  year: number
  by_state: (Rec & { state_1006: string })[]
  overrides: (Rec & { cell: string | number; note?: string })[]
}

// Цвета исторических государств: приглушённые, у преемников — оттенок цвета наследника из 1006 (см. комментарии).
const HIST: Record<string, string> = {
  'hist:025': '#77703a',
  'hist:027': '#a39a4a', // Иллиор -> Иллиорский союз -> империя #8b8240
  'hist:007': '#6c97c4', // Вышневодск -> Вышневодское княжество #5f8fbf
  'hist:047': '#7f93a6',
  'hist:048': '#5e7080', // Союз Свободных -> Побережье работорговцев #6d7f8f
  'hist:042': '#a3a37f',
  'hist:043': '#85856a', // Префектура мертвецов -> Арност #9a9a7a
  'hist:019': '#b05a50',
  'hist:020': '#98403a', // Драконы -> Страна драконов #a8483f
  'hist:017': '#6e3b4b',
  'hist:018': '#82485a',
  'hist:003': '#9a5a6a',
  'new:asmodiyskiy_soyuz': '#8f5568',
  'hist:010': '#8c6070', // демоны/Асмодей -> Плато Архидемона #7a4a5a
  'hist:054': '#b49ad0', // Феи
  'hist:056': '#b07f9c',
  'hist:011': '#8c6279', // Эльфы, Дагор -> Этель #a3748f
  'hist:039': '#c9b27a',
  'hist:055': '#d6c28f', // Первые люди
  'hist:004': '#a8794a',
  'hist:015': '#7e9a62',
  'hist:012': '#5a9aaa',
  'hist:037': '#c0905f',
  'hist:045': '#b8708a',
  'hist:050': '#6fa0b8',
  'hist:052': '#9a6f4f',
  'hist:035': '#c8b07a',
  'new:aendo': '#4f9aa8',
  'new:bredon': '#b38a5a',
  'new:garn': '#4a7aa0',
  'new:krivoy_lior': '#9a7a50',
  'new:valmir': '#7a9a5a',
  'new:zakatnaya_buhta': '#5a8a9a',
  'new:zalesye_tribes': '#789a45', // племена Залесья -> Залесское #8fae52
}

const rec = JSON.parse(readFileSync('docs/research/owners-reconstruction.json', 'utf8')) as {
  frames: Frame[]
  new_polities: { id: string; name: string }[]
}
const registry = new Map(
  (JSON.parse(readFileSync('docs/research/polity-registry.json', 'utf8')) as { id: string; name: string }[]).map(
    (r) => [r.id, r.name],
  ),
)
for (const p of rec.new_polities) registry.set(p.id, p.name)
const cur = parse(readFileSync('data/history/owners.yaml', 'utf8')) as {
  polities: Record<string, { name: string; color: string }>
  cells: Record<string, Run[]>
}
const geo = JSON.parse(readFileSync('data/geo/cells.geojson', 'utf8')) as {
  features: { properties: { id: string; state_1006: string } }[]
}

const polities = { ...cur.polities }
// единые имена (подпись на карте и легенда)
const NAMES: Record<string, string> = {
  'new:zalesye_tribes': 'Залесье (раздроблено)',
  'hist:042': 'Префектура мертвецов (бывший Арност)',
  'hist:043': 'Префектура мертвецов (бывший Арност)',
  'countries/arnost/index': 'Префектура мертвецов (бывший Арност)',
  'countries/igni/index': 'Княжество Игни',
}
const errs: string[] = []
const frames = [...rec.frames].sort((a, b) => a.year - b.year)
const norm = (c: string | number) => (String(c).startsWith('cell:') ? String(c) : `cell:${c}`)
const toRun = (year: number, r: Rec, where: string): Run => {
  const conf = r.confidence === 'null' ? null : (r.confidence as Conf)
  if (r.polity) {
    if (!polities[r.polity]) {
      const name = registry.get(r.polity),
        color = HIST[r.polity]
      if (!name) errs.push(`${where}: polity «${r.polity}» нет в реестре`)
      else if (!color) errs.push(`${where}: нет цвета для «${r.polity}»`)
      else polities[r.polity] = { name, color }
    }
    if (!conf || !r.sources.length) errs.push(`${where}: polity «${r.polity}» без confidence/sources`)
  } else if (conf !== null && !r.sources.length) errs.push(`${where}: ничья земля без источников`)
  return [year, r.polity, conf, r.sources]
}

const cells: Record<string, Run[]> = {}
for (const f of geo.features) {
  const id = f.properties.id,
    runs: Run[] = []
  const push = (r: Run) => {
    const l = runs[runs.length - 1]
    if (l && l[1] === r[1] && l[2] === r[2] && JSON.stringify(l[3]) === JSON.stringify(r[3])) return
    runs.push(r)
  }
  for (const fr of frames) {
    const ov = fr.overrides.find((o) => norm(o.cell) === id)
    const bs = fr.by_state.find((b) => b.state_1006 === f.properties.state_1006)
    const src = ov ?? bs
    if (!src) {
      errs.push(`${id}, ${fr.year}: нет правила by_state для «${f.properties.state_1006}»`)
      continue
    }
    // ничья земля без источников в кадре: основание — то же, что у снимка 1006 этой ячейки (карта)
    const base = cur.cells[id]?.find((r) => r[0] === 1006)
    push(
      toRun(
        fr.year,
        !src.polity && src.confidence !== 'null' && !src.sources.length && base ? { ...src, sources: base[3] } : src,
        `${id}, ${fr.year}`,
      ),
    )
  }
  // дробные кадры 1005: Вторая война Игни и Ройо (кадры принудительно, без схлопывания)
  const last = () => runs[runs.length - 1]
  const r1006 = (cur.cells[id] ?? []).find((r) => r[0] === 1006)
  const prev = last()
  if (
    r1006 &&
    prev &&
    prev[1] !== r1006[1] &&
    (r1006[1] === 'countries/igni/index' || r1006[1] === 'countries/bastion_union/index')
  ) {
    const srcs = r1006[3].filter((s) => !/^(map:|gazetteer)/.test(s))
    const west = r1006[1] === 'countries/igni/index' && prev[1] === 'countries/rojo/index' // Западный берег: занят за лето
    runs.push([1005, prev[1], prev[2], prev[3]])
    runs.push(west ? [1005.5, r1006[1], 'derived', srcs] : [1005.5, prev[1], prev[2], prev[3]])
    runs.push([1005.85, r1006[1], 'canon', srcs])
  }
  for (const r of cur.cells[id] ?? [])
    if (r[0] === 1006) {
      const p = last()
      // владелец не менялся — достоверность «факт» не теряется на снимке 1006
      if (p && p[1] === r[1] && p[2] === 'canon' && r[2] !== 'canon' && r[1])
        push([r[0], r[1], 'canon', [...new Set([...p[3], ...r[3]])]])
      else if (!(p && p[0] === 1005.85 && p[1] === r[1])) push(r)
      else runs.push([1006, r[1], r[2], r[3]])
    }
  // Залесье до 995 — раздроблено (племена), с 995 — княжество
  for (let i = 0; i < runs.length; i++)
    if (runs[i][1] === 'countries/zalessk/index' && runs[i][0] < 995)
      runs[i] = [runs[i][0], 'new:zalesye_tribes', runs[i][2], runs[i][3]]
  // Государство Игни сложилось в 135–140 гг. (countries/igni/index): первое владение Игни, начатое кадром 151, считаем с 140
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i]
    if (r[0] === 151 && r[1] === 'countries/igni/index' && runs[i - 1]?.[1] !== r[1]) runs[i] = [140, r[1], r[2], r[3]]
  }
  cells[id] = runs
}
if (errs.length) {
  console.error(errs.slice(0, 40).join('\n'))
  console.error(`ошибок: ${errs.length}`)
  process.exit(1)
}

for (const [k, n] of Object.entries(NAMES)) if (polities[k]) polities[k].name = n
const used = new Set(
  Object.values(cells)
    .flat()
    .map((r) => r[1])
    .filter(Boolean),
)
for (const p of Object.keys(polities)) if (!used.has(p) && !cur.polities[p]) delete polities[p]
const flow = (v: unknown) => stringify(v, { lineWidth: 0, flow: true } as never).trim()
let out =
  '# Владельцы ячеек (data/geo/cells.geojson) по годам: cell:<n>: [[с_года, polity_id|null, confidence|null, [sources]], ...].\n'
out +=
  '# Владелец на год Y — последняя запись с годом ≤ Y; до первой записи — «нет сведений». Запись [год, null, null, [...]] — «нет сведений» (в кадре владелец не установлен);\n'
out +=
  '# [год, null, confidence, sources] — ничья/опустевшая земля. Генерируется scripts/import/build-owners.ts из docs/research/owners-reconstruction.json (+ снимок 1006), руками не править.\npolities:\n'
for (const [id, p] of Object.entries(polities)) out += `  ${id}:\n    name: ${flow(p.name)}\n    color: '${p.color}'\n`
out += 'cells:\n'
for (const [id, runs] of Object.entries(cells)) out += `  ${id}: ${flow(runs)}\n`
writeFileSync('data/history/owners.yaml', out)
console.log(
  `${Object.keys(cells).length} ячеек, ${Object.values(cells).reduce((s, r) => s + r.length, 0)} записей, ${Object.keys(polities).length} государств`,
)
