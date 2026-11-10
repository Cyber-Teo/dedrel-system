// Деньги: 10 медных = 1 серебряная, 10 серебряных = 1 золотая, 10 золотых = 1 платиновая (вики: knowledges/monetary_system).
export type Coin = 'copper' | 'silver' | 'gold' | 'platinum'
export const COINS: { id: Coin; name: string; one: string; copper: number }[] = [
  { id: 'copper', name: 'медные', one: 'медная', copper: 1 },
  { id: 'silver', name: 'серебряные', one: 'серебряная', copper: 10 },
  { id: 'gold', name: 'золотые', one: 'золотая', copper: 100 },
  { id: 'platinum', name: 'платиновые', one: 'платиновая', copper: 1000 },
]
const val = (c: Coin) => COINS.find((x) => x.id === c)!.copper
export const toCopper = (n: number, c: Coin) => n * val(c)
export const exchange = (n: number, from: Coin, to: Coin) => (n * val(from)) / val(to)
export const parseAmount = (s: string): number | null => {
  // пробелы-разделители тысяч (обычный, неразрывный, узкий, тонкий) не мешают: «1 000» = 1000
  const t = s.replace(/[\s\u00a0\u202f\u2009]/g, '').replace(',', '.')
  const v = Number(t)
  return t !== '' && Number.isFinite(v) && v >= 0 ? v : null
}
/** Целую сумму в медных — в монеты покрупнее (жадно). */
export function breakdown(copper: number): Record<Coin, number> {
  let r = Math.floor(copper)
  const out = { platinum: 0, gold: 0, silver: 0, copper: 0 }
  for (const c of [...COINS].reverse()) {
    out[c.id] = Math.floor(r / c.copper)
    r %= c.copper
  }
  return out
}

export type Price = { group: string; name: string; copper: number; per?: string; note?: string }
const G = 100,
  S = 10
// Цены из вики (knowledges/services_prices); в разных местах отличаются до ±30%.
export const PRICES: Price[] = [
  { group: 'Транспорт', name: 'Аренда лошади', copper: 10 * G, per: 'сутки', note: 'по тракту до 50 км в день' },
  { group: 'Транспорт', name: 'Покупка ездовой лошади', copper: 75 * G },
  { group: 'Транспорт', name: 'Покупка тягловой лошади', copper: 50 * G },
  { group: 'Транспорт', name: 'Покупка боевой лошади', copper: 400 * G },
  { group: 'Транспорт', name: 'Содержание лошади', copper: 3, per: 'день' },
  { group: 'Транспорт', name: 'Покупка телеги', copper: 50 * G, note: 'одна лошадь, 30 км в день' },
  { group: 'Транспорт', name: 'Покупка фургона', copper: 100 * G, note: 'две лошади, 30 км в день' },
  { group: 'Транспорт', name: 'Покупка кареты (от)', copper: 300 * G, note: 'до 15 000 золотых — по отделке и защите' },
  {
    group: 'Транспорт',
    name: 'Аренда грифона',
    copper: 40 * G,
    per: 'сутки',
    note: 'до 100 км в день в хорошую погоду',
  },
  { group: 'Транспорт', name: 'Покупка грифона', copper: 1600 * G },
  { group: 'Транспорт', name: 'Содержание грифона', copper: 2 * G, per: 'день' },
  { group: 'Транспорт', name: 'Место на корабле', copper: 2 * S, per: 'км пути', note: 'в среднем, 10 км в час' },
  {
    group: 'Транспорт',
    name: 'Телепортация в гильдии Арканум',
    copper: 1 * G,
    per: 'км',
    note: 'до пяти существ; перемещения записываются',
  },
  {
    group: 'Транспорт',
    name: 'Телепортация у Канализационных Крыс',
    copper: 2 * G,
    per: 'км',
    note: 'до пяти существ; не отслеживается, нужны связи',
  },
  { group: 'Заведения', name: 'Очень дёшево (до)', copper: 1 * S },
  { group: 'Заведения', name: 'Дёшево (до)', copper: 2 * S },
  { group: 'Заведения', name: 'Средне (до)', copper: 10 * S },
  { group: 'Заведения', name: 'Дорого (до)', copper: 50 * G },
  { group: 'Заведения', name: 'Очень дорого (от)', copper: 50 * G },
  { group: 'Доход', name: 'Свободный крестьянин', copper: 300 * G, per: 'год' },
  { group: 'Доход', name: 'Наёмный работник', copper: 700 * G, per: 'год' },
  { group: 'Доход', name: 'Купец или ремесленник из гильдии', copper: 2000 * G, per: 'год' },
  { group: 'Доход', name: 'Наёмник', copper: 5000 * G, per: 'год', note: 'между заказами дохода нет' },
  { group: 'Доход', name: 'Служащий банка, землевладелец', copper: 8000 * G, per: 'год' },
]
