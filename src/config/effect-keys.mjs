/**
 * Catalog of Active Effect keys for the Effect Key Browser (EffectKeyBrowserApp)
 * and the dictionaries of the flags.dedrel.mod DSL modifier builder.
 *
 * The human-readable version is docs/effect-keys.md; this file is its
 * machine counterpart for the UI. So that the catalog doesn't have to be maintained by hand,
 * the lists of attributes/skills/DR/bonuses/doctrines are built by INTROSPECTING the character
 * schema (CONFIG.Actor.dataModels.character.schema): a new skill or bonus
 * in shared-schema.mjs / bonuses-schema.mjs will appear in the browser on its own.
 * Only derived parameters without schema labels (defenses,
 * resources) and the hints are described by hand.
 *
 * Everything is built at runtime (after i18n init) — call the functions, not constants.
 */

import { DR_KEY_LABELS } from "../constants.mjs";

/** Localization with a fallback: if the key isn't in the dictionary, return fallback. */
function loc(key, fallback = null) {
  const s = game.i18n.localize(key);
  return s === key ? (fallback ?? key) : s;
}

/**
 * Keys of a nested SchemaField of the character schema by path ("attributes",
 * "magic.techniques"...). An empty array if the path doesn't exist.
 */
function schemaFieldKeys(path) {
  let field = CONFIG.Actor?.dataModels?.character?.schema;
  for (const part of path.split(".")) field = field?.fields?.[part];
  return field?.fields ? Object.keys(field.fields) : [];
}

/** Same as above, but returns the SchemaField itself (for access to subfields). */
function schemaField(path) {
  let field = CONFIG.Actor?.dataModels?.character?.schema;
  for (const part of path.split(".")) field = field?.fields?.[part];
  return field ?? null;
}

/** Labels for the bonus fields (bonuses-schema.mjs). New fields fall back to the fallback key. */
const BONUS_HINTS = {
  hp_multiplier: "0.25 = +25%",
  carry_capacity_mult: "0.5 = +50%",
  ignore_wound_penalty: "Add | 1",
  infinite_explode: "Add | 1",
  damage_explode: "Add | 1",
  ignore_encumbrance_penalty: "Add | 1"
};

/**
 * Assembles the catalog of key categories for the browser.
 * @returns {Array<{id: string, label: string, note?: string, entries: Array}>}
 *   entry: { key, label, mode, hint?, searchText }
 */
export function buildEffectKeyCatalog() {
  const kb = (k, f) => loc(`DEDREL.KeyBrowser.${k}`, f);
  const categories = [];

  const entry = (key, label, mode = "Add", hint = "") => ({
    key, label, mode, hint,
    searchText: `${label} ${key} ${hint}`.toLowerCase()
  });

  // 1. Attributes: rank + saving throw bonus
  const attrEntries = [];
  for (const a of schemaFieldKeys("attributes")) {
    const name = loc(`DEDREL.Attributes.${a}`, a);
    attrEntries.push(entry(`system.attributes.${a}.rank`, `${name} — ${kb("Sub.Rank")}`));
    attrEntries.push(entry(`system.attributes.${a}.save_bonus`, `${name} — ${kb("Sub.SaveBonus")}`));
  }
  categories.push({ id: "attributes", label: kb("Cat.Attributes"), entries: attrEntries });

  // 2. Skills: roll bonus (recommended) + rank (permanent training)
  const skillEntries = [];
  for (const s of schemaFieldKeys("skills")) {
    const name = loc(`DEDREL.Skills.${s}`, s);
    skillEntries.push(entry(`system.skills.${s}.bonus`, `${name} — ${kb("Sub.Bonus")}`));
    skillEntries.push(entry(`system.skills.${s}.rank`, `${name} — ${kb("Sub.Rank")}`));
  }
  categories.push({
    id: "skills", label: kb("Cat.Skills"), note: kb("Note.Skills"), entries: skillEntries
  });

  // 3. Defenses and derived parameters
  categories.push({
    id: "derived", label: kb("Cat.Derived"), entries: [
      entry("system.defenses.dodge", kb("Entry.Dodge")),
      entry("system.defenses.block", kb("Entry.Block")),
      entry("system.defenses.mdef", kb("Entry.MDef")),
      entry("system.initiative", kb("Entry.Initiative")),
      entry("system.resources.movement.max", kb("Entry.Movement")),
      entry("system.resources.hp.max", kb("Entry.HPMax")),
      entry("system.resources.luck_points.max", kb("Entry.LuckMax")),
      entry("system.senses.darkvision", kb("Entry.Darkvision"))
    ]
  });

  // 4. System bonuses (bonuses-schema.mjs) — a penalty = a negative value
  const bonusEntries = schemaFieldKeys("bonuses").map(b =>
    entry(`system.bonuses.${b}`, loc(`DEDREL.KeyBrowser.Bonus.${b}`, b), "Add", BONUS_HINTS[b] ?? "")
  );
  categories.push({
    id: "bonuses", label: kb("Cat.Bonuses"), note: kb("Note.Bonuses"), entries: bonusEntries
  });

  // 5. Damage Reduction (DR)
  const drEntries = schemaFieldKeys("dr").map(d =>
    entry(`system.dr.${d}`, loc(DR_KEY_LABELS[d] ?? d, d))
  );
  categories.push({ id: "dr", label: kb("Cat.DR"), entries: drEntries });

  // 6. Action Points (pool maximums)
  categories.push({
    id: "ap", label: kb("Cat.AP"), entries: [
      entry("system.resources.ap_universal.max", loc("DEDREL.ActorSheet.UniversalAP")),
      entry("system.resources.ap_maneuver.max", loc("DEDREL.ActorSheet.ManeuverAP")),
      entry("system.resources.ap_magic.max", loc("DEDREL.ActorSheet.MagicAP"))
    ]
  });

  // 7. Magic: doctrines (access Override 1 / rank Add), Paths, Techniques
  const magicEntries = [];
  for (const d of schemaFieldKeys("doctrines")) {
    const name = loc(`DEDREL.Magic.Doctrines.${d}`, d);
    magicEntries.push(entry(`system.doctrines.${d}.unlocked`, `${name} — ${kb("Sub.Unlocked")}`, "Override", "1"));
    magicEntries.push(entry(`system.doctrines.${d}.rank`, `${name} — ${kb("Sub.Rank")}`));
    const paths = schemaField(`doctrines.${d}.paths`);
    for (const p of paths?.fields ? Object.keys(paths.fields) : []) {
      magicEntries.push(entry(`system.doctrines.${d}.paths.${p}`, loc(`DEDREL.Magic.Paths.${p}`, p), "Override", "1"));
    }
  }
  for (const t of schemaFieldKeys("magic.techniques")) {
    magicEntries.push(entry(`system.magic.techniques.${t}`, `${kb("Sub.Technique")}: ${loc(`DEDREL.Magic.Techniques.${t}`, t)}`, "Override", "1"));
  }
  categories.push({ id: "magic", label: kb("Cat.Magic"), entries: magicEntries });

  return categories;
}

