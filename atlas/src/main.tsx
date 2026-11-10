import 'maplibre-gl/dist/maplibre-gl.css'
import './style.css'
import './scenarios/scenarios.css'
import { render } from 'preact'
import { createMap } from './map/createMap'
import { installA11y } from './shell/a11y'
import { App } from './shell/App'
import { installHeaderHosts, installToolRail } from './shell/toolRail'
import { readStartState } from './shell/startState'
import { byId } from './ui/dom'

// Порядок важен: оболочка перестраивает разметку (карта уходит в <main>) до создания карты.
const start = readStartState()
installA11y()
const map = createMap(start.view, start.hasView)
installToolRail()
const hosts = installHeaderHosts()
if (start.master) document.body.classList.add('master-q')

render(
  <App map={map} startMode={start.view.mode} startYear={start.year} startWin={start.win} hosts={hosts} />,
  byId('ui'),
)
