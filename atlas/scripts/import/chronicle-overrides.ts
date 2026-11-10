// Ручные правки поверх пересборки хроники: data/events-overrides.yaml (см. шапку файла).
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import type { R } from './chronicle-lib'

type Overrides = {
  actor_ids?: Record<string, string>
  drop?: string[]
  events?: Record<string, Record<string, unknown>>
}

export function applyOverrides(list: R[], path = 'data/events-overrides.yaml'): R[] {
  const o: Overrides = parse(readFileSync(path, 'utf8')) ?? {}
  const ids = o.actor_ids ?? {},
    drop = new Set(o.drop ?? []),
    ev = o.events ?? {}
  return list
    .filter((e) => !drop.has(e.id))
    .map((e) => {
      const f: R = { ...e }
      if (Array.isArray(f.actors))
        f.actors = f.actors
          .map((a: R) => (a.id && ids[a.id] ? { ...a, id: ids[a.id] } : a))
          .filter((a: R, i: number, all: R[]) => !a.id || all.findIndex((b: R) => b.id === a.id) === i)
      for (const [k, v] of Object.entries(ev[e.id] ?? {})) {
        if (v === null) delete f[k]
        else f[k] = v
      }
      return f
    })
}
