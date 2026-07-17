import { ACCESSORY_SLOT_TYPES } from "../../constants.mjs";
import { craftingFields, migrateCraftingData } from "./_crafting.mjs";

export default class LootData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { HTMLField, StringField, NumberField, BooleanField } = foundry.data.fields;
    return {
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      key: new StringField({ required: false, initial: "" }),
      rarity: new StringField({ required: true, initial: "common" }),
      // Аксессуарный слот (пояс→torso, ожерелье→neck и т.п. для «безделушек»)
      equip_slot: new StringField({ required: false, blank: true, initial: "", choices: ACCESSORY_SLOT_TYPES }),
      weight: new NumberField({ required: true, initial: 0, min: 0 }),
      base_price: new NumberField({ required: true, initial: 0, min: 0 }),
      ...craftingFields(),
      stackable: new BooleanField({ required: true, initial: true }),
      quantity: new NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      formula_heal: new StringField({ initial: "", label: "Healing Formula" }),
      // Выдача временных хитов при использовании (число, дайсы или "N%" от макс. ХП цели)
      formula_temp_hp: new StringField({ initial: "" })
    };
  }

  static migrateData(source) {
    migrateCraftingData(source);
    return super.migrateData(source);
  }
}
