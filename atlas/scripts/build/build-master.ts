// Собирает data/master/*.yaml → api/_data/master.json (импортируется функцией api/master.ts; в public/ и dist/ не попадает).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { parse } from 'yaml'

const out: Record<string, unknown[]> = {}
for (const f of readdirSync('data/master')
  .filter((f) => /\.ya?ml$/.test(f))
  .sort())
  out[f.replace(/\.ya?ml$/, '')] = (parse(readFileSync(`data/master/${f}`, 'utf8')) as unknown[] | null) ?? []
mkdirSync('api/_data', { recursive: true })
writeFileSync('api/_data/master.json', JSON.stringify(out))
console.log(
  'api/_data/master.json:',
  Object.entries(out)
    .map(([k, v]) => `${k} ${v.length}`)
    .join(', '),
)