/* ========================================================================== */
/* Dictionaries of the flags.dedrel.mod DSL builder (engine: dedrel-bonuses.mjs)     */
/* ========================================================================== */

/** DSL operations: placeholder value and default burn moment (for hints). */
export const DSL_OPS = [
  { key: "attack", placeholder: "2", defaultConsume: "roll" },
  { key: "damage", placeholder: "1d6", defaultConsume: "damage" },
  { key: "dice_step", placeholder: "1", defaultConsume: "damage" },
  { key: "pierce", placeholder: "2", defaultConsume: "damage" },
  { key: "ap_discount", placeholder: "1", defaultConsume: "use" },
  { key: "ap_set", placeholder: "0", defaultConsume: "use" }
];

/**
 * Filter condition types. valueKind:
 *   "none" — a token without a value; "select" — a dropdown (options are built in
 *   buildDslFilterOptions); "text" — free input (key:<system.key>).
 */
export const DSL_FILTER_TYPES = [
  { key: "any", valueKind: "none" },
  { key: "melee", valueKind: "none" },
  { key: "ranged", valueKind: "none" },
  { key: "shield", valueKind: "none" },
  { key: "skill", valueKind: "select" },
  { key: "dtype", valueKind: "select" },
  { key: "key", valueKind: "text" },
  { key: "doctrine", valueKind: "select" },
  { key: "tech", valueKind: "select" },
  { key: "mod", valueKind: "select" }
];

/** Burn moments ("" = automatic by operation). */
export const DSL_CONSUME = ["", "use", "roll", "damage", "never"];

/**
 * Value options for the DSL select filters, {value: label}.
 * @param {string} type — a key from DSL_FILTER_TYPES
 */
export function buildDslFilterOptions(type) {
  const options = {};
  switch (type) {
    case "skill":
      for (const s of schemaFieldKeys("skills")) options[s] = loc(`DEDREL.Skills.${s}`, s);
      break;
    case "dtype":
      // Physical weapon damage types (weapon.mjs → damage_type)
      for (const d of ["slashing", "piercing", "bludgeoning"]) options[d] = loc(DR_KEY_LABELS[d], d);
      break;
    case "doctrine":
      for (const d of schemaFieldKeys("doctrines")) options[d] = loc(`DEDREL.Magic.Doctrines.${d}`, d);
      break;
    case "tech":
      for (const t of schemaFieldKeys("magic.techniques")) options[t] = loc(`DEDREL.Magic.Techniques.${t}`, t);
      break;
    case "mod":
      for (const m of Object.keys(CONFIG.DEDREL?.magic?.modifiers ?? {})) {
        options[m] = loc(`DEDREL.Magic.Modifiers.${m}`, m);
      }
      break;
  }
  return options;
}
