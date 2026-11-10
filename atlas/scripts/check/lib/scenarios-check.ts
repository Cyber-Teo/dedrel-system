// Сценарии: схема, места существуют (и имеют координаты там, где их рисуют), государства есть в owners.yaml, источники — в снимке вики.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { Scenario } from '../../../src/scenarios/schema'

export function checkScenarios(dir: string, pages: Record<string, unknown>, err: (m: string) => void): number {
  const sdir = join(dir, 'scenarios')
  if (!existsSync(sdir)) return 0
  const places = new Map<string, { x?: number; y?: number }>(
    (parse(readFileSync(join(dir, 'places.yaml'), 'utf8')) as { id: string; x?: number; y?: number }[]).map((p) => [
      p.id,
      p,
    ]),
  )
  const pols = Object.keys(
    (parse(readFileSync(join(dir, 'history/owners.yaml'), 'utf8')) as { polities: object }).polities,
  )
  let n = 0
  for (const f of readdirSync(sdir).filter((x) => x.endsWith('.yaml'))) {
    const r = Scenario.safeParse(parse(readFileSync(join(sdir, f), 'utf8')))
    if (!r.success) {
      for (const i of r.error.issues) err(`scenarios/${f}: ${i.path.join('.')}: ${i.message}`)
      continue
    }
    n += r.data.steps.length
    r.data.steps.forEach((s, i) => {
      const at = `scenarios/${f} шаг ${i + 1}`
      const xy = (id: string, why: string) => {
        const p = places.get(id)
        if (!p) err(`${at}: ${why} «${id}» нет в places.yaml`)
        else if (p.x === undefined || p.y === undefined) err(`${at}: у «${id}» нет координат (${why})`)
      }
      if (s.camera.place) xy(s.camera.place, 'камера')
      for (const id of s.highlight.places) xy(id, 'подсветка')
      for (const l of s.highlight.lines) for (const v of l.via) if (typeof v === 'string') xy(v, 'линия')
      for (const p of s.highlight.polities) if (!pols.includes(p)) err(`${at}: государства «${p}» нет в owners.yaml`)
      for (const src of [...s.sources, ...r.data.sources])
        if (!(src in pages)) err(`${at}: источник «${src}» не найден в снимке вики`)
    })
  }
  return n
}
