/**
 * Data Model for the player character in the Dedrel system.
 * Defines the structure of all base parameters (Attributes, Skills, Resources)
 * and holds the logic for computing derived attributes.
 */
import { getBonusesSchema } from "./bonuses-schema.mjs";
import { buildAttributes, buildSkills, buildDefenses, buildDR, buildEquipmentSlots, buildDoctrines, buildMagic } from "./shared-schema.mjs";
import { DedrelCurrency } from "../../utils/currency.mjs";

export default class CharacterDataModel extends foundry.abstract.TypeDataModel {
  /**
   * Defines the Data Schema for the "character" entity.
   * Returns an object with the fields that will be stored in the Foundry database.
   */
  static defineSchema() {
    const fields = foundry.data.fields;

    const bloodlineField = () => new fields.SchemaField({
      rank: new fields.NumberField({ required: true, integer: true, initial: 1, min: 0 })
    });

    return {
      bloodlines: new fields.SchemaField({
        human: bloodlineField(),
        demon: bloodlineField(),
        dragon: bloodlineField(),
        fay: bloodlineField(),
        elf: bloodlineField()
      }),
      attributes: buildAttributes(),

      skills: buildSkills(),

      // Spell Constructor doctrines (18 canonical keys) and known
      // techniques — shared source in shared-schema.mjs (the NPC boss has the same set).
      doctrines: buildDoctrines(),

      magic: buildMagic(),

      resources: new fields.SchemaField({
        hp: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 10, min: 0 }),
          temp: new fields.NumberField({ required: true, initial: 0, min: 0 }),
          max: new fields.NumberField({ required: false, initial: 10 }) // Derived
        }),
        wounds: new fields.SchemaField({
          level: new fields.NumberField({ required: false, integer: true, initial: 1 }), // Derived
          penalty: new fields.NumberField({ required: false, integer: true, initial: 0 }) // Derived
        }),
        ap_universal: new fields.SchemaField({
          max: new fields.NumberField({ required: false, integer: true, initial: 0 }), // Derived
          value: new fields.NumberField({ required: true, integer: true, initial: 0 })
        }),
        ap_maneuver: new fields.SchemaField({
          max: new fields.NumberField({ required: false, integer: true, initial: 0 }), // Derived
          value: new fields.NumberField({ required: true, integer: true, initial: 0 })
        }),
        ap_magic: new fields.SchemaField({
          max: new fields.NumberField({ required: false, integer: true, initial: 0 }), // Derived
          value: new fields.NumberField({ required: true, integer: true, initial: 0 })
        }),
        luck_points: new fields.SchemaField({
          max: new fields.NumberField({ required: false, integer: true, initial: 0 }), // Derived
          value: new fields.NumberField({ required: true, integer: true, initial: 0 })
        }),
        movement: new fields.SchemaField({
          // Speed is measured in METERS (see _rules/5). Not integer: on gridless
          // maps and with fractional spending the value can be non-integer (e.g. 6.5 m).
          max: new fields.NumberField({ required: false, initial: 0 }), // Derived
          value: new fields.NumberField({ required: true, initial: 0 })
        })
      }),

      senses: new fields.SchemaField({
        darkvision: new fields.NumberField({ required: false, integer: true, initial: 0, min: 0 })
      }),

      defenses: buildDefenses(),

      dr: buildDR(),

      equipment_slots: buildEquipmentSlots(),

      bonuses: getBonusesSchema(),

      // Wallet: coin counters keyed by the currency keys from the "currencies" world setting.
      // Free-form keys (ObjectField), since the currency list is dynamic.
      // Derived wallet.total_base and wallet.weight are computed in prepareDerivedData.
      currency: new fields.ObjectField({ required: false, initial: {} }),

      // Whether the actor can receive money transfers. Filters the recipient
      // list in transfer dialogs so that a large scene doesn't surface
      // every chest/loot pile. Characters accept by default.
      can_receive_currency: new fields.BooleanField({ required: true, initial: true }),

      initiative: new fields.NumberField({ required: false, integer: true, initial: 0 }), // Derived

      details: new fields.SchemaField({
        xp: new fields.NumberField({ required: true, integer: true, initial: 0 }),
        level: new fields.NumberField({ required: true, integer: true, initial: 1 }),
        biography: new fields.HTMLField({ required: false, blank: true, initial: "" })
      })
    };
  }

  /**
   * DataModel lifecycle method (Foundry VTT).
   * Called every time the document is initialized (on load or data update).
   * Here we compute all secondary (derived) attributes,
   * such as Maximum HP, Block, Dodge, Initiative, from the base attributes.
   */
  /**
   * Reset the derived accumulator values (the ones computed below via `+=`)
   * at the START of every preparation cycle. Otherwise a repeated prepareData() call without
   * a preceding reset() (e.g. core/a module on the updateWorldTime hook —
   * see active-effects-hud `_onTimeChange`) accumulates on top of values already
   * computed and doubles the maximums. Symptom: a short rest advances world
   * time -> the effects HUD calls actor.prepareData() -> max AP becomes 2×,
   * and performRest saves value = (doubled) max -> the sheet shows "2 / 1".
   * prepareBaseData runs BEFORE Active Effects are applied, so the effects'
   * contribution isn't lost (effects are added after the reset, then += mixes in the attributes).
   */
  prepareBaseData() {
    super.prepareBaseData();
    // Fallbacks match the initial values of the corresponding schema fields (hp.max = 10).
    const getSrc = (path, dflt = 0) => foundry.utils.getProperty(this._source, path) ?? dflt;
    const res = this.resources;
    res.hp.max = getSrc("resources.hp.max", 10);
    res.luck_points.max = getSrc("resources.luck_points.max");
    res.ap_universal.max = getSrc("resources.ap_universal.max");
    res.ap_maneuver.max = getSrc("resources.ap_maneuver.max");
    res.ap_magic.max = getSrc("resources.ap_magic.max");
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

    // HP Max
    res.hp.max += Math.ceil((attrs.con.rank + attrs.will.rank / 2) * 10);
    
    // HP Multiplier (applied after attributes)
    const hpMult = this.bonuses?.hp_multiplier || 0;
    if (hpMult !== 0) {
      res.hp.max = Math.max(1, Math.floor(res.hp.max * (1 + hpMult)));
    }

    // Wounds
    const hpPercent = (res.hp.value / res.hp.max) * 100;
    if (hpPercent > 75) {
      res.wounds.level = 1;
      res.wounds.penalty = 0;
    } else if (hpPercent > 50) {
      res.wounds.level = 2;
      res.wounds.penalty = -1;
    } else if (hpPercent > 25) {
      res.wounds.level = 3;
      res.wounds.penalty = -3;
    } else {
      res.wounds.level = 4;
      res.wounds.penalty = -5;
    }

    // Rage and similar effects (system.bonuses.ignore_wound_penalty > 0):
    // the wound penalty is zeroed, but the wound level is kept —
    // the wound track on the sheet and the healing logic keep working.
    if ((this.bonuses?.ignore_wound_penalty || 0) > 0) {
      res.wounds.penalty = 0;
    }

    // Wallet: total value (in base units) and coin weight.
    // The currency list comes from the world setting; if the setting is unavailable
    // (early initialization) the wallet counts as zero and is recomputed later.
    this.wallet = { total_base: 0, weight: 0 };
    try {
      const defs = DedrelCurrency.defs();
      const counts = this.currency || {};
      for (const def of defs) {
        const n = Number(counts[def.key]) || 0;
        this.wallet.total_base += n * (Number(def.base_value) || 0);
        this.wallet.weight += n * (Number(def.weight) || 0);
      }
    } catch (e) {
      // The currency setting isn't ready yet — keep the wallet at zero
    }

    // Luck Points Max
    res.luck_points.max += attrs.luck.rank;

    // AP Universal
    const maxConWill = Math.max(attrs.con.rank, attrs.will.rank);
    const minConWill = Math.min(attrs.con.rank, attrs.will.rank);
    const baseUniv = maxConWill > 1 ? 1 : 0;
    res.ap_universal.max += baseUniv + Math.ceil((maxConWill + minConWill / 2) / 2);

    // AP Maneuver
    const maxManeuver = Math.max(attrs.str.rank, attrs.dex.rank, attrs.rea.rank);
    const baseManeuver = maxManeuver > 1 ? 1 : 0;
    res.ap_maneuver.max += baseManeuver + Math.ceil(maxManeuver / 2);

    // AP Magic
    const maxMagic = Math.max(attrs.log.rank, attrs.int.rank);
    const baseMagic = maxMagic > 1 ? 1 : 0;
    res.ap_magic.max += baseMagic + Math.ceil(maxMagic / 2);

    // Defenses
    def.block += Math.floor(attrs.str.rank + attrs.rea.rank / 2) + 8;
    def.dodge += Math.floor(attrs.dex.rank + attrs.rea.rank / 2) + 8;
    def.mdef += Math.floor(Math.max(attrs.int.rank, attrs.log.rank) + attrs.will.rank / 2) + 8;

    // Initiative
    this.initiative += Math.max(attrs.int.rank, attrs.rea.rank);

    // Movement — budget in METERS per round: (2 + Dexterity) × 2 (see _rules/5).
    // The ×2 multiplier = "meters per square" (1 Foundry grid square = 2 m).
    res.movement.max += (2 + attrs.dex.rank) * 2;

    // DR and Armor calculation
    // this.dr is now part of the schema, so Active Effects can modify it.
    // We just need to add armor DR to it.

    if (this.parent && this.parent.items) {
      const equippedArmors = [];
      const slots = this.equipment_slots;
      for (const slotKey of ['armor_upper', 'armor_middle', 'armor_lower']) {
        if (slots[slotKey] && slots[slotKey].item_id) {
          const item = this.parent.items.get(slots[slotKey].item_id);
          if (item && item.type === "armor") equippedArmors.push(item);
        }
      }

      let maxArmorWeight = 0; // 0 = light, 1 = medium, 2 = heavy (see the gate below)

      for (const armor of equippedArmors) {
        for (const [key, value] of Object.entries(armor.system.dr || {})) {
          if (this.dr[key] !== undefined) {
            this.dr[key] += (value || 0);
          }
        }
        // modifiers.* — a manual "slot" for material/magical additions on top of
        // the pattern. The property mechanics don't need to be duplicated here: they are derived below.
        if (armor.system.modifiers) {
          def.dodge += (armor.system.modifiers.dodge || 0);
          def.block += (armor.system.modifiers.block || 0);
          res.movement.max += (armor.system.modifiers.movement || 0);
          if (this.skills?.stealth) this.skills.stealth.bonus += (armor.system.modifiers.stealth || 0);
        }

        // Pattern properties (12. Armor §Properties). Penalties belong to the item,
        // so they are taken from every worn layer and add up — the rules
        // explicitly allow this for Rigid ("stacks with the penalties from the type").
        // props.encumbering is DELIBERATELY not handled here: the actor has no channel
        // for a penalty to ranged/magical attacks yet.
        const props = armor.system.properties || {};
        if (props.rigid) def.dodge -= 1;
        if (props.loud && this.skills?.stealth) this.skills.stealth.bonus -= 2;
        def.block += (props.deflecting || 0);

        const weightClass = armor.system.weight_class;
        if (weightClass === "heavy") maxArmorWeight = Math.max(maxArmorWeight, 2);
        else if (weightClass === "medium") maxArmorWeight = Math.max(maxArmorWeight, 1);
      }

      // Armor TYPE bonuses/penalties: determined by the heaviest worn layer and
      // taken from it alone — not summed across layers (12. Armor §Armor types).
      // Without armor there is no type at all, so a naked character doesn't get the light bonus.
      if (equippedArmors.length) {
        if (maxArmorWeight === 0) { def.dodge += 1; def.block -= 1; }   // light
        else if (maxArmorWeight === 2) { def.dodge -= 1; def.block += 1; } // heavy
        // medium (1) — no bonuses or penalties
      }

      // A shield and an Auxiliary weapon in the free hand grant Block while held.
      const offHandId = slots.off_hand?.item_id;
      const offHand = offHandId ? this.parent.items.get(offHandId) : null;
      if (offHand && offHand.type === "weapon") {
        def.block += (offHand.system.deflecting || 0);
        if (offHand.system.is_auxiliary) def.block += 1;
      }

      // ==========================================
      // Penalties from the Armor Use skill
      // ==========================================
      // Skills are stored as a single flat list (flat schema), so we access them directly.
      const armorUseRank = this.skills?.armor_use?.rank || 0;
      let hasArmorPenalty = false;

      // Heavy armor requires rank 4+ in the "Armor Use" skill
      if (maxArmorWeight === 2 && armorUseRank < 4) hasArmorPenalty = true;
      // Medium armor requires rank 2+ in the "Armor Use" skill
      if (maxArmorWeight === 1 && armorUseRank < 2) hasArmorPenalty = true;

      this.armor_penalty = hasArmorPenalty;
      if (hasArmorPenalty) {
        // Rank mismatch penalty (12. Armor §Skill): −2 to ALL skill
        // checks, −2 to Initiative, −4 m to Speed. global_skill hits only
        // non-save rolls (src/dice/roll.mjs) — which is exactly "skill checks".
        this.bonuses.global_skill -= 2;
        this.initiative -= 2;
        // −4 meters to Speed (value in meters, as in the rules).
        res.movement.max = Math.max(0, res.movement.max - 4);
      }
    }

    // ==========================================
    // Encumbrance
    // ==========================================
    // Total weight: physical items (× quantity) + weight of the wallet's coins.
    // Thresholds = 10 + (STR+CON)·5/10/15 kg, modified by talents
    // (carry_capacity_mult / carry_capacity_flat). The category and penalties
    // (−1/−3 to all rolls, −2 m / full stop of speed) apply
    // unless the ignore_encumbrance_penalty immunity is set.
    // Stored ad hoc in this.resources.encumbrance (like this.wallet) — derived,
    // not written to _source, no migration needed.
    const NON_PHYSICAL = new Set([
      "maneuver", "talent", "mutation", "condition", "spell", "exp", "countryoforigin", "mutilation", "creature_type"
    ]);
    let carriedWeight = this.wallet?.weight || 0;
    if (this.parent && this.parent.items) {
      for (const item of this.parent.items) {
        if (NON_PHYSICAL.has(item.type)) continue;
        const w = Number(item.system?.weight) || 0;
        if (w <= 0) continue;
        // The weight of coin items (currency) is already computed for the whole stack (value·weight_per_unit),
        // so their quantity isn't multiplied in. Types without a quantity field (armor,
        // trade goods) count as quantity 1 — the ?? goes inside Number(),
        // otherwise Number(undefined) gives NaN and breaks the whole weight calculation.
        const qty = item.type === "currency" ? 1 : Number(item.system?.quantity ?? 1);
        carriedWeight += w * qty;
      }
    }

    const capBase = attrs.str.rank + attrs.con.rank;
    const capMult = 1 + (this.bonuses?.carry_capacity_mult || 0);
    const capFlat = this.bonuses?.carry_capacity_flat || 0;
    // A base shared by everyone: the minimum of any attribute is 1, and without it a character
    // with STR 1 / CON 1 couldn't carry their own clothes (_rules/15. Inventory §1).
    // The talent multiplier raises it too: it scales the carry capacity
    // as a whole, not just the attributes' contribution.
    const CARRY_BASE = 10;
    const thresholds = {
      light: (CARRY_BASE + capBase * 5) * capMult + capFlat,
      medium: (CARRY_BASE + capBase * 10) * capMult + capFlat,
      heavy: (CARRY_BASE + capBase * 15) * capMult + capFlat
    };

    let category = "light";
    let rollPenalty = 0;
    let stopMovement = false;
    let movePenalty = 0;
    if (carriedWeight > thresholds.heavy) {
      category = "overloaded"; rollPenalty = 3; stopMovement = true;
    } else if (carriedWeight > thresholds.medium) {
      category = "heavy"; rollPenalty = 3; movePenalty = 2; // −2 m (see _rules/15)
    } else if (carriedWeight > thresholds.light) {
      category = "medium"; rollPenalty = 1;
    }

    const immune = (this.bonuses?.ignore_encumbrance_penalty || 0) > 0;
    if (!immune) {
      this.bonuses.global_roll -= rollPenalty;
      if (stopMovement) res.movement.max = 0;
      else res.movement.max = Math.max(0, res.movement.max - movePenalty);
    }

    this.resources.encumbrance = {
      total: Math.round(carriedWeight * 100) / 100,
      category,
      thresholds,
      immune,
      rollPenalty: immune ? 0 : rollPenalty,
      movePenalty: immune ? 0 : movePenalty
    };
  }
}
