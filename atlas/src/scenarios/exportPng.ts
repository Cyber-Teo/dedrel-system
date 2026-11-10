// Экспорт кадра: холст карты копируется в момент отрисовки (без preserveDrawingBuffer), сверху — год и подпись, снизу — легенда.
import type { Map } from 'maplibre-gl'
import { yearLabel } from '../events'
import { H, KM_PER_PX, W, pxToLngLat, screenPerPx } from '../geo/pixel'
import { built, catsOf, iconOf, shortName } from '../layers/registry'
import { readLayerIds } from '../layers/layerHash'
import { getOverlay } from './overlay'

export type FrameInfo = {
  year: number
  caption?: string
  sub?: string
  scale?: 1 | 2
  print?: 'A4' | 'A3'
  nospoil?: boolean
}
export type LegendLine = { text: string; icon?: { shape: string; color: string } }
/** кремовая рамка нарисована в самой подложке: ≈85 px карты по краю, в PNG её отрезаем */
const FRAME = 85
/** Ширина листа печати в пикселях: A3 и A4 альбомом при 300 dpi. */
const PAGE_W_A3 = 4961
const PAGE_W_A4 = 3508
/** Раскладка печати рассчитана на лист шириной 1500 условных единиц; u — пикселей на единицу. */
const LAYOUT_UNITS = 1500
/** Больше этой стороны браузер не даст завести холст при захвате карты, px. */
const MAX_CAPTURE_PX = 8192

const css = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
/** Цвета листа — из токенов стиля страницы (src/style.css); запасные значения совпадают с ними. */
const C = {
  get parch() {
    return css('--parch', '#f1e6c8')
  },
  get ink() {
    return css('--paper-dark', '#2b2113')
  },
  get gold() {
    return css('--gold', '#b8892b')
  },
  get blood() {
    return css('--blood', '#8c1c13')
  },
}
const niceKm = (km: number) => {
  const e = 10 ** Math.floor(Math.log10(km)),
    r = km / e
  return (r >= 5 ? 5 : r >= 2 ? 2 : 1) * e
}

