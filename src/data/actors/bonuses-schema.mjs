/**
 * Dedicated schema for the character's permanent system bonuses.
 * Returns a SchemaField object that is then embedded in the main DataModel.
 *
 * ONLY unconditional permanent bonuses live here — the ones that apply
 * to any roll (including rolls without an item: skill checks, saving throws).
 *
 * One-shot and conditional "next maneuver" bonuses (formerly next_*)
 * are implemented as DSL modifiers on the Active Effect key
 * "flags.dedrel.mod" — see docs/effect-keys.md and
 * src/utils/dedrel-bonuses.mjs.
 */
export function getBonusesSchema() {
  const fields = foundry.data.fields;

  return new fields.SchemaField({
    // Global bonuses.
    // PENALTIES are negative values of these same fields (the roll formula
    // can subtract: see src/dice/roll.mjs). There is no separate "penalty" entity.
    global_roll: new fields.NumberField({ initial: 0, integer: true }),
    global_skill: new fields.NumberField({ initial: 0, integer: true }),
    global_save: new fields.NumberField({ initial: 0, integer: true }),
    global_ap_discount: new fields.NumberField({ initial: 0, integer: true }),

    // AP surcharge ("AP penalty"): maneuvers/spells cost N MORE.
    // A positive value raises the cost; it adds up with DSL discounts
    // (discount and surcharge offset each other). global_ap_penalty — maneuvers AND
    // spells; maneuver_ap_penalty — maneuvers only; spell_ap_penalty — spells
    // only. Applied in DedrelBonuses.effectiveApCost.
    global_ap_penalty: new fields.NumberField({ initial: 0, integer: true }),
    maneuver_ap_penalty: new fields.NumberField({ initial: 0, integer: true }),
    spell_ap_penalty: new fields.NumberField({ initial: 0, integer: true }),

    // Toggle flags: effects add 1 (Add mode), any value > 0 = on.
    // A number field rather than a boolean so that several simultaneous sources
    // (maneuver + talent) add up and don't overwrite each other when one is removed.
    ignore_wound_penalty: new fields.NumberField({ initial: 0, integer: true }),
    infinite_explode: new fields.NumberField({ initial: 0, integer: true }),
    damage_explode: new fields.NumberField({ initial: 0, integer: true }),

    // Maximum HP multiplier. A value of 0.25 raises HP by 25%.
    hp_multiplier: new fields.NumberField({ initial: 0 }),

    // === Carry capacity and encumbrance (talents/effects) ===
    // carry_capacity_mult — multiplier on the carry thresholds (0.5 = +50% to all thresholds).
    // carry_capacity_flat — flat bonus to the thresholds in kg (adds up with everything).
    // ignore_encumbrance_penalty — toggle flag (>0 = immune to encumbrance
    //   penalties: rolls and speed aren't reduced, but category/weight are still computed).
    carry_capacity_mult: new fields.NumberField({ initial: 0 }),
    carry_capacity_flat: new fields.NumberField({ initial: 0 }),
    ignore_encumbrance_penalty: new fields.NumberField({ initial: 0, integer: true })
  });
}
