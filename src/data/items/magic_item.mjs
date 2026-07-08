import { physicalItemFields } from "./_physical.mjs";

export default class MagicItemDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      description: new fields.HTMLField({ label: "Description" }),
      key: new fields.StringField({ initial: "" }),
      // Магические предметы по умолчанию как минимум необычные
      ...physicalItemFields({ rarity: "uncommon" }),
      stackable: new fields.BooleanField({ initial: false }),
      consumable: new fields.BooleanField({ initial: false, label: "Consumable" }),
      quantity: new fields.NumberField({ initial: 1, integer: true, label: "Quantity" }),
      formula_heal: new fields.StringField({ initial: "", label: "Healing Formula" })
    };
  }
}
