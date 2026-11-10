// Сжатый справочник вики для досье: slug → название страницы; страна → «Правительство:». Запуск: node scripts/import/build-wiki-titles.mjs → data/wiki-titles.yaml
import { readFileSync, writeFileSync } from 'node:fs'
import { stringify } from 'yaml'
const HEAD =
  '# Названия страниц вики (slug → заголовок) и «Правительство:» стран. Собрано scripts/import/build-wiki-titles.mjs из data/site/pages.json.\n'
const pages = JSON.parse(readFileSync('data/site/pages.json', 'utf8'))
const titles = {},
  gov = {}
for (const [slug, p] of Object.entries(pages)) {
  if (!p.title) continue
  titles[slug] = p.title
  if (/^countries\/[^/]+\/index$/.test(slug)) {
    const m =
      /Правительство:\s*(.*?)(?=\s+(?:Население|Язык|Языки|Армия|Деньги|Девиз|Столица|Стилистические)\s*:|$)/s.exec(
        p.text,
      )
    if (m && m[1].trim()) gov[slug] = m[1].trim()
  }
}
writeFileSync('data/wiki-titles.yaml', HEAD + stringify({ titles, gov }, { lineWidth: 0 }))
console.log(Object.keys(titles).length, 'страниц;', Object.keys(gov).length, 'правительств')
