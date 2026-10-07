import { physicalItemFields } from "./_physical.mjs";
import { craftingFields, migrateCraftingData } from "./_crafting.mjs";
import { ACCESSORY_SLOT_TYPES } from "../../constants.mjs";

/**
 * Magic item — a permanent/rechargeable item (wands, amulets, wondrous items).
 * Unlike potions/scrolls it is NOT destroyed when empty: charges (uses_*)
 * deplete and recover on rest (per uses_per, see character-sheet.performRest),
 * while the item itself remains. Destruction is only possible via consumable+quantity, which
 * is off by default (consumable: false).
 *
 * Payload on use (like a scroll/potion, resolved in Item#use):
 * - spell_id / spell_key — bound spell (a fireball wand): one cast per charge;
 * - formula_heal — instant healing;
 * - embedded Active Effects — buffs/debuffs (the "Apply Effects" button on the card);
 * - on_use_macro — an "escape hatch" for non-standard triggers.
 */
export default class MagicItemDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      description: new fields.HTMLField({ label: "Description" }),
      key: new fields.StringField({ initial: "" }),
      // Default rarity is uncommon: the first step where magic items are allowed
      // numbers on rolls (15. Inventory §Power ladder by rarity). The common tier
      // exists, but it's about verbs with a limit, and is chosen deliberately.
      ...physicalItemFields({ rarity: "uncommon" }),
      ...craftingFields(),
      // Accessory slot (diadem→head, ring/bracelet→hand, necklace→neck, ...)
      equip_slot: new fields.StringField({ required: false, blank: true, initial: "", choices: ACCESSORY_SLOT_TYPES }),
      stackable: new fields.BooleanField({ initial: false }),
      consumable: new fields.BooleanField({ initial: false, label: "Consumable" }),
      quantity: new fields.NumberField({ initial: 1, integer: true, label: "Quantity" }),
      // Short effect description for the player (in addition to description)
      effect_description: new fields.StringField({ required: false, initial: "" }),
      // Bound spell (caster wand): spell_id — an item on the actor/in the world/UUID;
      // spell_key — system.key for lookup in the dedrel.spells compendium. Resolved
      // by the same #resolveBoundSpell/#castBoundSpell as a scroll.
      spell_id: new fields.StringField({ required: false, initial: "" }),
      spell_key: new fields.StringField({ required: false, initial: "" }),
      formula_heal: new fields.StringField({ initial: "", label: "Healing Formula" }),
      // Grants temporary HP on use (a number, dice or "N%" of the target's max HP)
      formula_temp_hp: new fields.StringField({ initial: "" }),
      on_use_macro: new fields.StringField({ required: false, initial: "" }),
      // Rechargeable charges: uses_max>0 turns the mechanic on (item.prepareDerivedData),
      // spent in Item#use, auto-recovered on rest per uses_per.
      // uses_per: "" | "short_rest" | "long_rest" | "day" (see performRest).
      uses_value: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      uses_max: new fields.StringField({ required: false, initial: "" }),
      uses_per: new fields.StringField({ required: false, initial: "" }),
      requirements: new fields.SchemaField({
        text: new fields.StringField({ required: false, initial: "" }),
        attribute: new fields.SchemaField({
          key: new fields.StringField({ required: false, initial: "" }),
          rank: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
        })
      })
    };
  }

  static migrateData(source) {
    migrateCraftingData(source);
    return super.migrateData(source);
  }
}
