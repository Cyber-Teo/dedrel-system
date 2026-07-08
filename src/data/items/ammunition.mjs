import { physicalItemFields } from "./_physical.mjs";

export default class AmmunitionDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      description: new fields.HTMLField({ required: false, blank: true, initial: "" }),
      key: new fields.StringField({ required: false, initial: "" }),
      // Общие физические поля (редкость/вес/цена)
      ...physicalItemFields({ weight: 0.05 }),
      ammo_type: new fields.StringField({ initial: "arrow", label: "Ammo Type" }), // arrow, bolt, bullet, etc.
      quantity: new fields.NumberField({ initial: 20, integer: true, min: 0, label: "Quantity" }),
      stackable: new fields.BooleanField({ initial: true }),
      damage_bonus: new fields.StringField({ initial: "", label: "Damage Bonus Formula" }),
      equipped: new fields.BooleanField({ initial: false, label: "Equipped" })
    };
  }
}
