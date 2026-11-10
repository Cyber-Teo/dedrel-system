// Скорости и коэффициенты передвижения. Источник скоростей — вики (services_prices), коэффициентов местности — docs/plan/layers.md.
// Единицы: расстояния в километрах, скорости в км/сутки, часы — ходовые часы в сутки, коэффициенты — доли от скорости по тракту.
export type Mode = 'foot' | 'horse' | 'cart' | 'griffon' | 'ship'
export type Cat = 'paved' | 'gravel' | 'direction' | 'off' | 'sea' | 'river' | 'air'

/** kmDay — км в сутки по тракту; hpd — ходовых часов в сутки (корабль идёт круглые сутки). */
export const MODES: Record<Mode, { name: string; kmDay: number; hpd: number }> = {
  foot: { name: 'Пешком', kmDay: 22, hpd: 10 },
  horse: { name: 'Верхом', kmDay: 50, hpd: 10 },
  cart: { name: 'Телега', kmDay: 30, hpd: 10 },
  griffon: { name: 'Грифон', kmDay: 100, hpd: 10 },
  ship: { name: 'Корабль', kmDay: 240, hpd: 24 },
}
/** Скорость корабля, км/сутки. */
export const SHIP_KM_DAY = MODES.ship.kmDay
/** Дороги, коэффициент к скорости: тракт ×1,0, грунтовка ×0,8; «направление» (дорога без уточнения) считаем тоже грунтовкой. */
export const ROAD_FACTOR: Record<'paved' | 'gravel' | 'direction', number> = { paved: 1, gravel: 0.8, direction: 1 }
/** Местность вне дорог, коэффициент к скорости. */
export const TERRAIN_FACTOR: Record<string, number> = { forest: 0.6, mountains: 0.5, desert: 0.7, swamp: 0.3 }
/** Бездорожье по открытой местности, коэффициент к скорости. */
export const OPEN_FACTOR = 0.7
/** Телега вне дорог тащится ещё хуже: дополнительный коэффициент к скорости. */
export const CART_OFFROAD = 0.6
/** Против течения реки корабль идёт вдвое медленнее: коэффициент к скорости. */
export const UPSTREAM = 0.5
/** Квадратных километров в одном квадратном пикселе карты: 1 px = 0,25 км по стороне, то есть 1/16 км². */
export const KM2_PER_PX2 = 1 / 16
