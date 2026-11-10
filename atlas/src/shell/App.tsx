// Корневой компонент оболочки: состояние года, подложки и слоёв; остальное — в хуках и компонентах shell/.
import type { Map } from 'maplibre-gl'
import { useState } from 'preact/hooks'
import { createPortal } from 'preact/compat'
import { dossierSlot } from '../dossier'
import { clampYear } from '../chronicle/yearFormat'
import type { Mode } from '../hash'
import { useDockHeight } from '../hooks/useDockHeight'
import { eventTotals, useEventWindow } from '../hooks/useEventWindow'
import { useEventCards } from '../hooks/useEventCards'
import { useHashSync } from '../hooks/useHashSync'
import { useShellPanels } from '../hooks/useShellPanels'
import { useZoom } from '../hooks/useZoom'
import { LayersUI } from '../layers/LayersUI'
import { readLayerIds, withLayerIds } from '../layers/layerHash'
import { GraphTools } from '../graph/GraphTools'
import { HistoryToggles } from '../history/ui'
import { MasterUI } from '../MasterUI'
import { readyIds, useMaster } from '../master'
import { PRESETS, applyPreset } from '../presets/presets'
import { PresetsUI } from '../presets/PresetsUI'
import { Ruler } from '../route/Ruler'
import { RouteTool } from '../route/RouteTool'
import { ScenariosUI } from '../scenarios/ScenariosUI'
import { EventCard } from '../search/EventCard'
import { SearchUI } from '../search/ui'
import { Timeline } from '../timeline/Timeline'
import { useActiveTool } from '../ui/activeTool'
import { isToolsSheet } from '../ui/breakpoints'
import { byId } from '../ui/dom'
import { Help } from '../ui/Help'
import { Onboarding } from '../ui/Onboarding'
import { toolGroup } from '../ui/toolGroup'
import { announce } from './a11y'
import { EventsLayerCard } from './EventsLayerCard'
import { HeaderButtons } from './HeaderButtons'
import { ScaleBar } from './ScaleBar'
import type { HeaderHosts } from './toolRail'
import { ZoomControls } from './ZoomControls'
import { emit } from '../lib/bus'

type Props = { map: Map; startMode: Mode; startYear: number; startWin: number; hosts: HeaderHosts }

export function App({ map, startMode, startYear, startWin, hosts }: Props) {
  const [mode, setMode] = useState<Mode>(startMode)
  const [year, setYear0] = useState(startYear)
  const [win, setWin] = useState(startWin)
  const [layersOn, setLayersOn] = useState<string[]>([])
  const setYear = (y: number) => setYear0(clampYear(y))
  const activeTool = useActiveTool()
  const master = useMaster()
  const evOn = layersOn.includes('events')
  const rumOn = master && layersOn.includes('rumors')

  const zoom = useZoom(map)
  const w = useEventWindow(year, win, master)
  const cards = useEventCards({
    map,
    year,
    win,
    evOn,
    rumOn,
    toolActive: !!activeTool,
    near: w.near,
    nearMaster: w.nearMaster,
  })
  const panels = useShellPanels({ map, moreMenu: hosts.moreMenu, master, activeToolId: activeTool?.id })
  useHashSync(map, year, setYear0, mode, setMode)
  useDockHeight(map)

  // Подложку меняет только пользователь (кнопка «Подложка» или ссылка с m=): политика, пресеты и сценарии её не трогают.
  const pickMode = (m: Mode) => {
    setMode(m)
    announce(`Подложка: ${m === 'muted' ? 'приглушённая' : 'рисованная'}`)
  }
  const presetById = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)
    if (p) applyPreset(p, readyIds, {})
  }
  const showEvents = () => {
    history.replaceState(
      null,
      '',
      withLayerIds(location.hash, [...new Set([...readLayerIds(location.hash), 'events'])]),
    )
    dispatchEvent(new HashChangeEvent('hashchange'))
  }
  const onMapCount = w.onMap + (master ? w.rumOnMap : 0)

  return (
    <>
      <HeaderButtons
        mode={mode}
        onMode={pickMode}
        moreOpen={panels.moreOpen}
        onMore={() => panels.setMoreOpen(!panels.moreOpen)}
        moreBtnHost={hosts.moreBtnHost}
        searchOpen={panels.searchOpen}
        onSearch={() => panels.setSearchOpen(!panels.searchOpen)}
        searchBtnHost={hosts.searchBtnHost}
        toolsOpen={panels.toolsOpen}
        onTools={() => panels.setToolsOpen(!panels.toolsOpen)}
      />
      <SearchUI
        map={map}
        year={year}
        setYear={setYear}
        ruler={!!activeTool}
        openEvent={(e) => {
          cards.openEvent(e)
          panels.setSearchOpen(false)
        }}
      />
      {createPortal(<HistoryToggles map={map} year={year} />, toolGroup('hist'))}
      <Ruler map={map} />
      <RouteTool map={map} />
      <ScenariosUI map={map} year={year} setYear={setYear} />
      <PresetsUI map={map} year={year} setYear={setYear} />
      <GraphTools map={map} />
      <Help onWelcome={() => emit('welcome')} />
      <Onboarding presetById={presetById} showEvents={showEvents} />
      <ZoomControls map={map} zoom={zoom} />
      {createPortal(
        <>
          {cards.card && (
            <EventCard
              sel={cards.sel}
              si={cards.si}
              setSi={cards.setSi}
              close={cards.closeCards}
              back={evOn ? cards.openLayerCard : undefined}
            />
          )}
          {cards.layerCard && !cards.card && evOn && (
            <EventsLayerCard
              year={year}
              win={win}
              listed={w.listed}
              noXY={w.noXY}
              onMapCount={onMapCount}
              onPick={cards.pickFromLayerCard}
              onClose={cards.closeLayerCard}
            />
          )}
        </>,
        dossierSlot(),
      )}
      {createPortal(
        <Timeline year={year} setYear={setYear} win={win} setWin={setWin} evCount={w.listed.length} evOn={evOn} />,
        byId('dock'),
      )}
      <MasterUI />
      <LayersUI
        map={map}
        year={year}
        win={win}
        onActive={setLayersOn}
        evStats={{ vis: w.onMap, tot: eventTotals.public }}
        rumStats={{ vis: w.rumOnMap, tot: eventTotals.master }}
        onOpenEvents={cards.openLayerCard}
      />
      {panels.toolsOpen && isToolsSheet() && <div id="tools-scrim" onClick={panels.closeTools} />}
      <ScaleBar zoom={zoom} />
    </>
  )
}
