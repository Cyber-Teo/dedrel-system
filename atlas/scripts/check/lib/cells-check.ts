// Проверки мозаики ячеек: покрытие суши, отсутствие пересечений, ячейка внутри своего state_1006. Растеризация в 1/SCALE пикселя карты.
import type { Poly } from './geo-check'
export const SCALE = 8

/** Растеризация мультиполигона по чётности; для каждого центра клетки вызывает cb(индекс). */
export function raster(polys: Poly[], w: number, h: number, cb: (i: number) => void) {
  const gw = Math.ceil(w / SCALE),
    gh = Math.ceil(h / SCALE)
  for (const poly of polys) {
    let y0 = Infinity,
      y1 = -Infinity
    for (const r of poly)
      for (const p of r) {
        y0 = Math.min(y0, p[1])
        y1 = Math.max(y1, p[1])
      }
    for (let gy = Math.max(0, Math.floor(y0 / SCALE - 0.5)); gy <= Math.min(gh - 1, Math.ceil(y1 / SCALE)); gy++) {
      const y = (gy + 0.5) * SCALE,
        xs: number[] = []
      for (const r of poly)
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
          const [xi, yi] = r[i],
            [xj, yj] = r[j]
          if (yi > y !== yj > y) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi)
        }
      xs.sort((a, b) => a - b)
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let gx = Math.max(0, Math.ceil(xs[k] / SCALE - 0.5)); gx * SCALE + SCALE / 2 < xs[k + 1] && gx < gw; gx++)
          cb(gy * gw + gx)
    }
  }
}

export type CellsReport = { errors: string[]; stat: string }
export function checkCells(
  cells: Map<string, { polys: Poly[]; state: string }>,
  land: Poly[],
  states: Map<string, Poly[]>,
  w: number,
  h: number,
): CellsReport {
  const errors: string[] = []
  const n = Math.ceil(w / SCALE) * Math.ceil(h / SCALE)
  const landR = new Uint8Array(n)
  raster(land, w, h, (i) => (landR[i] = 1))
  const cnt = new Uint8Array(n)
  const stLab = new Int16Array(n).fill(-1)
  const stIds = [...states.keys()]
  stIds.forEach((id, k) => raster(states.get(id)!, w, h, (i) => (stLab[i] = k)))
  let outside = 0,
    total = 0
  for (const [id, c] of cells) {
    const k = stIds.indexOf(c.state)
    let bad = 0,
      tot = 0
    if (k < 0) errors.push(`cells: «${id}»: state_1006 «${c.state}» нет среди государств`)
    raster(c.polys, w, h, (i) => {
      cnt[i]++
      tot++
      if (k >= 0 && stLab[i] !== k && stLab[i] !== -1) bad++
    })
    if (tot > 0 && bad / tot > 0.02)
      errors.push(`cells: «${id}»: ${((100 * bad) / tot).toFixed(1)}% площади вне государства «${c.state}»`)
    outside += bad
    total += tot
  }
  let landN = 0,
    covered = 0,
    over = 0
  for (let i = 0; i < n; i++) {
    if (landR[i]) {
      landN++
      if (cnt[i] >= 1) covered++
    }
    if (cnt[i] > 1) over++
  }
  const cov = covered / landN
  if (cov < 0.995) errors.push(`cells: покрытие суши ${(100 * cov).toFixed(2)}% < 99,5%`)
  if (over / landN > 0.001)
    errors.push(`cells: пересечения ячеек ${((100 * over) / landN).toFixed(2)}% клеток суши (допуск 0,1%)`)
  return {
    errors,
    stat: `ячеек ${cells.size}: покрытие суши ${(100 * cov).toFixed(2)}%, пересечения ${((100 * over) / landN).toFixed(3)}%, вне своего государства ${((100 * outside) / Math.max(1, total)).toFixed(2)}%`,
  }
}
