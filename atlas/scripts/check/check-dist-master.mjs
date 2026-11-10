// node scripts/check-dist-master.mjs [dist] — ищет в собранном dist/ заголовки и id мастерских записей (data/master/*.yaml). Находка → выход 1.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'

const dist = process.argv[2] ?? 'dist'
const mdir = 'data/master'
if (!existsSync(dist)) {
  console.error(`нет ${dist}/ — сначала pnpm build`)
  process.exit(2)
}
const needles = [] // { what, text }
for (const f of existsSync(mdir) ? readdirSync(mdir).filter((f) => /\.ya?ml$/.test(f)) : []) {
  for (const r of parse(readFileSync(join(mdir, f), 'utf8')) ?? []) {
    for (const k of ['id', 'title', 'name'])
      if (typeof r?.[k] === 'string' && r[k].length >= 6) needles.push({ what: `${f}:${r.id ?? r.title}`, text: r[k] })
  }
}
if (!needles.length) {
  console.error('data/master пуст — проверять нечего (ошибка конфигурации)')
  process.exit(2)
}
const files = []
const walk = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n)
    if (statSync(p).isDirectory()) walk(p)
    else files.push(p)
  }
}
walk(dist)
const hits = []
for (const p of files) {
  if (/\.(png|jpe?g|webp|pbf|woff2?|ico|gz|mp4)$/i.test(p)) continue
  const t = readFileSync(p, 'utf8')
  for (const n of needles) {
    // строка может быть в JSON-экранировании — проверяем и сырую, и экранированную форму
    if (t.includes(n.text) || t.includes(JSON.stringify(n.text).slice(1, -1)))
      hits.push(`${p}: ${n.what} «${n.text.slice(0, 60)}»`)
  }
}
console.log(`dist: файлов ${files.length}, мастер-ключей ${needles.length}, находок ${hits.length}`)
for (const h of hits) console.log('  НАЙДЕНО ' + h)
process.exit(hits.length ? 1 : 0)
