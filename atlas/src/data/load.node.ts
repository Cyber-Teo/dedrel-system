// Только для vitest: те же наборы напрямую из data/ (в браузерную сборку не попадает — ветка отсечена по import.meta.env.MODE).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataJson } from '../../scripts/build/data-json'

export const readData = (name: string) => JSON.parse(dataJson(name))
export const readGeo = (url: string) => JSON.parse(readFileSync(join(process.cwd(), url.replace(/^\//, '')), 'utf8'))
