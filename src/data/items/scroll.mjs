import { physicalItemFields } from "./_physical.mjs";
import { craftingFields, migrateCraftingData } from "./_crafting.mjs";

/**
 * Scroll — a single-use spell carrier. Stores a reference to a spell item
 * (spell_id / spell_key) that is "cast off" the scroll; after use it is
 * usually destroyed (consumable + quantity 1).
 *
 * Like potions, it uses the flat charge/consumption fields for compatibility
 * with Item#use().
 */
export default class ScrollDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { HTMLField, StringField, NumberField, BooleanField, SchemaField } = foundry.data.fields;
    return {
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      key: new StringField({ required: false, initial: "" }),
      ...physicalItemFields({ weight: 0.01, rarity: "uncommon" }),
      ...craftingFields(),
      quantity: new NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      stackable: new BooleanField({ required: true, initial: true }),
      // The spell contained in the scroll: a reference to an Item of type spell.
      // spell_id — id of the embedded item; spell_key — system.key for lookup in the compendium.
      spell_id: new StringField({ required: false, initial: "" }),
      spell_key: new StringField({ required: false, initial: "" }),
      consumable: new BooleanField({ required: true, initial: true }),
      uses_value: new NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      uses_max: new StringField({ required: false, initial: "1" }),
      uses_per: new StringField({ required: false, initial: "" }),
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

  /**
   * Scroll read cost (16. Magic §10) — derived from rarity, not stored.
   * Paid with universal AP only: a scroll doesn't fall into the
   * special-pool branches of Item##resolveApPools. Legendary — plot uniques outside
   * the scribing ladder.
   */
  static READ_COST_BY_RARITY = { common: 2, uncommon: 3, rare: 4, very_rare: 5, legendary: 6 };

  prepareDerivedData() {
    super.prepareDerivedData();
    this.ap_cost = ScrollDataModel.READ_COST_BY_RARITY[this.rarity] ?? 2;
  }
}
