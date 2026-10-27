import { ITEM_RARITY_ENUM, ACCESSORY_SLOT_TYPES } from "../../constants.mjs";
import { craftingFields, migrateCraftingData } from "./_crafting.mjs";

export default class ArmorDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      description: new fields.HTMLField({ label: "Description" }),
      key: new fields.StringField({ initial: "" }),
      rarity: new fields.StringField({ initial: "common", choices: ITEM_RARITY_ENUM }),
      // Accessory slot: if set (e.g. "head" for a helmet), the armor is worn
      // in an accessory slot rather than the body layers (slot). Empty = regular body armor.
      equip_slot: new fields.StringField({ required: false, blank: true, initial: "", choices: ACCESSORY_SLOT_TYPES }),
      base_price: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      weight: new fields.NumberField({ initial: 0, min: 0 }),
      // Embedded "blueprint" (ingredients/markup) — see _crafting.mjs
      ...craftingFields(),
      slot: new fields.StringField({ initial: "middle", choices: ["lower", "middle", "upper", "universal"] }),
      weight_class: new fields.StringField({ initial: "light", choices: ["light", "medium", "heavy"] }),
      
      dr: new fields.SchemaField({
        slashing: new fields.NumberField({ initial: 0, integer: true }),
        piercing: new fields.NumberField({ initial: 0, integer: true }),
        bludgeoning: new fields.NumberField({ initial: 0, integer: true }),
        heat: new fields.NumberField({ initial: 0, integer: true }),
        cold: new fields.NumberField({ initial: 0, integer: true }),
        necrotic: new fields.NumberField({ initial: 0, integer: true }),
        radiant: new fields.NumberField({ initial: 0, integer: true }),
        electric: new fields.NumberField({ initial: 0, integer: true }),
        sonic: new fields.NumberField({ initial: 0, integer: true }),
        acid: new fields.NumberField({ initial: 0, integer: true })
      }),
      
      // A "slot" for additions ON TOP of the pattern (material, enchantment): the actor derives
      // the type and property mechanics itself, they don't need to be duplicated here.
      modifiers: new fields.SchemaField({
        dodge: new fields.NumberField({ initial: 0, integer: true }),
        block: new fields.NumberField({ initial: 0, integer: true }),
        stealth: new fields.NumberField({ initial: 0, integer: true }),
        // NOT APPLIED: the actor has no channel for penalties to ranged/magical
        // attacks yet.
        ranged_attack: new fields.NumberField({ initial: 0, integer: true }),
        magic_attack: new fields.NumberField({ initial: 0, integer: true }),
        movement: new fields.NumberField({ initial: 0, integer: true })
      }),

      // Pattern properties (_rules/12. Armor.md §Properties). The ACTOR DERIVES the mechanics —
      // no need to duplicate them in modifiers.*. Exceptions are marked below: the field there
      // is stored and shown on the sheet, but affects nothing.
      properties: new fields.SchemaField({
        exclusive_slot: new fields.BooleanField({ initial: false }),
        // Light only: the armor doesn't share the stack with anything heavier than
        // light — in both directions (a mantle can't go over chainmail, chainmail
        // can't go under a mantle already worn). The check happens on equip
        // (character-sheet.mjs); the property doesn't enter the defense calculation.
        light_layers_only: new fields.BooleanField({ initial: false }),
        rigid: new fields.BooleanField({ initial: false }),
        loud: new fields.BooleanField({ initial: false }),
        // Cumbersome: −2 to ranged (except firearms) and magical attacks.
        // DECORATIVE FOR NOW: nowhere to apply it — see modifiers.ranged_attack above.
        encumbering: new fields.BooleanField({ initial: false }),
        // LEGACY: absent from the rules, read by nothing.
        weak_point_protection: new fields.BooleanField({ initial: false }),
        // Deflecting N — the armor's geometry grants +N to Block.
        deflecting: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        // Cohesion N — cancels N incoming Armor Piercing from any
        // source, before AP is compared with DR; Cleaving N on a weapon negates it
        // (craft/Armor Rework Plan.md §5). DECORATIVE FOR NOW: not part of the damage
        // calculation, not recorded in the rules (12. Armor).
        cohesion: new fields.NumberField({ initial: 0, integer: true, min: 0 })
      }),

      // Charges and macros (added to support magical properties, features and effects)
      uses_value: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      uses_max: new fields.StringField({ initial: "" }),
      uses_per: new fields.StringField({ initial: "" }),
      formula_heal: new fields.StringField({ initial: "", label: "Healing Formula" }),
      // Grants temporary HP on use (a number, dice or "N%" of the target's max HP)
      formula_temp_hp: new fields.StringField({ initial: "" }),
      on_use_macro: new fields.StringField({ initial: "" }),

      prerequisites_text: new fields.StringField({ initial: "" }),
      prerequisites_attributes: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      prerequisites_skills: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      prerequisites_talents: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      prerequisites_mutations: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      prerequisites_bloodlines: new fields.ArrayField(new fields.StringField(), { initial: [] }),

      equipped: new fields.BooleanField({ initial: false })
    };
  }

  static migrateData(source) {
    migrateCraftingData(source);
    return super.migrateData(source);
  }
}
