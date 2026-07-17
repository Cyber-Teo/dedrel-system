import DedrelCharacterSheet from "./character-sheet.mjs";

/**
 * Лист актёра «NPC / Монстр» (тип npc) — подкласс листа персонажа.
 * Наследует всю функциональность (вкладки, экипировка со слотами, спасброски,
 * избранные навыки, drag-n-drop, сохранение скролла), заменяя два места:
 *   - main: шапка NPC (тир/угроза, хиты пеона или HP босса, типы существа)
 *     вместо шапки персонажа (удача/опыт/три пула ОД);
 *   - config (вместо вкладки «Опыт»): все ручные настройки — базовые ранги
 *     атрибутов/навыков, override производных, DR, техники/доктрины. У NPC
 *     нет прокачки за XP, значения выставляются ГМом напрямую.
 *
 * ВАЖНО: инпуты вкладки «Настройка» берут значения из _source (не из
 * производного system), иначе submit «запекает» вклад эффектов/брони в базу.
 */

// Категории навыков для UI (тот же порядок, что на листе персонажа).
const SKILL_CATEGORIES = {
  combat: { label: "DEDREL.ActorSheet.CombatSkills", keys: ["crossbows", "unarmed_combat", "pole_weapons", "blunt_weapons", "artillery", "firearms", "throwing", "exotic_weapons", "magical_attacks", "bows", "bladed_weapons", "armor_use"] },
  intellectual: { label: "DEDREL.ActorSheet.IntellectualSkills", keys: ["cultural_awareness", "knowledge", "logic_reasoning", "interpretation", "research"] },
  practical: { label: "DEDREL.ActorSheet.PracticalSkills", keys: ["craftsmanship", "stealth", "healing", "survival", "engineering", "atletism", "perception"] },
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

    // Типы существа показываются чипами в шапке — из общего инвентаря убираем.
    const creatureTypes = [];
    context.inventory = context.inventory.filter(i => {
      if (i.type !== "creature_type") return true;
      const label = i.system.key ? game.i18n.localize(`DEDREL.CreatureTypes.${i.system.key}`) : "";
      creatureTypes.push({ id: i.id, name: i.name, key: i.system.key, label });
      return false;
    });

    // Базовые (source) значения для вкладки «Настройка».
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

    // Доктрины и техники — из source (таланты могут давать +1 через AE).
    const doctrines = Object.keys(sys.doctrines).map(key => ({
      key, label: `DEDREL.Magic.Doctrines.${key}`,
      rank: src.doctrines[key].rank,
      unlocked: src.doctrines[key].unlocked
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
