/**
 * ==========================================================================
 * Dedrel DSL modifiers (flags.dedrel.mod)
 * ==========================================================================
 *
 * A single mechanism for one-shot and conditional "next maneuver" bonuses.
 * The carrier is an Active Effect (usually from a technical Condition item)
 * holding one or more change rows with the key "flags.dedrel.mod".
 *
 * Value format: segments separated by ";", each segment is "name:value".
 * The first segment is the operation:
 *   ap_set:N       — set the AP cost = N (the minimum of several is taken)
 *   ap_discount:N  — AP discount (they add up, the cost doesn't go below 0)
 *   attack:N       — attack roll bonus (they add up)
 *   damage:X       — addition to the damage formula; a number or dice, e.g. "1d6"
 *   dice_step:N    — shift of the BASE damage formula along the dice ladder
 *                    1d4→1d6→2d4→2d6→2d8→3d6 (they add up; N can be
 *                    negative — a nerf; see src/utils/dice-ladder.mjs)
 *   pierce:N       — damage Armor Piercing (adds up with each other and with
 *                    the weapon's Armor Piercing; each point removes 10% of the target's DR)
 *
 * Optional parameters:
 *   filter:<expr>  — which maneuvers it applies to (see matchesFilter);
 *                    "any" by default
 *   consume:<when> — the moment the carrier effect burns:
 *                    use (on spending AP) | roll (after the attack roll) |
 *                    damage (after the damage roll) | never (doesn't burn).
 *                    Default by operation: ap_* → use, attack → roll, damage → damage.
 *
 * Examples:
 *   "ap_set:0; filter:ranged"                        — next shot is free
 *   "attack:2; filter:ranged; consume:roll"          — Take Aim
 *   "damage:1d6; filter:melee"                       — +1d6 to the next strike
 *   "attack:1; filter:skill:bows; consume:never"     — permanent +1 to bow attacks
 *   "dice_step:1; filter:dtype:bludgeoning"          — next bludgeoning strike one step higher
 *   "dice_step:-1; filter:melee; consume:never"      — permanent nerf: damage one step lower
 *   "ap_discount:1; filter:tech:imbue; consume:never" — focus material: spells
 *                    with Imbuement cost 1 AP less (while the item is equipped)
 *
 * IMPORTANT: the engine reads the change rows of EACH effect separately
 * (actor.appliedEffects → effect.changes) — including effects transferred
 * from items (transfer: true). The merged flag value on the actor isn't used,
 * so the change row's mode (Add/Override) does NOT matter, and several
 * simultaneous buffs don't overwrite each other — each lives and burns independently.
 *
 * Burn rule: at stage S, an effect is deleted if the maximum
 * stage among its mods MATCHED by the filter equals S. An effect whose filter didn't
 * match the maneuver isn't spent — it will expire on its own by duration.
 */

/**
 * Attacking reactions whose cost is shifted by weapon tempo (13. Weapons §Properties:
 * Fast −1 AP, Slow +1 AP, while the weapon is equipped).
 * The monster Attack of Opportunity (`maneuver_monster_attack_of_opportunity`)
 * isn't included: natural weapons aren't marked with tempo.
 */
const TEMPO_MANEUVERS = new Set([
  "maneuver_riposte",
  "maneuver_punishing_miss",
  "maneuver_attack_of_opportunity",
  "maneuver_preemptive_thrust"
]);

/** Order of consumption stages. "never" doesn't burn automatically. */
const CONSUME_STAGES = { use: 0, roll: 1, damage: 2, never: 3 };

/** Default burn moment for each operation. */
const DEFAULT_CONSUME = {
  ap_set: "use",
  ap_discount: "use",
  attack: "roll",
  damage: "damage",
  dice_step: "damage",
  pierce: "damage"
};

export const MOD_CHANGE_KEY = "flags.dedrel.mod";

