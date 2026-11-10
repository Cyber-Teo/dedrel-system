// «Модельки» на карте: миниатюры-фишки крупнее значков (с тенью), корабли и караваны на путях, головы походов и «Миниатюры мира».
// Движение — requestAnimationFrame с троттлингом; при prefers-reduced-motion модельки неподвижны. Части лежат в соседних файлах:
// modelImage (образы), modelLines (пути), animation (кадры), minis, coats, ships, caravans, placeModels.
import type { Map } from 'maplibre-gl'
import type { Px } from '../geo/pixel'
import { addMissingResolver } from './icons'
import { attachAnimation } from './animation'
import { addModelImage, crossImage } from './modelImage'
import { addModelLayers } from './modelLayers'
import { registerLines } from './modelLines'
import { initMiniCard } from './miniCard'
import { installPlaceModels } from './placeModels'
import './icons.css'

export { campaignModel, updateModels } from './animation'
export { renderModel } from './modelImage'
export { miniDeclutter, miniOffsets, miniVisible, setMinis } from './minis'
export { liveCoats, shieldImage } from './coats'

export const modelLayerIds = ['models-route', 'models-camp', 'models-camp-end', 'models-mini', 'models-mini-cl']
export const setModelsVisible = (map: Map, v: boolean) => {
  for (const id of modelLayerIds) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none')
}

let installed: Map | null = null

export function initModels(map: Map, geo: { id: string; kind: string; px: Px[] }[], before?: string) {
  if (installed === map) return
  installed = map
  registerLines(geo)
  // SVG моделей грузятся по требованию (ensureModelImg / setMinis), когда включён их слой, а не на старте
  attachAnimation(map)
  map.addImage('camp-end', crossImage(), { pixelRatio: 2 })
  addMissingResolver(map, (id) => addModelImage(map, id))
  addModelLayers(map, before)
  installPlaceModels(map, before)
  initMiniCard(map)
}
