import { physicalItemFields } from "./_physical.mjs";
import { craftingFields, migrateCraftingData } from "./_crafting.mjs";

export default class WeaponDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      description: new fields.HTMLField({ label: "Description" }),
      key: new fields.StringField({ initial: "" }),
      // Shared physical fields (rarity/weight/price) for the economy and encumbrance
      ...physicalItemFields(),
      // Embedded "blueprint" (ingredients/markup) — see _crafting.mjs
      ...craftingFields(),

      // Basic Stats
      weapon_type: new fields.SchemaField({
        melee: new fields.BooleanField(),
        ranged: new fields.BooleanField(),
        shield: new fields.BooleanField(),
        magic: new fields.BooleanField()
      }),
      damage_type: new fields.SchemaField({
        piercing: new fields.BooleanField(),
        bludgeoning: new fields.BooleanField(),
        slashing: new fields.BooleanField()
      }),
      skill: new fields.StringField({ initial: "" }),
      // Base damage formula — fallback if a type has no formula of its own (damage_formulas)
      damage_formula: new fields.StringField({ initial: "" }),
      // Damage formulas BY TYPE: a maneuver with req_weapon_damage_type takes the formula
      // of its type; an empty string = use damage_formula. This way a glaive can
      // deal slashing 1d8 and piercing 1d4 — the mode is chosen by choosing the maneuver.
      damage_formulas: new fields.SchemaField({
        slashing: new fields.StringField({ initial: "" }),
        piercing: new fields.StringField({ initial: "" }),
        bludgeoning: new fields.StringField({ initial: "" })
      }),
      formula_heal: new fields.StringField({ initial: "", label: "Healing Formula" }),
      // Grants temporary HP on use (a number, dice or "N%" of the target's max HP)
      formula_temp_hp: new fields.StringField({ initial: "" }),
      equipped: new fields.BooleanField({ initial: false }),
      range: new fields.StringField({ initial: "" }),

      properties: new fields.SchemaField({
        natural: new fields.BooleanField({ initial: false }),
        armor_piercing: new fields.BooleanField({ initial: false }),
        misfire_chance: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        consumed_on_use: new fields.BooleanField({ initial: false }),
        can_be_sold: new fields.BooleanField({ initial: false }),
        can_be_dropped: new fields.BooleanField({ initial: false })
      }),
      // Consumption and quantity
      quantity: new fields.NumberField({ initial: 1, integer: true, min: 0 }),
      consume_target: new fields.StringField({ initial: "" }), // ID of the ammunition item
      consume_amount: new fields.NumberField({ initial: 1, integer: true, min: 0 }),
      // Charges and macros (added to support magical properties, features and effects)
      uses_value: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      uses_max: new fields.StringField({ initial: "" }),
      uses_per: new fields.StringField({ initial: "" }),
      on_use_macro: new fields.StringField({ initial: "" }),
      
      prerequisites_attributes: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      prerequisites_skills: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      
      control_zone: new fields.NumberField({ initial: 0, integer: true, min: 0, max: 3 }),
      // Armor Piercing 0-10: each point cancels 10% of the target's DR (10 = ignores DR completely)
      armor_piercing: new fields.NumberField({ initial: 0, integer: true, min: 0, max: 10 }),
      // Cleaving N — negates N Cohesion of the target's armor, i.e.
      // gives Armor Piercing its job back (craft/Armor Rework Plan.md §5).
      // DECORATIVE FOR NOW: not part of the damage calculation, not recorded in the rules.
      cleaving: new fields.NumberField({ initial: 0, integer: true, min: 0, max: 10 }),
      // Deflecting N — +N to Block while the weapon is in hand. The shield's currency
      // (_rules/12. Armor.md §Basic shields: medium 1, tower 2).
      deflecting: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      // Quality/rarity is NOT duplicated: the weapon already has rarity (physicalItemFields,
      // common→legendary) — firearm misfire severity is read from it (src/dice/roll.mjs).

      // Bonuses vs creature types. Map { <type key>: potency(0-10) }.
      // If the target carries the type (Item creature_type), damage is multiplied by
      // (1 + potency·0.1) BEFORE the target's DR is subtracted. Keys come from CONFIG.DEDREL.creatureTypes
      // (extensible via config). Free-form object → new types need no migration.
      vs_creature: new fields.ObjectField({ initial: {} }),

      // "Type breaker": map { <type key>: true } — the weapon is attuned against
      // these types (enchantment/special material). Against a target of such a type the system
      // SUBTRACTS from its DR exactly that type's contribution (the sum of its effects), leaving
      // the armor/natural base DR (see applyDamage, _rules/18. Enemies.md §Type breaker).
      // Currently set by hand on the sheet; when crafting is introduced it will move to
      // enchantments/materials (silver→shade, adamantine→construct). See NOTES.md.
      bypass_creature: new fields.ObjectField({ initial: {} }),

      // Properties — flat property flags; maneuvers are gated by them (req_weapon_property)
      is_auxiliary: new fields.BooleanField({ initial: false }),
      is_fast: new fields.BooleanField({ initial: false }),
      is_slow: new fields.BooleanField({ initial: false }),
      is_twohanded: new fields.BooleanField({ initial: false }),
      is_thrown: new fields.BooleanField({ initial: false }),
      is_reloading: new fields.BooleanField({ initial: false }),
      // Reload cost in AP (1-3): one Reload maneuver costs that many AP,
      // heavy firearms cost more (musket 2, arquebus 3). The weapon dictates the cost,
      // not the maneuver — the player can't reload cheaply (see item.mjs use()).
      reload_cost: new fields.NumberField({ initial: 1, integer: true, min: 1, max: 3 }),
      // Whether a reloadable weapon is loaded. A shot (ammunition consumption) unloads it,
      // the Reload maneuver loads it. An unloaded weapon can't fire.
      loaded: new fields.BooleanField({ initial: true }),
      // Point-blank: the shot doesn't provoke an attack of opportunity (flag without automation)
      is_point_blank: new fields.BooleanField({ initial: false }),
      // Scatter: the shot hits an area (cone) instead of a single target — one
      // attack/damage roll against everyone covered. The weapon fires with THE SAME shot
      // maneuver as a regular firearm; with is_scatter the chat card adds
      // a cone button (length = the weapon's range, see item.mjs postToChat). No separate
      // maneuver/talent is needed — Attack/Damage are the same, applied to several tokens.
      is_scatter: new fields.BooleanField({ initial: false }),
      // Variable grip: can be held in one or two hands; with a two-handed
      // grip the damage rises one Ladder step (a button on the chat card)
      is_variable_grip: new fields.BooleanField({ initial: false }),
      // Paired: a single "pair" entity (katars, claws) occupies BOTH hand slots when
      // equipped, like a two-handed weapon, but doesn't count as a two-handed GRIP
      is_paired: new fields.BooleanField({ initial: false })
    };
  }

  static migrateData(source) {
    migrateCraftingData(source);
    return super.migrateData(source);
  }
}
