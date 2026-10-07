import { ACCESSORY_SLOT_TYPES } from "../../constants.mjs";
import { craftingFields, migrateCraftingData } from "./_crafting.mjs";

export default class LootData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { HTMLField, StringField, NumberField, BooleanField } = foundry.data.fields;
    return {
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      key: new StringField({ required: false, initial: "" }),
      rarity: new StringField({ required: true, initial: "common" }),
      // Accessory slot (belt→torso, necklace→neck, etc. for "trinkets")
      equip_slot: new StringField({ required: false, blank: true, initial: "", choices: ACCESSORY_SLOT_TYPES }),
      weight: new NumberField({ required: true, initial: 0, min: 0 }),
      base_price: new NumberField({ required: true, initial: 0, min: 0 }),
      ...craftingFields(),
      stackable: new BooleanField({ required: true, initial: true }),
      quantity: new NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      formula_heal: new StringField({ initial: "", label: "Healing Formula" }),
      // Grants temporary HP on use (a number, dice or "N%" of the target's max HP)
      formula_temp_hp: new StringField({ initial: "" })
    };
  }

  static migrateData(source) {
    migrateCraftingData(source);
    return super.migrateData(source);
  }
}
