export default class AmmunitionDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      description: new fields.HTMLField({ label: "Description" }),
      ammo_type: new fields.StringField({ initial: "arrow", label: "Ammo Type" }), // arrow, bolt, bullet, etc.
      quantity: new fields.NumberField({ initial: 20, integer: true, min: 0, label: "Quantity" }),
      damage_bonus: new fields.StringField({ initial: "", label: "Damage Bonus Formula" }),
      equipped: new fields.BooleanField({ initial: false, label: "Equipped" })
    };
  }
}
