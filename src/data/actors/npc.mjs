/**
 * Data model for the "NPC / Monster" actor (type npc). One type with a tier field:
 *   peon — rank-and-file mob; health in "hits" via the toughness threshold
 *          (toughness); a single universal AP pool; compact sheet.
 *   boss — solo threat; regular manual HP; full control over the combat kit;
 *          unique mechanics (resilience/phases/reactions) are content (talents/
 *          maneuvers), not schema.
 *
 * A hybrid, not "manual-first": reuses the character's combat structures and formulas
 * (attributes → saves/defenses, armor → DR), but provides a manual override
 * of the key derived values (max AP, speed, max HP) for precise balancing.
 * Abilities are carried as regular Items (maneuver/spell/mutation/talent) and
 * work on NPCs through the same mechanisms as on the character.
 *
 * AP: the single pool lives in resources.ap_universal (same key as the character's),
 * and the ap_maneuver / ap_magic pools are absent — so the payment logic in
 * item.mjs automatically pays both maneuvers and spells from the universal pool.
 */
import { getBonusesSchema } from "./bonuses-schema.mjs";
import { buildAttributes, buildSkills, buildDefenses, buildDR, buildEquipmentSlots, buildDoctrines, buildMagic } from "./shared-schema.mjs";

export default class NpcDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    // Manual override of a derived value: null → computed by formula; a number → overrides it.
    const overrideField = () => new fields.NumberField({ required: false, integer: true, nullable: true, initial: null });

    return {
      tier: new fields.StringField({ required: true, initial: "peon", choices: ["peon", "boss"] }),

      attributes: buildAttributes(),
      skills: buildSkills(),
      defenses: buildDefenses(),
      dr: buildDR(),
      equipment_slots: buildEquipmentSlots(),
      bonuses: getBonusesSchema(),

      // Magic: doctrines and techniques — same as the character's. They let the boss
      // cast spell items by the rules of the Spell Constructor
      // (doctrine rank check, known techniques). Ranks are set manually.
      doctrines: buildDoctrines(),
      magic: buildMagic(),

      resources: new fields.SchemaField({
        // Boss health (and a reserve in case of direct damage to HP).
        hp: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 10, min: 0 }),
          temp: new fields.NumberField({ required: true, initial: 0, min: 0 }),
          max: new fields.NumberField({ required: false, initial: 10 }) // Derived / override
        }),
        // Peon health in "hits". Serves both as the wound track (penalties) and
        // as a morale indicator (fleeing/frenzy — as text in the description).
        hits: new fields.SchemaField({
          value: new fields.NumberField({ required: true, integer: true, initial: 2, min: 0 }),
          max: new fields.NumberField({ required: true, integer: true, initial: 2, min: 1 })
        }),
        // Single universal AP pool (pays for maneuvers and spells).
        ap_universal: new fields.SchemaField({
          max: new fields.NumberField({ required: false, integer: true, initial: 0 }), // Derived / override
          value: new fields.NumberField({ required: true, integer: true, initial: 0 })
        }),
        movement: new fields.SchemaField({
          // Speed in METERS (see _rules/5). Not integer: fractional spending
          // and non-integer values on gridless maps are possible.
          max: new fields.NumberField({ required: false, initial: 0 }), // Derived / override
          value: new fields.NumberField({ required: true, initial: 0 })
        }),
        // Derived wound track (computed from hits for a peon, from hp for a boss).
        wounds: new fields.SchemaField({
          level: new fields.NumberField({ required: false, integer: true, initial: 1 }),
          penalty: new fields.NumberField({ required: false, integer: true, initial: 0 })
        })
      }),

      // Peon toughness threshold: a hit removes 1 hit point only if the damage
      // (after DR) ≥ toughness. Weak grazes are ignored.
      toughness: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),

      // Manual overrides of derived values (bypassing formulas). null = by formula.
      overrides: new fields.SchemaField({
        ap_max: overrideField(),
        movement_max: overrideField(),
        hp_max: overrideField()
      }),

      senses: new fields.SchemaField({
        darkvision: new fields.NumberField({ required: false, integer: true, initial: 0, min: 0 })
      }),

      initiative: new fields.NumberField({ required: false, integer: true, initial: 0 }), // Derived

      details: new fields.SchemaField({
        threat: new fields.StringField({ required: false, blank: true, initial: "" }),
        biography: new fields.HTMLField({ required: false, blank: true, initial: "" })
      })
    };
  }

  /**
   * Reset the derived accumulator values (computed below via `+=`)
   * at the start of every preparation cycle. Without this a repeated prepareData() without
   * reset() (e.g. core/a module on updateWorldTime — see active-effects-hud
   * `_onTimeChange`) accumulates on top of what was already computed and doubles the maximums:
   * a short rest advances world time -> the HUD calls actor.prepareData() ->
   * max AP becomes 2× -> the saved value = max shows "2 / 1" on the sheet.
   * Runs BEFORE Active Effects are applied, so their contribution isn't lost.
   * Fallbacks match the initial values of the corresponding schema fields (hp.max = 10).
   */
  prepareBaseData() {
    super.prepareBaseData();
    const getSrc = (path, dflt = 0) => foundry.utils.getProperty(this._source, path) ?? dflt;
    const res = this.resources;
    res.hp.max = getSrc("resources.hp.max", 10);
    res.ap_universal.max = getSrc("resources.ap_universal.max");
    res.movement.max = getSrc("resources.movement.max");
    const def = this.defenses;
    def.block = getSrc("defenses.block");
    def.dodge = getSrc("defenses.dodge");
    def.mdef = getSrc("defenses.mdef");
    this.initiative = getSrc("initiative");
    for (const key of Object.keys(this.dr)) this.dr[key] = getSrc(`dr.${key}`);
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    const attrs = this.attributes;
    const res = this.resources;
    const def = this.defenses;
    const ov = this.overrides || {};

    // === Defenses (same formula as the character's) ===
    def.block += Math.floor(attrs.str.rank + attrs.rea.rank / 2) + 8;
    def.dodge += Math.floor(attrs.dex.rank + attrs.rea.rank / 2) + 8;
    def.mdef += Math.floor(Math.max(attrs.int.rank, attrs.log.rank) + attrs.will.rank / 2) + 8;

    // === Single AP pool: base from the better of CON/WILL (like the character's universal pool) ===
    const maxConWill = Math.max(attrs.con.rank, attrs.will.rank);
    const minConWill = Math.min(attrs.con.rank, attrs.will.rank);
    const baseUniv = maxConWill > 1 ? 1 : 0;
    res.ap_universal.max += baseUniv + Math.ceil((maxConWill + minConWill / 2) / 2);

    // === Initiative and speed ===
    this.initiative += Math.max(attrs.int.rank, attrs.rea.rank);
    // Speed in METERS: (2 + Dexterity) × 2 (see _rules/5).
    res.movement.max += (2 + attrs.dex.rank) * 2;

    // === Boss HP (same formula as the character's) ===
    res.hp.max += Math.ceil((attrs.con.rank + attrs.will.rank / 2) * 10);
    const hpMult = this.bonuses?.hp_multiplier || 0;
    if (hpMult !== 0) res.hp.max = Math.max(1, Math.floor(res.hp.max * (1 + hpMult)));

    // === Armor: DR, defense/speed modifiers, Armor Use skill penalty ===
    if (this.parent && this.parent.items) {
      const slots = this.equipment_slots;
      const equippedArmors = [];
      for (const slotKey of ["armor_upper", "armor_middle", "armor_lower"]) {
        if (slots[slotKey]?.item_id) {
          const item = this.parent.items.get(slots[slotKey].item_id);
          if (item && item.type === "armor") equippedArmors.push(item);
        }
      }

      let maxArmorWeight = 0; // 0 light, 1 medium, 2 heavy (see the gate below)
      for (const armor of equippedArmors) {
        for (const [key, value] of Object.entries(armor.system.dr || {})) {
          if (this.dr[key] !== undefined) this.dr[key] += (value || 0);
        }
        // modifiers.* — a manual "slot" on top of the pattern; property mechanics are derived below.
        if (armor.system.modifiers) {
          def.dodge += (armor.system.modifiers.dodge || 0);
          def.block += (armor.system.modifiers.block || 0);
          res.movement.max += (armor.system.modifiers.movement || 0);
          if (this.skills?.stealth) this.skills.stealth.bonus += (armor.system.modifiers.stealth || 0);
        }
        // Pattern properties — see the detailed breakdown in character.mjs (including
        // why encumbering isn't handled here).
        const props = armor.system.properties || {};
        if (props.rigid) def.dodge -= 1;
        if (props.loud && this.skills?.stealth) this.skills.stealth.bonus -= 2;
        def.block += (props.deflecting || 0);

        const wc = armor.system.weight_class;
        if (wc === "heavy") maxArmorWeight = Math.max(maxArmorWeight, 2);
        else if (wc === "medium") maxArmorWeight = Math.max(maxArmorWeight, 1);
      }

      // The type is taken only from the heaviest layer; without armor there is no type.
      if (equippedArmors.length) {
        if (maxArmorWeight === 0) { def.dodge += 1; def.block -= 1; }
        else if (maxArmorWeight === 2) { def.dodge -= 1; def.block += 1; }
      }

      const offHandId = slots.off_hand?.item_id;
      const offHand = offHandId ? this.parent.items.get(offHandId) : null;
      if (offHand && offHand.type === "weapon") {
        def.block += (offHand.system.deflecting || 0);
        if (offHand.system.is_auxiliary) def.block += 1;
      }

      const armorUseRank = this.skills?.armor_use?.rank || 0;
      let hasArmorPenalty = false;
      if (maxArmorWeight === 2 && armorUseRank < 4) hasArmorPenalty = true;
      if (maxArmorWeight === 1 && armorUseRank < 2) hasArmorPenalty = true;
      this.armor_penalty = hasArmorPenalty;
      if (hasArmorPenalty) {
        this.bonuses.global_skill -= 2;
        this.initiative -= 2;
        res.movement.max = Math.max(0, res.movement.max - 4);
      }
    }

    // === Manual overrides (override the formulas) ===
    if (ov.ap_max !== null && ov.ap_max !== undefined) res.ap_universal.max = ov.ap_max;
    if (ov.movement_max !== null && ov.movement_max !== undefined) res.movement.max = ov.movement_max;
    if (ov.hp_max !== null && ov.hp_max !== undefined) res.hp.max = ov.hp_max;
    res.movement.max = Math.max(0, res.movement.max);

    // === Wound track / morale indicator ===
    // A peon counts from hits, a boss from hp. Thresholds are the same as the character's.
    let hpPercent;
    if (this.tier === "peon") {
      const hm = Math.max(1, res.hits.max);
      hpPercent = (res.hits.value / hm) * 100;
    } else {
      const hm = Math.max(1, res.hp.max);
      hpPercent = (res.hp.value / hm) * 100;
    }
    if (hpPercent > 75) { res.wounds.level = 1; res.wounds.penalty = 0; }
    else if (hpPercent > 50) { res.wounds.level = 2; res.wounds.penalty = -1; }
    else if (hpPercent > 25) { res.wounds.level = 3; res.wounds.penalty = -3; }
    else { res.wounds.level = 4; res.wounds.penalty = -5; }
    // A peon gets no wound penalties: at 1-3 hits the very first hit would drop
    // it to -3/-5 and take it out of the fight. The wound level remains as a morale indicator.
    if (this.tier === "peon") res.wounds.penalty = 0;
    if ((this.bonuses?.ignore_wound_penalty || 0) > 0) res.wounds.penalty = 0;
  }
}
