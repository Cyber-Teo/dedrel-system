export default class LootData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { HTMLField, StringField, NumberField, BooleanField } = foundry.data.fields;
    return {
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      rarity: new StringField({ required: true, initial: "common" }), 
      weight: new NumberField({ required: true, initial: 0, min: 0 }),
      base_price: new NumberField({ required: true, initial: 0, min: 0 }),
      stackable: new BooleanField({ required: true, initial: true }),
      quantity: new NumberField({ required: true, integer: true, initial: 1, min: 0 })
    };
  }
}