/** Строки легенды: что сейчас включено на карте (у слоёв — значок и категории). */
export function legendLines(map: Map, year: number): LegendLine[] {
  const h = location.hash,
    p = new URLSearchParams(h.replace(/^#/, ''))
  const out: LegendLine[] = [{ text: `Подложка: ${p.get('m') === 'muted' ? 'приглушённая' : 'рисованная'}` }]
  const on = readLayerIds(h)
    .map((id) => built.layers.find((x) => x.id === id))
    .filter((l): l is NonNullable<typeof l> => !!l)
  if (on.length) out.push({ text: `Слои: ${on.map((l) => l.name.replace(/\s*[(:].*$/, '').trim()).join(', ')}` })
  for (const l of on) {
    const id = l.id
    const cats = catsOf(id) // как чип слоя: значок и короткое название, без длинного описания из layers.yaml
    out.push({
      text: shortName(l),
      icon: cats.length ? iconOf(id, cats[0].cat, false) : { shape: 'circle', color: l.color ?? C.gold },
    })
  }
  if (on.length) out.push({ text: 'Число в круге — сколько мест слилось на этом масштабе' })
  if (map.getLayer('pol-fill') && map.getLayoutProperty('pol-fill', 'visibility') === 'visible')
    out.push({ text: `Политика на ${yearLabel(year)} г.: заливка — государство, штриховка — неточные сведения` })
  const o = getOverlay()
  if (o.places.length) out.push({ text: 'Красная точка — место сценария' })
  if (o.lines.length) out.push({ text: `Штриховая линия — ${o.lines.map((l) => l.label).join('; ')}` })
  return out
}

/** Имя файла: atlas-<год>-<слои>.png */
export function fileName(year: number): string {
  const ids = readLayerIds(location.hash).join('+')
  return `atlas-${yearLabel(year)}${ids ? '-' + ids : ''}.png`
}

function drawIcon(g: CanvasRenderingContext2D, shape: string, color: string, x: number, y: number, r: number) {
  g.fillStyle = color
  g.strokeStyle = '#2b1a0e'
  g.lineWidth = 1.2
  g.beginPath()
  if (shape === 'square' || shape === 'shield' || shape === 'flag') g.rect(x - r, y - r, 2 * r, 2 * r)
  else if (shape === 'diamond' || shape === 'hex') {
    g.moveTo(x, y - r - 1)
    g.lineTo(x + r + 1, y)
    g.lineTo(x, y + r + 1)
    g.lineTo(x - r - 1, y)
    g.closePath()
  } else if (shape === 'triangle' || shape === 'cross') {
    g.moveTo(x, y - r - 1)
    g.lineTo(x + r + 1, y + r)
    g.lineTo(x - r - 1, y + r)
    g.closePath()
  } else g.arc(x, y, r, 0, Math.PI * 2)
  g.fill()
  g.stroke()
}

const SPOIL = /^(thematic|areas-|models-|events-|routes-)/
/** Печать: A4/A3 альбом (3508/4961 px), рамка, название, линейка в км, стрелка севера, легенда с переносом строк, маршрут и его метки. */
async function renderPrint(map: Map, info: FrameInfo): Promise<HTMLCanvasElement> {
  const cv = map.getCanvas(),
    cssW = cv.clientWidth,
    cssH = cv.clientHeight
  const PW = info.print === 'A3' ? PAGE_W_A3 : PAGE_W_A4,
    PH = Math.round(PW / Math.SQRT2),
    u = PW / LAYOUT_UNITS
  const serif = '"Cormorant Garamond", Georgia, serif',
    text = '"Literata", Georgia, serif'
  const hidden: string[] = []
  if (info.nospoil)
    for (const l of map.getStyle().layers)
      if (SPOIL.test(l.id) && map.getLayoutProperty(l.id, 'visibility') !== 'none') {
        hidden.push(l.id)
        map.setLayoutProperty(l.id, 'visibility', 'none')
      }
  const lines = info.nospoil ? legendLines(map, info.year).filter((l) => !l.icon) : legendLines(map, info.year)
  // геометрия страницы
  const m = 24 * u,
    headH = 70 * u,
    cols = 3,
    colW = (PW - 2 * m) / cols - 12 * u,
    lh = 19 * u
  const g0 = document.createElement('canvas').getContext('2d')!
  g0.font = `${13 * u}px ${text}`
  const wrap = (t: string, w: number) => {
    const out: string[] = []
    let cur = ''
    for (const wd of t.split(' ')) {
      const n = cur ? cur + ' ' + wd : wd
      if (g0.measureText(n).width > w && cur) {
        out.push(cur)
        cur = wd
      } else cur = n
    }
    if (cur) out.push(cur)
    return out
  }
  const wrapped = lines.map((l) => wrap(l.text, colW - (l.icon ? 22 * u : 0)))
  // раскладка по колонкам (по порядку, ~поровну)
  const total = wrapped.reduce((a, w) => a + w.length, 0),
    per = Math.ceil(total / cols)
  const colsOf: { l: LegendLine; w: string[] }[][] = [[], [], []]
  let ci = 0,
    used = 0
  lines.forEach((l, i) => {
    if (used >= per && ci < cols - 1) {
      ci++
      used = 0
    }
    colsOf[ci].push({ l, w: wrapped[i] })
    used += wrapped[i].length
  })
  const footH = 56 * u + Math.max(...colsOf.map((c) => c.reduce((a, x) => a + x.w.length * lh + 4 * u, 0))) + 10 * u
  const mapX = m,
    mapY = headH + m / 2,
    mapW = PW - 2 * m,
    mapH = PH - mapY - footH
  // захват карты с плотностью, при которой кадр покрывает область (cover)
  const pr0 = map.getPixelRatio(),
    maxPx = MAX_CAPTURE_PX
  const s = Math.min(Math.max(mapW / cssW, mapH / cssH), maxPx / Math.max(cssW, cssH))
  map.setPixelRatio(s)
  await new Promise<void>((r) => {
    map.once('idle', () => r())
    map.triggerRepaint()
  })
  const shot = await new Promise<HTMLCanvasElement>(
    (res) =>
      map.once('render', () => {
        const c = document.createElement('canvas')
        c.width = cv.width
        c.height = cv.height
        c.getContext('2d')!.drawImage(cv, 0, 0)
        res(c)
      }) && map.triggerRepaint(),
  )
  map.setPixelRatio(pr0)
  for (const id of hidden) map.setLayoutProperty(id, 'visibility', 'visible')
  const k = shot.width / cssW // device px снимка на css px
  const cover = Math.max(mapW / shot.width, mapH / shot.height) // снимок -> область
  const sw = mapW / cover,
    sh = mapH / cover,
    sx = (shot.width - sw) / 2,
    sy = (shot.height - sh) / 2
  const d = k * cover // px страницы на css px
  const toPage = (x: number, y: number): [number, number] => [mapX + (x * k - sx) * cover, mapY + (y * k - sy) * cover]
  const out = document.createElement('canvas')
  out.width = PW
  out.height = PH
  const g = out.getContext('2d')!
  g.fillStyle = C.parch
  g.fillRect(0, 0, PW, PH)
  g.fillStyle = C.ink
  g.fillRect(0, 0, PW, headH)
  g.fillStyle = C.parch
  g.textBaseline = 'alphabetic'
  g.font = `700 ${40 * u}px ${serif}`
  g.fillText(`Атлас Дедрела — ${yearLabel(info.year)}`, m, 44 * u)
  g.font = `${16 * u}px ${text}`
  g.fillStyle = '#e0cf9f'
  if (info.caption) g.fillText([info.caption, info.sub].filter(Boolean).join(' · '), m, 64 * u)
  g.fillStyle = C.gold
  g.fillRect(0, headH - 3 * u, PW, 3 * u)
  g.drawImage(shot, sx, sy, sw, sh, mapX, mapY, mapW, mapH)
  g.strokeStyle = C.ink
  g.lineWidth = 3 * u
  g.strokeRect(mapX, mapY, mapW, mapH)
  g.save()
  g.beginPath()
  g.rect(mapX, mapY, mapW, mapH)
  g.clip()
  // подписи мест сценария и метки маршрута (DOM-маркеры)
  g.font = `600 ${15 * u}px ${text}`
  g.textAlign = 'center'
  const halo = (t: string, x: number, y: number) => {
    g.lineWidth = 4 * u
    g.strokeStyle = '#f3ead4'
    g.strokeText(t, x, y)
    g.fillStyle = C.ink
    g.fillText(t, x, y)
  }
  for (const p of getOverlay().places) {
    if (p.region) continue
    const pt = map.project(p.ll),
      [x, y] = toPage(pt.x, pt.y)
    halo(p.name, x, y + 28 * u)
  }
  const cr = cv.getBoundingClientRect()
  document.querySelectorAll<HTMLElement>('.route-pin').forEach((el) => {
    const b = el.getBoundingClientRect(),
      [x, y] = toPage(b.left + b.width / 2 - cr.left, b.top + b.height / 2 - cr.top)
    g.fillStyle = el.classList.contains('b') ? C.blood : '#1f5fa8'
    g.strokeStyle = '#fff'
    g.lineWidth = 3 * u
    g.beginPath()
    g.arc(x, y, 11 * u, 0, 7)
    g.fill()
    g.stroke()
    g.fillStyle = '#fff'
    g.font = `700 ${13 * u}px ${text}`
    g.fillText((el.textContent ?? '').trim().slice(0, 2), x, y + 5 * u)
    g.font = `600 ${15 * u}px ${text}`
  })
  g.restore()
  g.textAlign = 'left'
  // север (с учётом поворота карты)
  const nx = mapX + mapW - 56 * u,
    ny = mapY + 70 * u,
    br = (-map.getBearing() * Math.PI) / 180
  g.save()
  g.translate(nx, ny)
  g.rotate(br)
  g.fillStyle = '#f3ead4e6'
  g.strokeStyle = C.ink
  g.lineWidth = 2 * u
  g.beginPath()
  g.arc(0, 0, 34 * u, 0, 7)
  g.fill()
  g.stroke()
  g.fillStyle = C.blood
  g.beginPath()
  g.moveTo(0, -28 * u)
  g.lineTo(9 * u, 8 * u)
  g.lineTo(0, 2 * u)
  g.lineTo(-9 * u, 8 * u)
  g.closePath()
  g.fill()
  g.fillStyle = C.ink
  g.font = `700 ${14 * u}px ${serif}`
  g.textAlign = 'center'
  g.fillText('С', 0, 24 * u)
  g.restore()
  g.textAlign = 'left'
  // линейка в км
  const kmPerCss = KM_PER_PX / screenPerPx(map.getZoom()),
    km = niceKm(kmPerCss * (mapW / d) * 0.18),
    bw = (km / kmPerCss) * d
  const bx = mapX + 24 * u,
    by = mapY + mapH - 30 * u
  g.fillStyle = '#f3ead4e6'
  g.fillRect(bx - 10 * u, by - 30 * u, bw + 90 * u, 52 * u)
  g.strokeStyle = '#222'
  g.lineWidth = 3 * u
  g.beginPath()
  g.moveTo(bx, by - 10 * u)
  g.lineTo(bx, by)
  g.lineTo(bx + bw, by)
  g.lineTo(bx + bw, by - 10 * u)
  g.moveTo(bx + bw / 2, by)
  g.lineTo(bx + bw / 2, by - 6 * u)
  g.stroke()
  g.fillStyle = C.ink
  g.font = `600 ${15 * u}px ${text}`
  g.fillText(`${km} км`, bx + bw + 10 * u, by)
  // легенда
  const y0 = mapY + mapH + 14 * u
  g.fillStyle = C.blood
  g.fillRect(m, y0 - 6 * u, mapW, 2 * u)
  g.fillStyle = C.ink
  g.font = `700 ${16 * u}px ${serif}`
  g.fillText('Легенда', m, y0 + 18 * u)
  g.font = `${13 * u}px ${text}`
  colsOf.forEach((c, i) => {
    let y = y0 + 44 * u
    const x = m + i * (colW + 12 * u)
    for (const { l, w } of c) {
      if (l.icon) drawIcon(g, l.icon.shape, l.icon.color, x + 8 * u, y - 4 * u, 6 * u)
      g.fillStyle = C.ink
      w.forEach((ln, j) => {
        g.fillText(ln, x + (l.icon ? 22 * u : 0), y + j * lh)
      })
      y += w.length * lh + 4 * u
    }
  })
  return out
}

export async function renderFrame(map: Map, info: FrameInfo): Promise<HTMLCanvasElement> {
  if (info.print) return renderPrint(map, info)
  const cv = map.getCanvas()
  const pr0 = map.getPixelRatio(),
    x2 = (info.scale ?? 1) === 2
  if (x2) {
    map.setPixelRatio(pr0 * 2)
    await new Promise<void>((r) => {
      map.once('idle', () => r())
      map.triggerRepaint()
    })
  }
  const shot = await new Promise<HTMLCanvasElement>((res) => {
    map.once('render', () => {
      const c = document.createElement('canvas')
      c.width = cv.width
      c.height = cv.height
      c.getContext('2d')!.drawImage(cv, 0, 0)
      res(c)
    })
    map.triggerRepaint()
  })
  if (x2) map.setPixelRatio(pr0)
  const k = shot.width / cv.clientWidth // device px на css px
  // общий вид: мир уже окна, по бокам виден фон — кадрируем по рамке карты
  const c0 = map.project(pxToLngLat([FRAME, FRAME])),
    c1 = map.project(pxToLngLat([W - FRAME, H - FRAME]))
  const cx0 = Math.max(0, Math.min(c0.x, c1.x)),
    cx1 = Math.min(cv.clientWidth, Math.max(c0.x, c1.x)),
    cy0 = Math.max(0, Math.min(c0.y, c1.y)),
    cy1 = Math.min(cv.clientHeight, Math.max(c0.y, c1.y))
  const trim =
    cx1 > cx0 + 40 && cy1 > cy0 + 40 && (cx0 > 8 || cy0 > 8 || cv.clientWidth - cx1 > 8 || cv.clientHeight - cy1 > 8)
  const offX = trim ? Math.ceil(cx0) : 0,
    offY = trim ? Math.ceil(cy0) : 0
  const view = document.createElement('canvas')
  view.width = Math.round((trim ? Math.floor(cx1) - offX : cv.clientWidth) * k)
  view.height = Math.round((trim ? Math.floor(cy1) - offY : cv.clientHeight) * k)
  view.getContext('2d')!.drawImage(shot, offX * k, offY * k, view.width, view.height, 0, 0, view.width, view.height)
  const serif = '"Cormorant Garamond", Georgia, serif',
    text = '"Literata", Georgia, serif'
  const lines = legendLines(map, info.year)
  const headH = Math.round(64 * k),
    lineH = Math.round(20 * k),
    footH = Math.round((16 + 24 + lines.length * 20) * k)
  const out = document.createElement('canvas')
  out.width = view.width
  out.height = headH + view.height + footH
  const g = out.getContext('2d')!
  g.fillStyle = C.parch
  g.fillRect(0, 0, out.width, out.height)
  g.fillStyle = C.ink
  g.fillRect(0, 0, out.width, headH)
  g.fillStyle = C.parch
  g.textBaseline = 'alphabetic'
  g.font = `700 ${Math.round(30 * k)}px ${serif}`
  g.fillText(`Атлас Дедрела — ${yearLabel(info.year)}`, 16 * k, 34 * k)
  g.font = `${Math.round(14 * k)}px ${text}`
  g.fillStyle = '#e0cf9f'
  if (info.caption) g.fillText([info.caption, info.sub].filter(Boolean).join(' · '), 16 * k, 56 * k)
  g.fillStyle = C.gold
  g.fillRect(0, headH - 2 * k, out.width, 2 * k)
  g.drawImage(view, 0, headH)
  // подписи мест сценария (DOM-маркеры в холст карты не попадают)
  g.font = `600 ${Math.round(13 * k)}px ${text}`
  g.textAlign = 'center'
  for (const p of getOverlay().places) {
    if (p.region) continue
    const pt = map.project(p.ll),
      x = (pt.x - offX) * k,
      y = headH + (pt.y - offY) * k + 24 * k
    g.lineWidth = 4 * k
    g.strokeStyle = '#f3ead4'
    g.strokeText(p.name, x, y)
    g.fillStyle = C.ink
    g.fillText(p.name, x, y)
  }
  g.textAlign = 'left'
  // легенда
  const y0 = headH + view.height
  g.fillStyle = C.blood
  g.fillRect(0, y0, out.width, 2 * k)
  const km = niceKm((KM_PER_PX / screenPerPx(map.getZoom())) * 120),
    w = (km / (KM_PER_PX / screenPerPx(map.getZoom()))) * k
  g.strokeStyle = '#222'
  g.lineWidth = 2 * k
  g.beginPath()
  g.moveTo(16 * k, y0 + 10 * k)
  g.lineTo(16 * k, y0 + 18 * k)
  g.lineTo(16 * k + w, y0 + 18 * k)
  g.lineTo(16 * k + w, y0 + 10 * k)
  g.stroke()
  g.fillStyle = C.ink
  g.font = `${Math.round(13 * k)}px ${text}`
  g.fillText(`${km} км`, 16 * k + w + 8 * k, y0 + 18 * k)
  lines.forEach((l, i) => {
    const yy = y0 + (40 + i * 20) * k
    if (l.icon) {
      drawIcon(g, l.icon.shape, l.icon.color, 24 * k, yy - 4 * k, 6 * k)
      g.fillStyle = C.ink
      g.fillText(l.text, 38 * k, yy)
    } else g.fillText(l.text, 16 * k, yy)
  })
  void lineH
  return out
}

export async function exportFrame(map: Map, info: FrameInfo, name = fileName(info.year)): Promise<string> {
  const c = await renderFrame(map, info)
  const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/png'))
  const url = URL.createObjectURL(blob),
    a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return name
}
