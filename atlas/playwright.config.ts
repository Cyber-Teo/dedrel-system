import { defineConfig } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 4173)
const URL = process.env.E2E_URL ?? `http://localhost:${PORT}`

// Сквозной прогон на собранном dist (pnpm build && pnpm e2e). Браузер — chromium из кэша Playwright
// (pnpm exec playwright install chromium), без окна. Обычный user-agent подставляет e2e/fixtures.ts.
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: URL,
    headless: true,
    // программный WebGL: в headless без видеокарты карта иначе не рисуется
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: process.env.E2E_URL
    ? undefined
    : {
        command: `pnpm exec vite preview --port ${PORT} --strictPort`,
        url: URL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
})
