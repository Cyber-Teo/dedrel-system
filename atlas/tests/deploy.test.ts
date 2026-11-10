import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type Rule = { source: string; headers: { key: string; value: string }[] }
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
  buildCommand: string
  outputDirectory: string
  headers: Rule[]
}
const cache = (prefix: string) => vercel.headers.find((h) => h.source.startsWith(prefix))?.headers[0].value

describe('vercel.json', () => {
  it('сборка в dist', () => {
    expect(vercel.buildCommand).toBe('pnpm build')
    expect(vercel.outputDirectory).toBe('dist')
  })

  it('заголовки /api задаются в коде api, а не здесь', () => {
    expect(vercel.headers.some((h) => h.source.startsWith('/api'))).toBe(false)
  })

  it('кэш статики: assets immutable, tiles stale-while-revalidate', () => {
    expect(vercel.headers).toHaveLength(3)
    expect(cache('/assets')).toContain('immutable')
    expect(cache('/tiles')).toContain('stale-while-revalidate')
  })
})
