import { physicalItemFields } from "./_physical.mjs";
import { craftingFields, migrateCraftingData } from "./_crafting.mjs";
import { MATERIAL_CLASS_ENUM, SLOT_TIER_ENUM } from "../../constants.mjs";

/**
 * Crafting material — raw material for crafting/repair. Measured in "measures"
 * (quantity). Eight classes (material_class) — from the crafting rules
 * (craft/New Craft.md): seven raw ones plus "processed". The crafting
 * block is attached too: processed materials (ingots from ore, leather from hides,
 * ink, paper, vials) are themselves crafting products.
 *
 * Material grammar after the 2026-07-15 rework (craft/Armor Rework Plan.md §2) —
 * four fixed axes, the same for all materials:
 *   rarity        — quality (tier), from physicalItemFields;
 *   slots         — magical capacity: list of upgrade slot tiers;
 *   weight_class  — weight/handling;
 *   signature     — ONE qualitative feature, separately for armor/weapons/magic.
 *
 * A material gives no flat "+N to everything": the old grants[].bonus was removed, power
 * lives in patterns and slots. Source of truth for the values — tables/materials.csv.
 */
export default class CraftMaterialDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { HTMLField, StringField, NumberField, BooleanField, SchemaField, ArrayField } = foundry.data.fields;
    return {
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      key: new StringField({ required: false, initial: "" }),
      ...physicalItemFields(),
      ...craftingFields(),
      quantity: new NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      stackable: new BooleanField({ required: true, initial: true }),
      // LEGACY: free-form tag (ore, herb...). Kept for old data and
      // fine-grained classification; the canonical class is material_class below.
      material_type: new StringField({ required: true, initial: "ore" }),
      // Canonical material class (8 types from the crafting rules; processed —
      // processed materials, crafting products: they have no signatures, slots or applicability)
      material_class: new StringField({ required: true, initial: "metal", choices: MATERIAL_CLASS_ENUM }),
      // Special properties text (weight −50%, damage to undead, etc.)
      special_rules: new StringField({ required: false, blank: true, initial: "" }),
      // Weight/handling — axis §2. Free text for now (normal/heavy/light): the mechanics
      // of shifting the weight class aren't settled, too early to bind to an enum.
      weight_class: new StringField({ required: false, blank: true, initial: "normal" }),
      // Magical capacity: one entry per slot, the value is the tier (ladder §6
      // white/green/blue/violet). Empty array = "holds no magic".
      slots: new ArrayField(new StringField({ choices: SLOT_TIER_ENUM })),
      // Signature — one per area of application, free text.
      signature: new SchemaField({
        armor: new StringField({ required: false, blank: true, initial: "" }),
        weapon: new StringField({ required: false, blank: true, initial: "" }),
        magic: new StringField({ required: false, blank: true, initial: "" })
      }),
      // Which products the material applies to as the PRIMARY one (for weapon/armor patterns)
      applicable_to: new SchemaField({
        weapon: new BooleanField({ required: true, initial: false }),
        armor: new BooleanField({ required: true, initial: false }),
        shield: new BooleanField({ required: true, initial: false }),
        jewelry: new BooleanField({ required: true, initial: false })
      })
    };
  }

  static migrateData(source) {
    // Legacy material_type tags → canonical material_class.
    if (!source.material_class && source.material_type) {
      const map = {
        ore: "metal", herb: "herb", wood: "wood", skin: "leather", cloth: "cloth",
        processed: "processed", crafted: "processed"
      };
      if (map[source.material_type]) source.material_class = map[source.material_type];
    }
    // Legacy grants (options "+1 AND slot OR slot") → flat magical capacity.
    // The bonus is dropped on purpose: the new grammar has no flat +N. Of the
    // options we take the first non-empty one — the choice is arbitrary, since the values
    // get overwritten anyway by the material rework macro from materials.csv.
    if (!source.slots && Array.isArray(source.grants)) {
      const withSlots = source.grants.find(g => g?.slots?.length);
      source.slots = withSlots ? [...withSlots.slots] : [];
    }
    migrateCraftingData(source);
    return super.migrateData(source);
  }
}
