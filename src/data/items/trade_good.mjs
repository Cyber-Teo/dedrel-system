import { craftingFields, migrateCraftingData } from "./_crafting.mjs";

export default class TradeGoodData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { HTMLField, StringField, NumberField, BooleanField } = foundry.data.fields;
    return {
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      key: new StringField({ required: false, initial: "" }),
      rarity: new StringField({ required: true, initial: "common" }),
      weight: new NumberField({ required: true, initial: 0, min: 0 }),
      base_price: new NumberField({ required: true, initial: 0, min: 0 }),
      ...craftingFields(),
      unit_type: new StringField({ required: true, initial: "item" }),
      stackable: new BooleanField({ required: true, initial: true })
    };
  }

  static migrateData(source) {
    migrateCraftingData(source);
    return super.migrateData(source);
  }
}
