// Собирает public/icons/*.svg и ATTRIBUTION.md из game-icons.net (CC BY 3.0) через @iconify-json/game-icons + дерево github.com/game-icons/icons (авторы).
// Запуск: node scripts/build/build-icons.mjs  (кэш — $ICON_CACHE или /tmp/gi). Палитра растра: тёмно-красный, золото, чернила, пергамент.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..'),
  OUT = join(ROOT, 'public/icons')
const CACHE = process.env.ICON_CACHE || '/tmp/gi'
const INK = '#2b1a0e',
  RED = '#7a1f1a',
  GOLD = '#c9a227',
  DUST = '#8a7a5c',
  SEA = '#3d6b7a',
  VIOLET = '#5a2a6b'
// ключ -> [id в game-icons, цвет заливки, подпись]
export const ICONS = {
  capital: ['capitol', GOLD, 'столица'],
  city: ['village', GOLD, 'город'],
  fortress: ['castle', RED, 'крепость'],
  ruins: ['castle-ruins', '#a9a69c', 'руины'],
  port: ['anchor', SEA, 'порт (якорь)'],
  temple: ['greek-temple', GOLD, 'храм'],
  school: ['open-book', GOLD, 'школа / академия'],
  mine: ['mining', GOLD, 'шахта (кирка)'],
  lighthouse: ['lighthouse', GOLD, 'маяк'],
  'mage-tower': ['white-tower', VIOLET, 'башня мага'],
  fair: ['trade', GOLD, 'ярмарка'],
  undead: ['shambling-zombie', VIOLET, 'нежить'],
  kraken: ['kraken-tentacle', SEA, 'кракен'],
  reef: ['ship-wreck', SEA, 'рифы'],
  whirl: ['tornado', SEA, 'вихрь, тайфун'],
  swamp: ['swamp', '#5f7a4a', 'болота, топи'],
  gas: ['gas-mask', DUST, 'ядовитый газ'],
  bandits: ['bandit', RED, 'бандиты'],
  monster: ['horned-reptile', '#a05a22', 'чудовище'],
  anomaly: ['magic-swirl', VIOLET, 'аномалия'],
  forest: ['pine-tree', DUST, 'лес'],
  war: ['crossed-swords', RED, 'война'],
  battle: ['shield', RED, 'битва'],
  treaty: ['scroll-unfurled', GOLD, 'договор'],
  founding: ['flying-flag', GOLD, 'основание'],
  catastrophe: ['lightning-storm', RED, 'катастрофа'],
  plague: ['skull-crossed-bones', DUST, 'эпидемия'],
  dynasty: ['crown', GOLD, 'династия'],
  religion: ['star-altar', GOLD, 'религия'],
  rebellion: ['crossed-axes', RED, 'мятеж'],
  coronation: ['imperial-crown', GOLD, 'коронация'],
  economy: ['coins', GOLD, 'экономика'],
  migration: ['footsteps', DUST, 'переселение'],
  discovery: ['spyglass', GOLD, 'открытие'],
  magic: ['magic-swirl', VIOLET, 'магия'],
  other: ['scroll-quill', DUST, 'прочее'],
  cog: ['galleon', GOLD, 'когг (парусник)'],
  galley: ['galley', GOLD, 'галера'],
  caravel: ['caravel', GOLD, 'каравелла'],
  boat: ['fishing-boat', SEA, 'лодка'],
  caravan: ['camel', GOLD, 'караван'],
  cart: ['old-wagon', GOLD, 'телега'],
  army: ['knight-banner', RED, 'армия-знамя'],
  fleet: ['sailboat', RED, 'флот'],
  dragon: ['wyvern', '#3f7a3a', 'дракон (крылья, шея, хвост; зелёный)'],
  demon: ['devil-mask', RED, 'демон'],
  'undead-skull': ['death-skull', VIOLET, 'нежить-череп'],
  legion: ['centurion-helmet', RED, 'легион'],
  hamlet: ['hut', DUST, 'деревня'],
  town: ['medieval-gate', '#b8892b', 'малый город (ворота)'],
  citadel: ['stone-tower', RED, 'цитадель'],
  abbey: ['church', GOLD, 'аббатство, монастырь'],
  birth: ['baby-face', GOLD, 'рождение'],
  death: ['tombstone', DUST, 'смерть'],
  trial: ['gavel', RED, 'суд, дело'],
  politics: ['round-table', GOLD, 'политика, закон'],
  outpost: ['watchtower', RED, 'застава, форт'],
  wheat: ['wheat', GOLD, 'зерно'],
  crystal: ['crystal-cluster', VIOLET, 'кристаллы'],
  ingot: ['gold-bar', GOLD, 'слитки'],
  jug: ['amphora', GOLD, 'вино, масло'],
  fish: ['school-of-fish', SEA, 'рыба'],
  wood: ['log', DUST, 'лес, брёвна'],
  ore: ['ore', DUST, 'руда'],
  gems: ['gems', GOLD, 'самоцветы'],
  salt: ['salt-shaker', DUST, 'соль'],
  wool: ['wool', DUST, 'шерсть'],
}
async function load(name, url, parse) {
  const f = join(CACHE, name)
  mkdirSync(CACHE, { recursive: true })
  if (!existsSync(f)) writeFileSync(f, Buffer.from(await (await fetch(url)).arrayBuffer()))
  return parse(readFileSync(f, 'utf8'))
}
const lib = (await load('icons.json', 'https://cdn.jsdelivr.net/npm/@iconify-json/game-icons/icons.json', JSON.parse))
  .icons
const tree = await load(
  'tree.json',
  'https://api.github.com/repos/game-icons/icons/git/trees/master?recursive=1',
  JSON.parse,
)
const author = new Map()
for (const { path } of tree.tree) {
  const m = /^([^/]+)\/(.+)\.svg$/.exec(path)
  if (m && !author.has(m[2])) author.set(m[2], m[1])
}

mkdirSync(OUT, { recursive: true })
const rows = []
for (const [key, [gi, fill, label]] of Object.entries(ICONS)) {
  const ic = lib[gi]
  if (!ic) throw new Error(`нет иконки ${gi}`)
  const d = [...ic.body.matchAll(/<path[^>]* d="([^"]+)"/g)].map((m) => m[1]).join(' ')
  const g = (a) => `<path d="${d}" ${a}/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="64" height="64"><title>${label}</title><g transform="translate(56 56) scale(0.78)">${g(`fill="${INK}" stroke="${INK}" stroke-width="44" stroke-linejoin="round"`)}${g(`fill="${fill}"`)}</g></svg>\n`
  writeFileSync(join(OUT, `${key}.svg`), svg)
  rows.push(
    `| ${key}.svg | ${label} | ${gi} | ${author.get(gi) ?? '?'} | https://game-icons.net/1x1/${author.get(gi)}/${gi}.html |`,
  )
}
writeFileSync(
  join(OUT, 'ATTRIBUTION.md'),
  `# Атрибуция иконок

Значки карты — из набора [game-icons.net](https://game-icons.net), лицензия [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Формы изменены (перекраска под палитру растра, тёмно-коричневая обводка). Файлы собирает scripts/build/build-icons.mjs.

| Файл | Значение | Оригинал | Автор | Страница |
|---|---|---|---|---|
${rows.join('\n')}
`,
)
console.log(`иконок: ${rows.length}; без автора: ${rows.filter((r) => r.includes('| ? |')).length}`)
