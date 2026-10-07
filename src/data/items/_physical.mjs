import { ITEM_RARITY_ENUM } from "../../constants.mjs";

/**
 * Shared set of "physical" item fields: rarity, weight, base price.
 * Spread into defineSchema() of the concrete item types so that the economy
 * (wallet, merchants) and the encumbrance calculation work uniformly.
 *
 * Quantity and stackable are deliberately not included here:
 * different types have their own defaults (weapon — 1, ammunition — 20), so they
 * are declared in the type's own schema.
 *
 * @param {object} [defaults]
 * @param {number} [defaults.weight]     Initial weight of one unit (kg).
 * @param {number} [defaults.base_price] Initial base price (in base currency units).
 * @param {string} [defaults.rarity]     Initial rarity.
 * @returns {object} Field object to spread into defineSchema().
 */
export function physicalItemFields({ weight = 0, base_price = 0, rarity = "common" } = {}) {
  const { StringField, NumberField } = foundry.data.fields;
  return {
    rarity: new StringField({ required: true, nullable: false, initial: rarity, choices: ITEM_RARITY_ENUM }),
    weight: new NumberField({ required: true, nullable: false, initial: weight, min: 0 }),
    base_price: new NumberField({ required: true, nullable: false, initial: base_price, min: 0 })
  };
}
