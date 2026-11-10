import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'

// e2e/*.spec.ts гоняет Playwright (pnpm e2e), vitest их не трогает
export default defineConfig({
  plugins: [preact()],
  test: { include: ['src/**/*.test.ts', 'api/**/*.test.ts', 'scripts/**/*.test.ts', 'tests/**/*.test.ts'] },
})
