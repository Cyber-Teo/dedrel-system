// Кнопки «Связи», «Схема Иллиора», «Солнечные острова» в колонке инструментов + их окна; врезка живёт в углу карты.
import { useEffect, useState } from 'preact/hooks'
import { createPortal } from 'preact/compat'
import type { Map } from 'maplibre-gl'
import { Suspense, lazy } from 'preact/compat'
import { useSeaRoute } from './seaRoute'
import { toolGroup } from '../ui/toolGroup'
import { ToolBtn } from '../ui/ToolBtn'
import { useOverlay } from '../ui/overlayStack'
import { store } from '../ui/panels'
import { on } from '../lib/bus'
import './graph.css'

// окна грузятся при первом открытии (граф, схема Иллиора, врезка — отдельные чанки)
const GraphWindow = lazy(() => import('./GraphWindow').then((m) => ({ default: m.GraphWindow })))
const IlliorScheme = lazy(() => import('./IlliorScheme').then((m) => ({ default: m.IlliorScheme })))
const SunnyInset = lazy(() => import('./SunnyInset').then((m) => ({ default: m.SunnyInset })))

const q = new URLSearchParams(location.search).get('view') ?? ''
export function GraphTools({ map }: { map: Map }) {
  const [graph, setGraph] = useState(q === 'graph')
  const [focusId, setFocusId] = useState<string | undefined>()
  const [city, setCity] = useState(q === 'illior')
  // врезка по умолчанию свёрнута (чип в группе «Окна»); явный выбор запоминается
  const [sunny, setSunny0] = useState(() => (q === 'nosunny' ? false : q === 'sunny' || store.get('sunny') === '1'))
  const setSunny = (v: boolean) => {
    setSunny0(v)
    store.set('sunny', v ? '1' : '0')
  }
  // окно поверх всего: мобильное меню инструментов закрываем
  const closeMenu = () => document.querySelector<HTMLButtonElement>('.tools-btn[aria-expanded="true"]')?.click()
  useEffect(() => {
    if (graph || city || sunny) closeMenu()
  }, [graph, city, sunny])
  useOverlay(graph, () => setGraph(false), 0)
  useOverlay(city, () => setCity(false), 0)
  useOverlay(sunny, () => setSunny(false), 3)
  useEffect(
    () =>
      on('graph-focus', ({ id }) => {
        setFocusId(id)
        setGraph(true)
      }),
    [],
  )
  useSeaRoute(map, () => setSunny(true))
  return (
    <>
      {createPortal(
        <>
          <ToolBtn
            n="links"
            title="Граф связей между людьми, местами и организациями"
            on={graph}
            onClick={() => {
              setFocusId(undefined)
              setGraph(true)
            }}
          >
            Связи
          </ToolBtn>
          <ToolBtn n="scheme" title="Схема города Иллиор" on={city} onClick={() => setCity(true)}>
            Схема Иллиора
          </ToolBtn>
          <ToolBtn
            n="islands"
            title="Врезка: Солнечные острова за краем карты"
            on={sunny}
            onClick={() => setSunny(!sunny)}
          >
            Острова за краем карты
          </ToolBtn>
        </>,
        toolGroup('win'),
      )}
      {sunny &&
        createPortal(
          <Suspense fallback={null}>
            <SunnyInset close={() => setSunny(false)} />
          </Suspense>,
          document.body,
        )}
      {graph &&
        createPortal(
          <Suspense fallback={null}>
            <GraphWindow close={() => setGraph(false)} focusId={focusId} />
          </Suspense>,
          document.body,
        )}
      {city &&
        createPortal(
          <Suspense fallback={null}>
            <IlliorScheme close={() => setCity(false)} />
          </Suspense>,
          document.body,
        )}
    </>
  )
}
