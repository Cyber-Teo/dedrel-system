// build() для Node (validate, отчёт): входные YAML-строки разбираются здесь, чтобы yaml не попадал в бандл браузера.
import { parse } from 'yaml'
import { build as buildParsed, type Built, type LayerKey, type Parsed } from './build'

export type Raw = Record<LayerKey, string> & { states?: string; miniatures?: string }

export function build(raw: Raw): Built {
  const p: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) if (v !== undefined) p[k] = k === 'states' ? JSON.parse(v) : parse(v)
  return buildParsed(p as Parsed)
}
