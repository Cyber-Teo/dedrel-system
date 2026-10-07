import { physicalItemFields } from "./_physical.mjs";
import { craftingFields, migrateCraftingData } from "./_crafting.mjs";

/**
 * Potion — a consumable item with an instant effect (healing/buff/debuff).
 * Mechanical effects are implemented via Active Effects on the item itself
 * (templates applied in Item#use), so there is no separate changes field.
 *
 * Charges/consumption deliberately use the same flat fields as the rest of the
 * system (uses_value/uses_max/uses_per, consumable, quantity), so that the
 * Item#use() flow works without a special branch for potions.
 */
export default class PotionDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { HTMLField, StringField, NumberField, BooleanField, SchemaField } = foundry.data.fields;
    return {
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      key: new StringField({ required: false, initial: "" }),
      ...physicalItemFields({ weight: 0.1 }),
      ...craftingFields(),
      quantity: new NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      stackable: new BooleanField({ required: true, initial: true }),
      // Short effect description for the player (in addition to description)
      effect_description: new StringField({ required: false, initial: "" }),
      // Consumed on use (quantity is decremented in Item#use)
      consumable: new BooleanField({ required: true, initial: true }),
      // Charges (for multi-dose vials); empty/0 = no charges
      uses_value: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      uses_max: new StringField({ required: false, initial: "" }),
      uses_per: new StringField({ required: false, initial: "" }),
      formula_heal: new StringField({ required: false, initial: "", label: "Healing Formula" }),
      // Grants temporary HP on use (a number, dice or "N%" of the target's max HP)
      formula_temp_hp: new StringField({ required: false, initial: "" }),
      on_use_macro: new StringField({ required: false, initial: "" }),
      requirements: new SchemaField({
        text: new StringField({ required: false, initial: "" }),
        attribute: new SchemaField({
          key: new StringField({ required: false, initial: "" }),
          rank: new NumberField({ required: true, integer: true, initial: 0, min: 0 })
        })
      })
    };
  }

  static migrateData(source) {
    migrateCraftingData(source);
    return super.migrateData(source);
  }
}
