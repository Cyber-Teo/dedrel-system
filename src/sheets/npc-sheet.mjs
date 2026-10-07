import DedrelCharacterSheet from "./character-sheet.mjs";

/**
 * Sheet for the "NPC / Monster" actor (type npc) — a subclass of the character sheet.
 * Inherits all the functionality (tabs, slot-based equipment, saving throws,
 * favorite skills, drag-n-drop, scroll preservation), replacing two places:
 *   - main: the NPC header (tier/threat, peon hits or boss HP, creature types)
 *     instead of the character header (luck/XP/three AP pools);
 *   - config (instead of the Experience tab): all manual settings — base ranks
 *     of attributes/skills, overrides of derived values, DR, techniques/doctrines. NPCs
 *     have no XP advancement, the values are set directly by the GM.
 *
 * IMPORTANT: the inputs of the Tuning tab take their values from _source (not from
 * the derived system), otherwise submit "bakes" the contribution of effects/armor into the base.
 */

// Skill categories for the UI (the same order as on the character sheet).
const SKILL_CATEGORIES = {
  combat: { label: "DEDREL.ActorSheet.CombatSkills", keys: ["crossbows", "unarmed_combat", "pole_weapons", "blunt_weapons", "artillery", "firearms", "throwing", "exotic_weapons", "magical_attacks", "bows", "bladed_weapons", "armor_use"] },
  intellectual: { label: "DEDREL.ActorSheet.IntellectualSkills", keys: ["cultural_awareness", "knowledge", "logic_reasoning", "interpretation", "research"] },
  practical: { label: "DEDREL.ActorSheet.PracticalSkills", keys: ["craftsmanship", "stealth", "thievery", "healing", "survival", "engineering", "atletism", "perception"] },
  social: { label: "DEDREL.ActorSheet.SocialSkills", keys: ["persuasion", "insight", "deception", "intimidation", "performance"] }
};

export default class DedrelNpcSheet extends DedrelCharacterSheet {
  static DEFAULT_OPTIONS = {
    classes: ["dedrel", "sheet", "actor", "npc"]
  };

  static PARTS = {
    navigation: { template: "systems/dedrel/templates/actor/parts/character-navigation.hbs" },
    main: { template: "systems/dedrel/templates/actor/parts/npc-main.hbs" },
    inventory: { template: "systems/dedrel/templates/actor/parts/npc-inventory.hbs" },
    maneuvers: { template: "systems/dedrel/templates/actor/parts/character-maneuvers.hbs" },
    spells: { template: "systems/dedrel/templates/actor/parts/character-spells.hbs" },
    mutations: { template: "systems/dedrel/templates/actor/parts/character-mutations.hbs" },
    talents: { template: "systems/dedrel/templates/actor/parts/character-talents.hbs" },
    statuses: { template: "systems/dedrel/templates/actor/parts/character-statuses.hbs" },
    biography: { template: "systems/dedrel/templates/actor/parts/character-biography.hbs" },
    config: { template: "systems/dedrel/templates/actor/parts/npc-config.hbs" }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "main", label: "DEDREL.ActorSheet.Tabs.Main" },
        { id: "inventory", label: "DEDREL.ActorSheet.Tabs.Inventory" },
        { id: "maneuvers", label: "DEDREL.ActorSheet.Tabs.Maneuvers" },
        { id: "spells", label: "DEDREL.ActorSheet.Tabs.Spells" },
        { id: "mutations", label: "DEDREL.ActorSheet.Tabs.Mutations" },
        { id: "talents", label: "DEDREL.ActorSheet.Tabs.Talents" },
        { id: "statuses", label: "DEDREL.ActorSheet.Tabs.Statuses" },
        { id: "biography", label: "DEDREL.ActorSheet.Tabs.Biography" },
        { id: "config", label: "DEDREL.ActorSheet.Tabs.NpcConfig" }
      ],
      initial: "main",
      navSelector: ".tabs[data-group='primary']",
      contentSelector: ".sheet-body"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const sys = this.document.system;
    const src = this.document._source.system;

    // Creature types are shown as chips in the header — removed from the general inventory.
    const creatureTypes = [];
    context.inventory = context.inventory.filter(i => {
      if (i.type !== "creature_type") return true;
      const label = i.system.key ? game.i18n.localize(`DEDREL.CreatureTypes.${i.system.key}`) : "";
      creatureTypes.push({ id: i.id, name: i.name, key: i.system.key, label });
      return false;
    });

    // Base (source) values for the Tuning tab.
    const srcAttributes = Object.keys(sys.attributes).map(key => ({
      key, label: `DEDREL.Attributes.${key}`,
      rank: src.attributes[key].rank,
      save_bonus: src.attributes[key].save_bonus
    }));

    const srcSkillGroups = Object.values(SKILL_CATEGORIES).map(cat => ({
      label: cat.label,
      skills: cat.keys.map(key => ({
        key, label: `DEDREL.Skills.${key}`,
        rank: src.skills[key].rank,
        bonus: src.skills[key].bonus
      }))
    }));

    // Doctrines and techniques — from source (talents can give +1 via AE).
    // Doctrine paths go here too: for a character they're granted by talents, but an NPC statblock
    // is assembled by hand — without fields in Tuning there's no way to give a boss a path.
    const doctrines = Object.keys(sys.doctrines).map(key => ({
      key, label: `DEDREL.Magic.Doctrines.${key}`,
      rank: src.doctrines[key].rank,
      unlocked: src.doctrines[key].unlocked,
      paths: Object.entries(CONFIG.DEDREL?.magic?.doctrines?.[key]?.paths ?? {}).map(([pk, pcfg]) => ({
        key: pk,
        label: game.i18n.localize(pcfg.label),
        value: src.doctrines[key].paths?.[pk] ?? 0
      }))
    }));
    const srcTechniques = Object.keys(sys.magic.techniques).map(key => ({
      key, label: `DEDREL.Magic.Techniques.${key}`,
      value: src.magic.techniques[key]
    }));

    Object.assign(context, {
      isPeon: sys.tier === "peon",
      isBoss: sys.tier === "boss",
      tierOptions: {
        peon: game.i18n.localize("DEDREL.Npc.TierPeon"),
        boss: game.i18n.localize("DEDREL.Npc.TierBoss")
      },
      creatureTypes,
      srcAttributes,
      srcSkillGroups,
      doctrines,
      srcTechniques,
      srcDr: src.dr,
      effDr: sys.dr,
      srcOverrides: src.overrides,
      srcHitsMax: src.resources.hits.max,
      srcToughness: src.toughness
    });
    return context;
  }
}
