import { ITEM_RARITY_ENUM } from "../../constants.mjs";

/**
 * Service — an intangible purchasable item (rental, teleport, food, lodging).
 * NOT physical: no weight, doesn't count toward inventory encumbrance and isn't "carried".
 * When bought from a merchant the money is deducted, a receipt drops into chat, and if the
 * item has transferable Active Effects, they are applied to the buyer
 * (e.g. a buff from a hearty meal). Nothing goes into the inventory.
 */
export default class ServiceDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { HTMLField, StringField, NumberField } = foundry.data.fields;
    return {
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      key: new StringField({ required: false, initial: "" }),
      rarity: new StringField({ required: true, initial: "common", choices: ITEM_RARITY_ENUM }),
      base_price: new NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      // Free-form service type tag: rental, teleport, meal, lodging, toll, ...
      service_type: new StringField({ required: false, initial: "" })
    };
  }
}
