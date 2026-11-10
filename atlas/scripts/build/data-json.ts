// Предсборка данных для браузера: data/*.yaml → JSON (/data/<имя>.json). Исходники остаются YAML (их читают validate и скрипты).
// Vite-плагин: в dev отдаёт JSON по запросу, в build кладёт в dist/data/ и прописывает preload в index.html.
// Схемы zod прогоняются здесь, поэтому в бандл браузера не попадают ни yaml, ни zod.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse } from 'yaml'
import type { Plugin } from 'vite'
import { AreasFile } from '../../src/data/schema'
import { Scenario } from '../../src/scenarios/schema'

const root = resolve(import.meta.dirname, '../..')
const yamlOf = (rel: string) => parse(readFileSync(join(root, 'data', rel + '.yaml'), 'utf8'))

/** Наборы верхнего уровня data/*.yaml, которые браузеру не нужны (правки импорта и исходные потоки для сборки маршрутов). */
const NOT_FOR_BROWSER = new Set(['events-overrides', 'flows', 'zones'])
/** Наборы из подпапок data/: добавляются явно. */
const NESTED = ['history/owners', 'history/landscape', 'geo/sunny-islands-inset']

const topLevel = readdirSync(join(root, 'data'))
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => f.replace(/\.yaml$/, ''))
  .filter((n) => !NOT_FOR_BROWSER.has(n))
  .sort()

/** Наборы, у которых разбор или проверка схемой делается здесь, а не просто YAML → JSON. */
const SPECIAL: Record<string, () => unknown> = {
  areas: () => AreasFile.parse(yamlOf('areas')),
  scenarios: () =>
    readdirSync(join(root, 'data/scenarios'))
      .filter((f) => f.endsWith('.yaml'))
      .sort((a, b) => a.localeCompare(b))
      .map((f) => Scenario.parse(yamlOf('scenarios/' + f.replace(/\.yaml$/, '')))),
}
const PLAIN = [...topLevel.filter((n) => !(n in SPECIAL)), ...NESTED]

export const DATA_NAMES = [...PLAIN, ...Object.keys(SPECIAL)]

export function dataJson(name: string): string {
  if (SPECIAL[name]) return JSON.stringify(SPECIAL[name]())
  if (!PLAIN.includes(name) || !existsSync(join(root, 'data', name + '.yaml')))
    throw new Error('нет набора данных ' + name)
  return JSON.stringify(yamlOf(name) ?? null)
}

export function dataJsonPlugin(): Plugin {
  return {
    name: 'dedrel-data-json',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /\/data\/(.+)\.json(\?.*)?$/.exec(req.url ?? '')
        if (!m || !DATA_NAMES.includes(m[1])) return next()
        try {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-cache')
          res.end(dataJson(m[1]))
        } catch (e) {
          res.statusCode = 500
          res.end(String(e))
        }
      })
    },
    // данные качаются параллельно со скриптом; пути относительные — сборка работает и по подпути (Foundry)
    transformIndexHtml: () =>
      DATA_NAMES.map((name) => ({
        tag: 'link',
        attrs: { rel: 'preload', as: 'fetch', crossorigin: '', href: `./data/${name}.json` },
        injectTo: 'head' as const,
      })),
    generateBundle() {
      for (const name of DATA_NAMES)
        this.emitFile({ type: 'asset', fileName: `data/${name}.json`, source: dataJson(name) })
    },
  }
}