/**
 * Checks whether the maneuver matches the modifier's filter.
 * Supports several conditions via "|" (OR logic).
 *
 * Supported filter tokens:
 *   "any"          — any maneuver (always true)
 *   "ranged"       — the maneuver requires a ranged weapon (req_weapon_type.ranged)
 *   "melee"        — the maneuver requires a melee weapon (req_weapon_type.melee)
 *   "shield"       — the maneuver requires a shield
 *   "skill:<key>"  — the maneuver is bound to a specific skill group (req_weapon_skill_group)
 *   "key:<key>"    — the maneuver has a specific system.key or name
 *   "dtype:<type>" — the item deals damage of a certain type (piercing, slashing, bludgeoning)
 *
 * Tokens for Constructor spells (key syntax as in CONFIG.DEDREL.magic):
 *   "doctrine:<key>" — a spell of the doctrine (system.doctrine; works for linear ones too)
 *   "tech:<key>"     — the build has the Technique (chosen_techniques)
 *   "mod:<key>"      — the build has the Modifier (chosen_modifiers)
 *
 * @param {Item} item
 * @param {string} filter
 * @returns {boolean}
 */
function matchesFilter(item, filter) {
  if (!filter || filter === "any") return true;

  const tokens = filter.split("|").map(s => s.trim());
  const wType = item.system.req_weapon_type || item.system.weapon_type || {};
  const skillGroup = item.system.req_weapon_skill_group || item.system.skill || "";
  const wDmgType = item.system.req_weapon_damage_type || item.system.damage_type || {};

  for (const token of tokens) {
    if (token === "any") return true;
    if (token === "ranged") {
      if (wType.ranged) return true;
      // Also check by skill group (bows, crossbows, etc.)
      if (["bows", "crossbows", "firearms", "throwing", "artillery"].includes(skillGroup)) return true;
    }
    if (token === "melee") {
      if (wType.melee) return true;
      // Also check by skill group for melee weapons.
      // Note: some maneuvers use "bladed" instead of "bladed_weapons".
      if (["bladed_weapons", "bladed", "blunt_weapons", "pole_weapons", "unarmed_combat", "exotic_weapons"].includes(skillGroup)) return true;
    }
    if (token === "shield") {
      if (wType.shield) return true;
    }
    if (token.startsWith("skill:")) {
      const sk = token.slice(6);
      if (skillGroup === sk) return true;
    }
    if (token.startsWith("key:")) {
      const k = token.slice(4);
      if (item.system.key === k || item.name === k) return true;
    }
    if (token.startsWith("dtype:")) {
      const dt = token.slice(6);
      if (wDmgType[dt]) return true;
    }
    if (token.startsWith("doctrine:")) {
      const d = token.slice(9);
      if (item.system.doctrine === d) return true;
    }
    if (token.startsWith("tech:")) {
      const t = token.slice(5);
      if ((item.system.chosen_techniques || []).includes(t)) return true;
    }
    if (token.startsWith("mod:")) {
      const mk = token.slice(4);
      if ((item.system.chosen_modifiers || []).some(m => m.key === mk)) return true;
    }
  }
  return false;
}

export class DedrelBonuses {

  /**
   * Parses one DSL modifier string.
   * @param {string} str — e.g. "ap_set:0; filter:ranged; consume:use"
   * @returns {{op: string, value: string, filter: string, consume: string}|null}
   *          null if the string isn't a valid modifier.
   */
  static parseMod(str) {
    if (typeof str !== "string" || !str.trim()) return null;

    const segments = str.split(";").map(s => s.trim()).filter(s => s.length > 0);
    if (segments.length === 0) return null;

    // The first segment is the operation
    const [opRaw, ...opValueParts] = segments[0].split(":");
    const op = opRaw.trim();
    const opValue = opValueParts.join(":").trim();

    if (!(op in DEFAULT_CONSUME)) {
      console.warn(`Dedrel | Unknown DSL modifier operation "${op}" in "${str}"`);
      return null;
    }
    if (opValue === "") {
      console.warn(`Dedrel | Empty value for operation "${op}" in "${str}"`);
      return null;
    }

    const mod = {
      op,
      value: opValue,
      filter: "any",
      consume: DEFAULT_CONSUME[op]
    };

    for (const segment of segments.slice(1)) {
      const idx = segment.indexOf(":");
      if (idx === -1) {
        console.warn(`Dedrel | Malformed segment "${segment}" in modifier string "${str}"`);
        return null;
      }
      const name = segment.slice(0, idx).trim();
      const value = segment.slice(idx + 1).trim();

      if (name === "filter") {
        // Filter token validation: a common mistake is a maneuver key without the "key:" prefix.
        // Such a filter never matches, and the mod silently won't work.
        for (const token of value.split("|").map(s => s.trim()).filter(s => s.length > 0)) {
          if (["any", "ranged", "melee", "shield"].includes(token)) continue;
          if (token.startsWith("skill:") || token.startsWith("key:") || token.startsWith("dtype:")) continue;
          if (token.startsWith("doctrine:") || token.startsWith("tech:") || token.startsWith("mod:")) continue;
          console.warn(`Dedrel | Unknown filter token "${token}" in "${str}". For maneuver keys use the "key:" prefix, e.g. "key:${token}".`);
          return null;
        }
        mod.filter = value || "any";
      } else if (name === "consume") {
        if (!(value in CONSUME_STAGES)) {
          console.warn(`Dedrel | Unknown burn moment "consume:${value}" in "${str}"`);
          return null;
        }
        mod.consume = value;
      } else {
        console.warn(`Dedrel | Unknown parameter "${name}" in modifier string "${str}"`);
        return null;
      }
    }

    return mod;
  }

