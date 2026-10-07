// Item rarity (see "_rules/15. Inventory.md"). The canonical keys use
// an underscore (very_rare). Order = increasing value/rarity.
export const ITEM_RARITY_ENUM = ["common", "uncommon", "rare", "very_rare", "legendary"];

export const ITEM_RARITY_LABELS = {
  common: "DEDREL.Rarity.common",
  uncommon: "DEDREL.Rarity.uncommon",
  rare: "DEDREL.Rarity.rare",
  very_rare: "DEDREL.Rarity.very_rare",
  legendary: "DEDREL.Rarity.legendary"
};

// Accessory slot categories (values of the item field system.equip_slot).
// head — helmet/diadem; neck — necklace; torso — belt; hand — rings/bracelets
// (they fit any hand/tail slot). An empty string = not an accessory.
export const ACCESSORY_SLOT_TYPES = ["head", "neck", "torso", "hand"];

// Default currency denominations. The world's actual currency list is set in
// the "currencies" setting (settings menu); this is just the default set/fallback.
export const CURRENCY_DENOMINATION_ENUM = ["copper", "silver", "gold", "platinum"];

// Default world currency list (the "currencies" setting). Each currency:
//   key        — machine key (Latin characters), the key in the actor's wallet system.currency.<key>
//   name       — display name; for the defaults it's an i18n key (DEDREL.Currency.*),
//                which is resolved in DedrelCurrency.defs() — the constants load before the dictionaries
//   abbr       — short abbreviation for the wallet UI (also an i18n key for the defaults)
//   base_value — value in shared "base units" (the conversion mechanism:
//                copper=1, silver=10, gold=100, platinum=1000)
//   weight     — weight of one coin (kg), affects encumbrance
//   color      — accent color in the UI
export const DEFAULT_CURRENCIES = [
  { key: "copper",   name: "DEDREL.Currency.Copper",   abbr: "DEDREL.Currency.CopperAbbr",   base_value: 1,    weight: 0.01, color: "#b87333" },
  { key: "silver",   name: "DEDREL.Currency.Silver",   abbr: "DEDREL.Currency.SilverAbbr",   base_value: 10,   weight: 0.01, color: "#c0c0c0" },
  { key: "gold",     name: "DEDREL.Currency.Gold",     abbr: "DEDREL.Currency.GoldAbbr",     base_value: 100,  weight: 0.01, color: "#ffd700" },
  { key: "platinum", name: "DEDREL.Currency.Platinum", abbr: "DEDREL.Currency.PlatinumAbbr", base_value: 1000, weight: 0.01, color: "#e5e4e2" }
];

// Functional crafts of the crafting system (craft/New Craft.md): values of the field
// system.crafting.discipline and the recipes' discipline. An empty string = not set.
export const CRAFT_DISCIPLINE_ENUM = ["alchemy", "smithing", "inscription", "tailoring", "carpentry", "jewelry", "engineering"];

// Crafting material classes (system.material_class on craft_material).
// The seven canonical RAW material types from the crafting rules (19. Crafting §Materials) plus
// an eighth class "processed" — PROCESSED materials: the economy's second tier,
// i.e. crafting products themselves (ink, paper, vials, ingots, powder, spirits).
// Processed materials have no signatures or slots: they don't go into weapons or armor, they
// live only in recipes as regular ingredients.
export const MATERIAL_CLASS_ENUM = ["metal", "mineral", "wood", "herb", "leather", "cloth", "creature_part", "processed"];

// Weapon/armor upgrade slot tiers (no legendary: very rare is the maximum).
export const SLOT_TIER_ENUM = ["common", "uncommon", "rare", "very_rare"];

// Ammunition types (system.ammo_type on ammunition) and their binding to the ranged
// weapon class. The order in RANGED_CLASS_KEYS matters: firearm and crossbow
// are checked BEFORE bow, since the substring "bow" is contained in "crossbow".
export const AMMO_TYPE_ENUM = ["arrow", "bolt", "shot"];

export const AMMO_TYPE_LABELS = {
  arrow: "DEDREL.Ammo.Type.arrow",
  bolt: "DEDREL.Ammo.Type.bolt",
  shot: "DEDREL.Ammo.Type.shot"
};

// The ranged weapon class is determined by key/name (substring).
// ammo — the compatible ammunition type; consumable_recovery=false → the ammunition
// can't be picked up after a shot (firearm powder).
export const RANGED_CLASS_KEYS = [
  { class: "firearm",  ammo: "shot",  keys: ["musket", "pistol", "arquebus"], recoverable: false },
  { class: "crossbow", ammo: "bolt",  keys: ["crossbow"], recoverable: true },
  { class: "bow",      ammo: "arrow", keys: ["bow"], recoverable: true }
];

export const DR_KEY_LABELS = {
  "piercing": "DEDREL.ItemSheet.Piercing",
  "bludgeoning": "DEDREL.ItemSheet.Bludgeoning",
  "slashing": "DEDREL.ItemSheet.Slashing",
  "heat": "DEDREL.ItemSheet.Fire",
  "cold": "DEDREL.ItemSheet.Cold",
  "necrotic": "DEDREL.ItemSheet.Necrotic",
  "radiant": "DEDREL.ItemSheet.Radiant",
  "electric": "DEDREL.ItemSheet.Lightning",
  "sonic": "DEDREL.ItemSheet.Thunder",
  "acid": "DEDREL.ItemSheet.Acid"
};

/**
 * Resistance and vulnerability tiers (_rules/18. Enemies.md §Vulnerabilities and
 * type features). value — DR units (1 unit = 10% of damage); negative values
 * applyDamage() reads as vulnerability (amplifying incoming damage).
 *
 * This is combinatorics (6 tiers × 10 damage types), so such effects
 * are assembled by the generator in the "From library" picker rather than stored as ready entries
 * in the active_effects compendium — otherwise the picker list would swell to 60 rows.
 */
export const DR_TIERS = {
  weak_resist: { value: 2, label: "DEDREL.EffectLib.Tier.WeakResist", img: "icons/svg/shield.svg" },
  strong_resist: { value: 5, label: "DEDREL.EffectLib.Tier.StrongResist", img: "icons/svg/mage-shield.svg" },
  immunity: { value: 10, label: "DEDREL.EffectLib.Tier.Immunity", img: "icons/svg/holy-shield.svg" },
  vulnerability: { value: -2, label: "DEDREL.EffectLib.Tier.Vulnerability", img: "icons/svg/downgrade.svg" },
  strong_vulnerability: { value: -5, label: "DEDREL.EffectLib.Tier.StrongVulnerability", img: "icons/svg/downgrade.svg" },
  extreme_vulnerability: { value: -10, label: "DEDREL.EffectLib.Tier.ExtremeVulnerability", img: "icons/svg/degen.svg" }
};
