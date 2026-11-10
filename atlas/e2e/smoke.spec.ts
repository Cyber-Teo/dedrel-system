import { existsSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { test, expect, openAtlas, openGroup, year, hash } from './fixtures'

/** Горизонтального скролла у страницы быть не должно. */
const noHScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

test.describe('карта', () => {
  test('отрисована, тайлы отдаются, ошибок консоли нет', async ({ atlas, errors }) => {
    const tiles: number[] = []
    atlas.on('response', (r) => {
      if (/\/tiles\//.test(r.url())) tiles.push(r.status())
    })
    await openAtlas(atlas, '#y=1005')
    await expect(year(atlas)).toBeVisible()
    const box = await atlas.locator('canvas.maplibregl-canvas').boundingBox()
    expect(box!.width).toBeGreaterThan(300)
    // растровые тайлы собирает pnpm tiles; на чистом клоне без них проверка пропускается
    if (existsSync('public/tiles')) {
      await expect.poll(() => tiles.length, { timeout: 15_000 }).toBeGreaterThan(0)
      expect(tiles.every((s) => s === 200)).toBe(true)
    }
    await atlas.waitForTimeout(1500)
    expect(errors).toEqual([])
  })

  test('data/*.json загружаются без ошибок сети', async ({ atlas }) => {
    const bad: string[] = []
    atlas.on('response', (r) => {
      if (/\/data\//.test(r.url()) && r.status() >= 400) bad.push(`${r.status()} ${r.url()}`)
    })
    await openAtlas(atlas, '#y=1005')
    expect(bad).toEqual([])
  })
})

test.describe('поиск и досье', () => {
  test('«Талор» → Талар, открывается досье', async ({ atlas }) => {
    await openAtlas(atlas, '#y=1005')
    await atlas.locator('#slot-search input').fill('Талор')
    await expect(atlas.locator('.sitem').first()).toContainText('Талар')
    await atlas.keyboard.press('ArrowDown')
    await atlas.keyboard.press('Enter')
    await expect(atlas.locator('#dossier')).toContainText('Талар')
  })

  test('клик по земле в 300 г. показывает её владельца', async ({ atlas }) => {
    await openAtlas(atlas, '#y=300&l=&cx=6400&cy=1300&z=3.5')
    await openGroup(atlas, 'time')
    await atlas.getByText('Государства на карте').click()
    await atlas.waitForTimeout(2500) // слой владельцев рисуется после загрузки геометрии
    await atlas.mouse.click(720, 450)
    await expect(atlas.locator('#dossier')).toContainText(/Эта земля в 300( г\.)?: /)
  })
})

test.describe('хронология', () => {
  test('Play двигает год и пишет его в хеш', async ({ atlas }) => {
    await openAtlas(atlas, '#y=500&l=events')
    const before = await hash(atlas)
    await atlas.click('.tl-gear')
    await atlas.selectOption('.tl-ctl select >> nth=0', '25')
    await atlas.selectOption('.tl-ctl select >> nth=1', '0')
    await atlas.click('.tl-gear')
    const ruler = atlas.locator('.tl-rul canvas')
    await ruler.focus()
    await atlas.keyboard.press('Space')
    await expect
      .poll(async () => parseInt(await year(atlas).innerText()), { timeout: 25_000 })
      .toBeGreaterThanOrEqual(600)
    await atlas.keyboard.press('Space')
    await expect.poll(() => hash(atlas)).toMatch(/y=6[0-4]\d/)
    expect(await hash(atlas)).not.toBe(before)
    await ruler.focus()
    await atlas.keyboard.press('ArrowLeft')
    await expect.poll(() => hash(atlas)).toMatch(/y=(575|600)/)
  })

  test('диаграмма Ганта открывается и ведёт к году', async ({ atlas }) => {
    await openAtlas(atlas, '#y=1005')
    const y0 = await year(atlas).innerText()
    await openGroup(atlas, 'win')
    await atlas.getByText('Диаграмма Ганта').click()
    await expect(atlas.locator('.gbar').first()).toBeVisible()
    await expect(atlas.locator('.g-h')).toHaveText(['Народы', 'Государства', 'Города и союзы'])
    const bar = atlas.locator('.gbar').nth(5)
    await bar.scrollIntoViewIfNeeded()
    const bb = (await bar.boundingBox())!
    await atlas.mouse.click(bb.x + bb.width * 0.9, bb.y + bb.height / 2)
    await expect(year(atlas)).not.toHaveText(y0)
    await atlas.keyboard.press('Escape')
    await expect(atlas.locator('.gantt-ov')).toHaveCount(0)
  })
})

test.describe('слои и пресеты', () => {
  test('слои из хеша включены в панели', async ({ atlas }) => {
    await openAtlas(atlas, '#y=1005&l=events,legions')
    await expect(atlas.locator('.lp-fab')).toContainText('2')
    if (!(await atlas.locator('#layers-panel').count())) await atlas.locator('.lp-fab').click()
    await expect(atlas.locator('#layers-panel input[type=checkbox]:checked')).toHaveCount(2, { timeout: 5000 })
  })

  test('пресет «Торговля» включает слои и год 1006', async ({ atlas }) => {
    await openAtlas(atlas, '#y=1005')
    await openGroup(atlas, 'views')
    await atlas.locator('.pre-list button', { hasText: 'Торговля' }).click()
    await expect.poll(() => hash(atlas)).toContain('trade-routes')
    expect(await hash(atlas)).toMatch(/y=1006/)
    await expect(atlas.locator('.pre-list button.on', { hasText: 'Торговля' })).toHaveCount(1)
  })

  test('чип типа события в панели слоёв убирает маркеры', async ({ atlas }) => {
    await openAtlas(atlas, '?welcome=0#y=1005&l=events')
    await atlas.locator('.lp-fab').click()
    const drawn = async () => Number((await atlas.locator('[data-ev-drawn]').getAttribute('data-ev-drawn')) ?? -1)
    await expect(atlas.locator('#layers-panel .legend .chip').first()).toBeVisible()
    // значки дорисовываются по мере загрузки источника: берём число, когда оно > 0 и перестало меняться
    await expect.poll(drawn).toBeGreaterThan(0)
    let n0 = await drawn()
    for (let same = 0; same < 3;) {
      await atlas.waitForTimeout(300)
      const n = await drawn()
      same = n === n0 ? same + 1 : 0
      n0 = n
    }
    await atlas.locator('#layers-panel .legend .chip', { hasText: 'Война' }).click()
    await expect.poll(drawn).toBeLessThan(n0)
  })
})

test.describe('инструменты', () => {
  test('граф связей открывается и закрывается по Esc', async ({ atlas }) => {
    await openAtlas(atlas, '#y=1005')
    await openGroup(atlas, 'win')
    await atlas.getByRole('button', { name: 'Связи' }).click()
    const nodes = atlas.locator('.gwin circle, .gwin .node, .gwin g[data-id]')
    await expect(nodes.nth(6)).toBeVisible({ timeout: 15_000 }) // окно графа — ленивый чанк
    await atlas.waitForTimeout(600) // оверлей встаёт в стек Esc после первой отрисовки
    await atlas.keyboard.press('Escape')
    await expect(atlas.locator('.gwin')).toHaveCount(0)
  })

  test('маршрут Иллиор → Данир верхом ≈546 км', async ({ atlas }) => {
    await openAtlas(atlas, '#y=1005')
    await openGroup(atlas, 'measure')
    await atlas.getByRole('button', { name: 'Маршрут', exact: true }).click()
    await atlas.locator('.route-modes button', { hasText: /Верхом/ }).click()
    const ends = atlas.locator('.route-ends input')
    await ends.nth(0).fill('Иллиор')
    await ends.nth(1).fill('Данир')
    await expect(atlas.locator('#route-km')).toBeVisible({ timeout: 20_000 })
    const km = parseFloat((await atlas.locator('#route-km').innerText()).replace(/\s/g, '').replace(',', '.'))
    expect(Math.abs(km - 546)).toBeLessThanOrEqual(8)
  })

  test('активен один инструмент: Линейка → Маршрут → Esc', async ({ atlas }) => {
    await openAtlas(atlas, '#y=1005')
    const pressed = async (name: string) => {
      await openGroup(atlas, 'measure')
      return atlas.getByRole('button', { name, exact: true }).getAttribute('aria-pressed')
    }
    await openGroup(atlas, 'measure')
    await atlas.getByRole('button', { name: 'Линейка', exact: true }).click()
    await expect(atlas.locator('#tool-bar')).toContainText('Активно: Линейка · Esc — выйти')
    await openGroup(atlas, 'measure')
    await atlas.getByRole('button', { name: 'Маршрут', exact: true }).click()
    await expect.poll(() => pressed('Линейка')).toBe('false')
    await expect.poll(() => pressed('Маршрут')).toBe('true')
    await atlas.keyboard.press('Escape')
    await expect.poll(() => pressed('Маршрут')).toBe('false')
  })

  test('сценарий: переход к шагу 5', async ({ atlas }) => {
    await openAtlas(atlas, '#y=672')
    await openGroup(atlas, 'ref')
    await atlas.getByRole('button', { name: 'Сценарии' }).click()
    await atlas.locator('.sc-pick:not(.sc-tour-pick)').first().click()
    await atlas.locator('.sc-steps li').nth(4).click()
    await expect(atlas.locator('.sc-steps li').nth(4)).toHaveClass(/\bon\b/, { timeout: 10_000 })
  })
})

test.describe('телефон 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('без горизонтального скролла, шторки открываются', async ({ atlas }) => {
    await openAtlas(atlas, '#y=500&l=events')
    expect(await noHScroll(atlas)).toBe(true)
    await atlas.locator('.lp-fab').click()
    await expect(atlas.locator('#layers-panel')).toBeVisible()
    expect(await noHScroll(atlas)).toBe(true)
    await atlas.locator('.lp-fab').click()
    await atlas.locator('.tools-btn').click()
    await expect(atlas.locator('#tools')).toBeVisible()
    expect(await noHScroll(atlas)).toBe(true)
  })

  test('Гант умещается по ширине', async ({ atlas }) => {
    await openAtlas(atlas, '?welcome=0')
    await atlas.locator('.tools-btn').click()
    await atlas.getByText('Диаграмма Ганта').click()
    await expect(atlas.locator('.gantt-body')).toBeVisible()
    // ширина устанавливается после загрузки данных и вёрстки: ждём условия, а не фиксированный момент
    await expect
      .poll(() =>
        atlas.evaluate(() => {
          const b = document.querySelector('.gantt-body')!
          return b.scrollWidth <= b.clientWidth + 1 && b.scrollLeft === 0
        }),
      )
      .toBe(true)
  })
})
