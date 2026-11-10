// Врезка Солнечных островов (≈4000 км за правым краем карты): схема из data/geo/sunny-islands-inset.yaml + стрелка морского пути на карте.
import { useEffect, useMemo, useState } from 'preact/hooks'
import { loadData } from '../data/load'
import { emit } from '../lib/bus'

type Isl = { name: string; place: string; x: number; y: number; r: number; note?: string }
type Hold = {
  id: string
  name: string
  place: string
  color: string
  polygon: [number, number][]
  sources: string[]
  islands: Isl[]
}
type Indep = Isl & { id: string; color: string; sources: string[] }
export const inset = await loadData<{
  meta: { title: string; caption: string; distance_km: number; frame: { w: number; h: number } }
  sea_route: { from: string[]; label: string; enters_at: [number, number] }
  holdings: Hold[]
  independent: Indep[]
  unplaced_islands: { names: string[] }
}>('geo/sunny-islands-inset')

export function SunnyInset({ close }: { close: () => void }) {
  const { w, h } = inset.meta.frame
  useEffect(() => {
    const b = document.querySelector<HTMLElement>('.sunny .sx')
    b?.focus({ preventScroll: true })
  }, [])
  const [hov, setHov] = useState<string | null>(null)
  const [er, ey] = inset.sea_route.enters_at
  const first = inset.holdings[0].islands[0]
  // подписи островов: если рамка пересекает уже поставленную, сдвигаем вниз; остров-метка не теряется (halo в CSS)
  const lblY = useMemo(() => {
    const all = [...inset.holdings.flatMap((hd) => hd.islands), ...inset.independent],
      placed: { x0: number; x1: number; y0: number; y1: number }[] = [],
      out = new Map<string, number>()
    for (const i of all) {
      const half = i.name.length * 3.1 + 2
      let y = i.y + i.r + 11
      for (
        let k = 0;
        k < 6 && placed.some((b) => i.x - half < b.x1 && i.x + half > b.x0 && y - 10 < b.y1 && y + 3 > b.y0);
        k++
      )
        y += 11
      placed.push({ x0: i.x - half, x1: i.x + half, y0: y - 10, y1: y + 3 })
      out.set(i.name, y)
    }
    return out
  }, [])
  return (
    <div class="sunny" role="region" aria-label="Врезка Солнечных островов">
      <div class="sunny-h">
        <b>{inset.meta.title}</b>
        <button class="sx" onClick={close} title="Скрыть врезку" aria-label="Скрыть врезку">
          ✕
        </button>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} class="sunny-svg">
        <defs>
          <marker
            id="arr"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0 0 10 5 0 10z" fill="#1f5fa8" />
          </marker>
        </defs>
        <rect width={w} height={h} fill="#cfe0e4" />
        <path
          d={`M${er} ${ey} L${first.x - first.r - 3} ${first.y + 3}`}
          stroke="#1f5fa8"
          stroke-width="3"
          stroke-dasharray="6 4"
          marker-end="url(#arr)"
          fill="none"
        />
        <text class="sunny-t">
          <tspan x="3" y={ey + 14}>
            от Гарна
          </tspan>
          <tspan x="3" y={ey + 25}>
            и Олифанора
          </tspan>
        </text>
        {inset.holdings.map((hd) => (
          <g
            class={`sh ${hov === hd.id ? 'hov' : ''}`}
            onMouseEnter={() => setHov(hd.id)}
            onMouseLeave={() => setHov(null)}
          >
            <polygon
              points={hd.polygon.map((p) => p.join(',')).join(' ')}
              fill={hd.color}
              fill-opacity="0.28"
              stroke={hd.color}
              stroke-width="2"
              stroke-dasharray="5 3"
              onClick={() => emit('dossier', { t: 'place', id: hd.place })}
            >
              <title>{`${hd.name} — открыть досье (форма условная)`}</title>
            </polygon>
            {hd.islands.map((i) => (
              <circle
                cx={i.x}
                cy={i.y}
                r={i.r}
                fill={hd.color}
                stroke="#fff"
                stroke-width="1.5"
                onClick={() => emit('dossier', { t: 'place', id: i.place })}
              >
                <title>{`${i.name}${i.note ? ' — ' + i.note : ''}`}</title>
              </circle>
            ))}
            {hd.islands.map((i) => (
              <text x={i.x} y={lblY.get(i.name) ?? i.y + i.r + 11} text-anchor="middle" class="sunny-t">
                {i.name}
              </text>
            ))}
            <text x={hd.polygon[0][0]} y={Math.min(...hd.polygon.map((p) => p[1])) - 5} class="sunny-n" fill={hd.color}>
              {hd.name}
            </text>
          </g>
        ))}
        {inset.independent.map((i) => (
          <g class="sh">
            <circle
              cx={i.x}
              cy={i.y}
              r={i.r}
              fill={i.color}
              stroke="#fff"
              stroke-width="1.5"
              onClick={() => emit('dossier', { t: 'place', id: i.place })}
            >
              <title>{`${i.name} — ${i.note}`}</title>
            </circle>
            <text x={i.x} y={lblY.get(i.name) ?? i.y + i.r + 11} text-anchor="middle" class="sunny-t">
              {i.name}
            </text>
          </g>
        ))}
      </svg>
      <div class="sunny-cap">
        ≈{inset.meta.distance_km} км к востоку от Гарна. Масштаб условный: форма и взаимное положение островов
        предположительны, а какие острова чьи — по вики.
      </div>
      <div class="sunny-cap">Названы без положения: {inset.unplaced_islands.names.join(', ')}.</div>
    </div>
  )
}
