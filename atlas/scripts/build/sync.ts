// pnpm sync — снимок contentIndex.json вики → data/site/pages.json + отчёт diff с прошлым снимком.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'

const URL = 'https://dedrel.teo.uy/static/contentIndex.json'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const RAW = 'data/raw/site/contentIndex.json'
const OUT = 'data/site/pages.json'

type Page = { title: string; tags: string[]; links: string[]; text: string }

const clean = (s: string) =>
  s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const slugOf = (l: string) => l.split('#')[0].replace(/\/$/, '')

const res = await fetch(URL, { headers: { 'User-Agent': UA } })
if (!res.ok) {
  console.error(`sync: HTTP ${res.status}`)
  process.exit(1)
}
const body = await res.text()
const index = JSON.parse(body) as Record<string, { title: string; tags?: string[]; links?: string[]; content?: string }>

mkdirSync('data/raw/site', { recursive: true })
mkdirSync('data/site', { recursive: true })
writeFileSync(RAW, body)

const pages: Record<string, Page> = {}
for (const slug of Object.keys(index).sort()) {
  if (slug.startsWith('en/') || slug.startsWith('tags/')) continue
  const p = index[slug]
  pages[slug] = {
    title: p.title,
    tags: p.tags ?? [],
    links: [...new Set((p.links ?? []).map(slugOf))],
    text: clean(p.content ?? ''),
  }
}

const old: Record<string, Page> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {}
const added = Object.keys(pages).filter((s) => !(s in old))
const removed = Object.keys(old).filter((s) => !(s in pages))
const changed = Object.keys(pages).filter((s) => s in old && JSON.stringify(old[s]) !== JSON.stringify(pages[s]))
writeFileSync(OUT, JSON.stringify(pages, null, 1) + '\n')

const list = (a: string[]) =>
  a.length ? ': ' + a.slice(0, 40).join(', ') + (a.length > 40 ? ` … (+${a.length - 40})` : '') : ''
console.log(`sync: страниц RU ${Object.keys(pages).length} (всего в индексе ${Object.keys(index).length})`)
console.log(`добавлено ${added.length}${list(added)}`)
console.log(`удалено ${removed.length}${list(removed)}`)
console.log(`изменено ${changed.length}${list(changed)}`)
