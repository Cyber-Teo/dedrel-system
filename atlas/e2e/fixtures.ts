import { test as base, expect, type Page } from '@playwright/test'

/** Шум WebGL-драйвера в headless — не ошибка приложения. */
const CONSOLE_NOISE = /GL Driver Message|GPU stall|ReadPixels/

type Fixtures = {
  /** Ошибки консоли и необработанные исключения страницы с начала теста. */
  errors: string[]
  /** Страница с обычным (не HeadlessChrome) user-agent, пропущенным приветствием и перехваченными ошибками. */
  atlas: Page
}

export const test = base.extend<Fixtures>({
  // Playwright требует деструктурирующий первый аргумент даже без зависимостей
  // eslint-disable-next-line no-empty-pattern
  errors: async ({}, use) => use([]),
  atlas: async ({ browser, viewport, errors }, use) => {
    const major = browser.version().split('.')[0]
    const context = await browser.newContext({
      viewport: viewport ?? { width: 1440, height: 900 },
      userAgent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`,
    })
    const page = await context.newPage()
    await page.addInitScript(() => {
      try {
        localStorage.setItem('dedrel-welcome', '1')
      } catch {
        /* хранилище недоступно — приветствие покажется */
      }
    })
    page.on('console', (m) => {
      if (m.type() === 'error' && !CONSOLE_NOISE.test(m.text()))
        errors.push(`${m.text().split('\n')[0]} @${m.location().url}`)
    })
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
    await use(page)
    await context.close()
  },
})

export { expect }

/** Открывает атлас по хешу и ждёт, пока карта отрисуется (канва MapLibre есть и имеет размер). */
export async function openAtlas(page: Page, hash = ''): Promise<void> {
  await page.goto('./' + hash)
  const canvas = page.locator('canvas.maplibregl-canvas')
  await expect(canvas).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 20_000 }) // скелет убирается по событию load карты
}

/** Раскрывает флайаут группы инструментов (если закрыт). */
export async function openGroup(page: Page, group: string): Promise<void> {
  if (!(await page.locator(`#tg-${group}.open`).count())) await page.locator(`#tg-${group} .tg-rail`).click()
}

export const year = (page: Page) => page.locator('.tl-year .yr')
export const hash = (page: Page) => page.evaluate(() => location.hash)
