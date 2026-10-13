/**
 * Library of reusable Active Effects (Phase 3 — potions/scrolls/magic items).
 *
 * The single source of truth for "template" effects that are applied to
 * actors (buffs/debuffs/poison/resistances). A preset described here once
 * is reused anywhere: a potion, a scroll, a torch, a trap, a GM macro —
 * instead of assembling an Active Effect from scratch by hand.
 *
 * Registered as CONFIG.DEDREL.effectLibrary in dedrel.mjs. The builder
 * buildEffectData(key, opts) assembles ActiveEffect data from a preset, ready for
 * createEmbeddedDocuments("ActiveEffect", [data]) (on an actor or an item).
 *
 * V14 COMPLIANCE (see docs/foundry-v14-quirks.md):
 *  - Changes live in `system.changes`, the operation type is the string `change.type`
 *    ("add"/"override"/…), NOT the numeric `mode` (§11, §13).
 *  - The "apply" phase is set for all system.* changes by the preCreateActiveEffect hook —
 *    no need to set it here (§12).
 *  - Periodic damage/healing — the flag `flags.dedrel.tick` = { formula, trigger,
 *    damage_type, is_heal }; ticks in DedrelCombat._onStartTurn/_onEndTurn (combat.mjs).
 *
 * All labels are localization keys (ru.json / en.json). DR paths come from buildDR()
 * (shared-schema.mjs): slashing/piercing/bludgeoning/heat/cold/necrotic/radiant/
 * electric/sonic/acid. Bonuses come from bonuses-schema.mjs (global_roll, etc.).
 */

const ICON = "systems/dedrel/assets/icons/items/magic_item.svg";

export const DEDREL_EFFECT_LIBRARY = {
  // ── Debuffs ──────────────────────────────────────────────────────────────
  poison: {
    label: "DEDREL.EffectLib.Poison",
    img: "icons/magic/death/skull-poison-green.webp",
    category: "debuff",
    duration: { rounds: 3 },
    changes: [],
    // Poison damage is untyped by default (ignores armor DR). damage_type can be
    // overridden in opts (e.g. "acid"). The formula scales with @stacks.
    tick: { formula: "1d4", trigger: "turnStart", damage_type: "", is_heal: false }
  },
  poison_strong: {
    label: "DEDREL.EffectLib.PoisonStrong",
    img: "icons/magic/death/skull-poison-green.webp",
    category: "debuff",
    duration: { rounds: 3 },
    changes: [],
    tick: { formula: "2d6", trigger: "turnStart", damage_type: "", is_heal: false }
  },
  weakness: {
    label: "DEDREL.EffectLib.Weakness",
    img: "icons/magic/unholy/strike-body-explode-disintegrate.webp",
    category: "debuff",
    duration: { rounds: 5 },
    changes: [
      { key: "system.bonuses.global_roll", type: "add", value: "-2" }
    ]
  },

  // ── Buffs ────────────────────────────────────────────────────────────────
  regeneration: {
    label: "DEDREL.EffectLib.Regeneration",
    img: "icons/magic/life/heart-cross-strong-green.webp",
    category: "buff",
    duration: { rounds: 5 },
    changes: [],
    tick: { formula: "1d4", trigger: "turnStart", damage_type: "", is_heal: true }
  },
  might: {
    label: "DEDREL.EffectLib.Might",
    img: "icons/magic/control/buff-strength-muscle-damage-orange.webp",
    category: "buff",
    duration: { seconds: 600 },
    changes: [
      { key: "system.bonuses.global_roll", type: "add", value: "2" }
    ]
  },
  invulnerability: {
    label: "DEDREL.EffectLib.Invulnerability",
    img: "icons/magic/defensive/shield-barrier-glowing-blue.webp",
    category: "buff",
    // A short, very strong buff: near-immunity to physical damage for 1 round.
    duration: { rounds: 1 },
    changes: [
      { key: "system.dr.slashing", type: "add", value: "99" },
      { key: "system.dr.piercing", type: "add", value: "99" },
      { key: "system.dr.bludgeoning", type: "add", value: "99" }
    ]
  },
  resist_fire: {
    label: "DEDREL.EffectLib.ResistFire",
    img: "icons/magic/defensive/shield-barrier-flaming-diamond-red.webp",
    category: "buff",
    duration: { seconds: 600 },
    changes: [
      { key: "system.dr.heat", type: "add", value: "5" }
    ]
  },
  resist_cold: {
    label: "DEDREL.EffectLib.ResistCold",
    img: "icons/magic/water/snowflake-ice-blue.webp",
    category: "buff",
    duration: { seconds: 600 },
    changes: [
      { key: "system.dr.cold", type: "add", value: "5" }
    ]
  },

  // ── Utility ──────────────────────────────────────────────────────────────
  // Token light: native `token.light.*` change keys (V14). Core applies them
  // ephemerally on every client (TokenDocument#applyActiveEffects), without
  // writing anything to the token document: removing/suppressing the effect turns off the light by itself.
  // dim/bright values are in scene units (meters; a hex grid = 2 m).
  // Preset source: a torch ~ 8/4 m.
  light: {
    label: "DEDREL.EffectLib.Light",
    img: "icons/magic/light/torch-fire-orange.webp",
    category: "utility",
    duration: {},
    changes: [
      { key: "token.light.dim", type: "override", value: "8" },
      { key: "token.light.bright", type: "override", value: "4" },
      { key: "token.light.color", type: "override", value: "#ff9329" },
      { key: "token.light.alpha", type: "override", value: "0.5" },
      { key: "token.light.animation.type", type: "override", value: "torch" },
      { key: "token.light.animation.speed", type: "override", value: "3" },
      { key: "token.light.animation.intensity", type: "override", value: "4" }
    ]
  }
};

