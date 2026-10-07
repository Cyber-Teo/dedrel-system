/**
 * Canonical list of creature types (à la D&D creature types).
 * Keys are stable English identifiers for matching "weapon/effect
 * vs type"; display names go through i18n DEDREL.CreatureTypes.<key>.
 *
 * The list is extensible: a creature type is stored as a regular Item (creature_type)
 * with a system.key field. The values below are just preset hints for picking on
 * the sheet; the GM can set an arbitrary key for a new type.
 */
export const CREATURE_TYPES = [
  "beast",         // Beasts
  "magical_beast", // Magical beasts (mutants, spawned by magic)
  "plant",         // Plants (carnivorous flora, forest guardians)
  "ooze",          // Oozes (amorphous devourers)
  "elemental",     // Elementals (the elements)
  "ethereal",      // Ethereal (creatures of the aether; often a paired type: ethereal + shade, etc.)
  "astral",        // Astral (creatures of the astral; often a paired type: astral + beast, etc.)
  "spirit",        // Spirits (neutral-to-positive "undead", spirits of places/ancestors)
  "shade",         // Shades (undead without a physical shell)
  "fey",           // Fey
  "demon",         // Demons (steeped in corruption)
  "dragon",        // Dragons (NPC)
  "elf",           // Elves (NPC)
  "human",         // Humans (NPC: guards, bandits, etc.; the type isn't put on player characters)
  "undead",        // Undead (zombies, skeletons, vampires)
  "cosmic",        // Cosmic (aliens)
  "construct"      // Constructs (golems, automatons, animated mechanisms)
];
