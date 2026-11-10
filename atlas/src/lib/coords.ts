// Обход координат GeoJSON любой вложенности (точка, линия, кольцо, мультиполигон) и перевод геометрии из пикселей карты в lng/lat.
// Типы заданы здесь: пакет @types/geojson не объявлен в package.json, а его глобальное пространство имён TypeScript не находит.
import { pxToLngLat, type Px } from '../geo/pixel'

export type Position = number[]
/** Координаты любой глубины: позиция [x, y] или массив вложенных координат. */
export type Coords = Position | Coords[]
export type SimpleGeometry = { type: string; coordinates: Coords }
export type PointFeature<P = Record<string, unknown>> = {
  type: 'Feature'
  id?: string | number
  properties: P
  geometry: { type: 'Point'; coordinates: Position }
}
export type FeatureCollection<F = PointFeature> = { type: 'FeatureCollection'; features: F[] }

export const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] }

const isPosition = (c: Coords): c is Position => typeof c[0] === 'number'

/** Применить fn к каждой позиции, сохранив вложенность. */
export function mapCoords(c: Coords, fn: (p: Position) => Position): Coords {
  return isPosition(c) ? fn(c) : c.map((x) => mapCoords(x, fn))
}

/** Все позиции геометрии одним списком. */
export function flatCoords(c: Coords): Position[] {
  return isPosition(c) ? [c] : c.flatMap(flatCoords)
}

/** Границы позиций: [минимум x, минимум y, максимум x, максимум y]. Пустой набор даёт [Infinity, Infinity, -Infinity, -Infinity]. */
export function bbox(c: Coords): [number, number, number, number] {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity
  for (const [x, y] of flatCoords(c)) {
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  }
  return [x0, y0, x1, y1]
}

/** Геометрия в пикселях карты → геометрия в lng/lat (то, что понимает MapLibre). */
export function convertGeometry<G extends SimpleGeometry>(g: G): G {
  return { ...g, coordinates: mapCoords(g.coordinates as Coords, (p) => pxToLngLat(p as Px)) } as G
}

/** Объект GeoJSON с произвольной геометрией и свойствами. */
export type Feat<P = Record<string, unknown>> = {
  type: 'Feature'
  id?: string | number
  properties: P
  geometry: SimpleGeometry
}

/**
 * Записать объекты в источник GeoJSON одним вызовом.
 * Приведение к never — единственное место, где типы объектов сходятся с типами MapLibre
 * (пакет @types/geojson для проекта не объявлен, свои типы структурно совместимы).
 */
export function setFeatures(src: { setData(data: never): unknown } | undefined, features: readonly object[]): void {
  src?.setData({ type: 'FeatureCollection', features } as never)
}