/**
 * Assembles ActiveEffect data from a library preset.
 *
 * @param {string} key                    Preset key in DEDREL_EFFECT_LIBRARY.
 * @param {object} [opts]
 * @param {string} [opts.name]            Override the display name (otherwise taken from label).
 * @param {object} [opts.duration]        Override the duration ({rounds} | {seconds}).
 * @param {number} [opts.stacks]          Stacks for scaling the tick (@stacks in the formula).
 * @param {string} [opts.formula]         Override the tick formula.
 * @param {string} [opts.damageType]      Override the tick damage type (a DR key or "").
 * @param {boolean} [opts.transfer=false] Whether the effect transfers to the bearer automatically.
 * @param {string} [opts.origin]          Source UUID (item/actor).
 * @returns {object|null} Data for createEmbeddedDocuments("ActiveEffect", [data]).
 */
export function buildEffectData(key, opts = {}) {
  const preset = DEDREL_EFFECT_LIBRARY[key];
  if (!preset) {
    console.warn(`Dedrel | Unknown effect preset: "${key}"`);
    return null;
  }

  const name = opts.name || game.i18n.localize(preset.label);
  const dedrelFlags = { effectLibrary: key };

  if (preset.tick) {
    dedrelFlags.tick = {
      ...preset.tick,
      ...(opts.formula ? { formula: opts.formula } : {}),
      ...(opts.damageType !== undefined ? { damage_type: opts.damageType } : {})
    };
  }
  if (opts.stacks) dedrelFlags.stacks = opts.stacks;

  const data = {
    name,
    img: preset.img || ICON,
    // By default preset effects do NOT transfer: they are applied by hand (the "Apply
    // Effects" button on the chat card) or by the potion use pipeline.
    // The exception is light: it lives on the bearer's token while the item is on them, and
    // doesn't work at all without transfer (neither on the token nor in the Item#use toggle).
    transfer: opts.transfer ?? hasTokenLightChanges({ system: { changes: preset.changes ?? [] } }),
    duration: opts.duration || { ...preset.duration },
    system: {
      changes: (preset.changes || []).map(c => ({ ...c }))
    },
    flags: { dedrel: dedrelFlags }
  };
  if (opts.origin) data.origin = opts.origin;

  return data;
}

/* ── Token light (native `token.light.*` change keys, V14) ───────────────── */

const TOKEN_LIGHT_PREFIX = "token.light.";

/** Whether the effect (a document or raw data) has light change rows. */
export function hasTokenLightChanges(effectData) {
  return (effectData.system?.changes ?? []).some(c => c.key?.startsWith(TOKEN_LIGHT_PREFIX));
}

/**
 * Reads the `token.light.*` change rows into a flat light settings object.
 * Accepts both an ActiveEffect document and raw data (toObject).
 * @returns {{dim, bright, color, alpha, animation: {type, speed, intensity}}|null}
 */
export function readTokenLightChanges(effectData) {
  const light = {};
  for (const c of effectData.system?.changes ?? []) {
    if (!c.key?.startsWith(TOKEN_LIGHT_PREFIX)) continue;
    foundry.utils.setProperty(light, c.key.slice(TOKEN_LIGHT_PREFIX.length), c.value);
  }
  return foundry.utils.isEmpty(light) ? null : light;
}

/**
 * Assembles `token.light.*` change rows from a flat light settings object.
 * Change values are always strings (that's how the core schema stores them); casting to the
 * LightData field types is done by core itself on application.
 */
export function buildTokenLightChanges({ dim = 0, bright = 0, color = null, alpha = 0.5, animation = {} } = {}) {
  const changes = [
    { key: "token.light.dim", type: "override", value: String(dim) },
    { key: "token.light.bright", type: "override", value: String(bright) },
    { key: "token.light.alpha", type: "override", value: String(alpha) }
  ];
  if (color) changes.push({ key: "token.light.color", type: "override", value: String(color) });
  if (animation?.type) {
    changes.push({ key: "token.light.animation.type", type: "override", value: String(animation.type) });
    if (animation.speed != null) changes.push({ key: "token.light.animation.speed", type: "override", value: String(animation.speed) });
    if (animation.intensity != null) changes.push({ key: "token.light.animation.intensity", type: "override", value: String(animation.intensity) });
  }
  return changes;
}

/** The effect's change rows without the light ones (for replacing/removing light). */
export function stripTokenLightChanges(effectData) {
  return (effectData.system?.changes ?? [])
    .filter(c => !c.key?.startsWith(TOKEN_LIGHT_PREFIX))
    .map(c => ({ ...c }));
}