  /**
   * Collects all modifiers applicable to the item from all of the actor's active effects.
   *
   * @param {Actor} actor
   * @param {Item} item — the maneuver/spell the filters are applied to
   * @returns {{
   *   apSet: number|null,        — minimum ap_set among the matches (null if none)
   *   apDiscount: number,        — total AP discount
   *   attack: number,            — total attack bonus
   *   damageParts: string[],     — additions to the damage formula (numbers or dice)
   *   diceStep: number,          — total shift of the base formula along the dice ladder
   *   pierce: number,            — total damage Armor Piercing
   *   hasMatches: boolean        — whether there's at least one matched mod
   * }}
   */
  static collect(actor, item) {
    const result = { apSet: null, apDiscount: 0, attack: 0, damageParts: [], diceStep: 0, pierce: 0, hasMatches: false };
    if (!actor || !item) return result;

    for (const mod of this.#iterateMatchedMods(actor, item)) {
      result.hasMatches = true;
      switch (mod.op) {
        case "ap_set": {
          const v = parseInt(mod.value, 10);
          if (!Number.isNaN(v)) {
            result.apSet = (result.apSet === null) ? v : Math.min(result.apSet, v);
          }
          break;
        }
        case "ap_discount": {
          const v = parseInt(mod.value, 10);
          if (!Number.isNaN(v)) result.apDiscount += v;
          break;
        }
        case "attack": {
          const v = parseInt(mod.value, 10);
          if (!Number.isNaN(v)) result.attack += v;
          break;
        }
        case "damage": {
          result.damageParts.push(mod.value);
          break;
        }
        case "dice_step": {
          const v = parseInt(mod.value, 10);
          if (!Number.isNaN(v)) result.diceStep += v;
          break;
        }
        case "pierce": {
          const v = parseInt(mod.value, 10);
          if (!Number.isNaN(v)) result.pierce += v;
          break;
        }
      }
    }

    return result;
  }

  /**
   * The item's effective AP cost, including DSL modifiers, the global discount
   * and the AP surcharge (system.bonuses.*_ap_penalty).
   * A single point of calculation: used both in Item#use() and in the chain maneuver HUD,
   * so that the displayed and actual cost never diverge.
   *
   * @param {Actor} actor
   * @param {Item} item
   * @returns {{cost: number, modApplied: boolean}} modApplied — whether a one-shot mod was applied
   */
  /**
   * Whether the maneuver is subject to weapon tempo. Also needed by the use dialog —
   * it labels the tempo in the weapon list.
   * @param {Item} item
   * @returns {boolean}
   */
  static isTempoManeuver(item) {
    return item?.type === "maneuver" && TEMPO_MANEUVERS.has(item.system?.key);
  }

  /**
   * AP cost shift from the selected weapon's tempo: Fast −1, Slow +1
   * (13. Weapons §Properties). Computed AFTER the DSL modifiers and separately from
   * them: it isn't a one-shot buff but a permanent property of the steel in hand.
   *
   * A zero cost isn't touched in either direction: a maneuver made free by
   * a buff (ap_set:0) isn't made pricier again by a Slow weapon.
   *
   * @param {number} apCost — cost after DSL modifiers
   * @param {Item} item — the maneuver
   * @param {Item|null} weapon — the weapon the reaction is performed with
   * @returns {number}
   */
  static applyWeaponTempo(apCost, item, weapon) {
    if (apCost <= 0 || !this.isTempoManeuver(item)) return apCost;
    if (weapon?.type !== "weapon" || !weapon.system?.equipped) return apCost;
    const shift = (weapon.system.is_fast ? -1 : 0) + (weapon.system.is_slow ? 1 : 0);
    return Math.max(0, apCost + shift);
  }

