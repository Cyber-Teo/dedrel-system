// pnpm check:chronicle — пересборка (build-chronicle.ts + data/events-overrides.yaml) должна совпасть с data/events.yaml и data/master/events.yaml.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'chronicle-'))
let bad = 0
try {
  execFileSync(process.execPath, ['./node_modules/tsx/dist/cli.mjs', 'scripts/import/build-chronicle.ts'], {
    env: { ...process.env, CHRONICLE_OUT: dir },
    stdio: 'pipe',
  })
  for (const f of ['data/events.yaml', 'data/master/events.yaml']) {
    if (readFileSync(join(dir, f), 'utf8') !== readFileSync(f, 'utf8')) {
      console.error(
        `check:chronicle: пересборка != ${f}. Правки вносить в data/events-overrides.yaml (или скрипты), не в events.yaml.`,
      )
      bad++
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}
if (bad) process.exit(1)
console.log('check:chronicle: пересборка = data/events.yaml, data/master/events.yaml')
