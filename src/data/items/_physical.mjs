import { ITEM_RARITY_ENUM } from "../../constants.mjs";

/**
 * Общий набор «физических» полей предмета: редкость, вес, базовая цена.
 * Спредится в defineSchema() конкретных типов предметов, чтобы экономика
 * (кошелёк, торговцы) и расчёт перегрузки работали единообразно.
 *
 * Количество (quantity) и «стакаемость» (stackable) не входят сюда намеренно:
 * у разных типов свои дефолты (оружие — 1, боеприпасы — 20), поэтому они
 * объявляются в схеме самого типа.
 *
 * @param {object} [defaults]
 * @param {number} [defaults.weight]     Начальный вес одной единицы (кг).
 * @param {number} [defaults.base_price] Начальная базовая цена (в базовых единицах валюты).
 * @param {string} [defaults.rarity]     Начальная редкость.
 * @returns {object} Объект полей для спреда в defineSchema().
 */
export function physicalItemFields({ weight = 0, base_price = 0, rarity = "common" } = {}) {
  const { StringField, NumberField } = foundry.data.fields;
  return {
    rarity: new StringField({ required: true, nullable: false, initial: rarity, choices: ITEM_RARITY_ENUM }),
    weight: new NumberField({ required: true, nullable: false, initial: weight, min: 0 }),
    base_price: new NumberField({ required: true, nullable: false, initial: base_price, min: 0 })
  };
}