  static effectiveApCost(actor, item) {
    let apCost = item.system.ap_cost || 0;
    let modApplied = false;

    if (item.type === "maneuver" || item.type === "spell") {
      const mods = this.collect(actor, item);
      const bonuses = actor.system.bonuses || {};

      // AP surcharge ("AP penalty"): global + targeted by item type.
      // Offsets the discounts (discount − surcharge). Applies only to
      // items with a nonzero base cost — free ones aren't charged.
      const apPenalty = (bonuses.global_ap_penalty || 0)
        + (item.type === "maneuver" ? (bonuses.maneuver_ap_penalty || 0) : 0)
        + (item.type === "spell" ? (bonuses.spell_ap_penalty || 0) : 0);

      const globalDiscount = bonuses.global_ap_discount || 0;
      // Net cost modifier: a discount increases the discount pool, a surcharge decreases it.
      const netDiscount = mods.apDiscount + globalDiscount - apPenalty;
      if (netDiscount !== 0 && apCost > 0) {
        apCost = Math.max(0, apCost - netDiscount);
        if (mods.apDiscount > 0) modApplied = true;
      }
      if (mods.apSet !== null) {
        // ap_set always applies when the filter matches (even if apCost is already 0)
        apCost = mods.apSet;
        modApplied = true;
      }
    }

    return { cost: apCost, modApplied };
  }

  /**
   * Burns the carrier effects whose burn moment has come.
   * An effect "burns" at stage S if the maximum stage among its
   * MATCHED mods equals S (mods with consume:never aren't counted and don't burn).
   *
   * What exactly is deleted depends on the carrier:
   *  - an effect embedded in the actor (an applied status) — the effect itself is deleted;
   *  - an effect on the actor's Condition item — the whole condition item is deleted;
   *  - an effect on a permanent item (talent, mutation, weapon) — NOT deleted,
   *    a warning is written to the console: on such carriers use consume:never.
   *
   * @param {Actor} actor
   * @param {Item} item
   * @param {"use"|"roll"|"damage"} stage
   */
  static async consumeStage(actor, item, stage) {
    if (!actor || !item) return;
    const stageIdx = CONSUME_STAGES[stage];
    if (stageIdx === undefined) return;

    const effectIds = [];
    const conditionItemIds = new Set();

    for (const effect of this.#activeEffects(actor)) {
      let maxStage = -1;
      for (const change of effect.changes) {
        if (change.key !== MOD_CHANGE_KEY) continue;
        const mod = this.parseMod(change.value);
        if (!mod) continue;
        if (!matchesFilter(item, mod.filter)) continue;
        if (mod.consume === "never") continue;
        maxStage = Math.max(maxStage, CONSUME_STAGES[mod.consume]);
      }
      if (maxStage !== stageIdx) continue;

      const parent = effect.parent;
      if (parent === actor) {
        effectIds.push(effect.id);
      } else if (parent instanceof Item && parent.type === "condition") {
        conditionItemIds.add(parent.id);
      } else {
        console.warn(`Dedrel | A consumable DSL modifier sits on the permanent item "${parent?.name}" and will not be burned. Use consume:never or a condition carrier.`);
      }
    }

    if (effectIds.length > 0) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", effectIds);
    }
    if (conditionItemIds.size > 0) {
      await actor.deleteEmbeddedDocuments("Item", [...conditionItemIds]);
    }
  }

  /**
   * All effects acting on the actor: those embedded in the actor (applied statuses)
   * PLUS those transferred from items (transfer: true). The plain actor.effects
   * contains only the first group — because of this, mods on Condition items
   * would be invisible to the engine.
   */
  static #activeEffects(actor) {
    return actor.appliedEffects ?? actor.effects.filter(e => !e.disabled);
  }

  /**
   * Generator: walks the actor's active effects and yields the parsed mods
   * that passed the item filter.
   */
  static *#iterateMatchedMods(actor, item) {
    for (const effect of this.#activeEffects(actor)) {
      for (const change of effect.changes) {
        if (change.key !== MOD_CHANGE_KEY) continue;
        const mod = this.parseMod(change.value);
        if (!mod) continue;
        if (!matchesFilter(item, mod.filter)) continue;
        yield mod;
      }
    }
  }
}
