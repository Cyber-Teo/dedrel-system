import { ItemDataModels } from "../data/items/index.mjs";
import { ActorDataModels } from "../data/actors/index.mjs";
import { showRollDialog } from "../dice/roll.mjs";
import { confirmPrerequisites } from "../utils/prerequisites.mjs";
import { DedrelSocket } from "../socket.mjs";
import { DedrelCurrency } from "../utils/currency.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Main Character Sheet class for the Dedrel system.
 * Inherits from the new Foundry V2 Application Framework (ActorSheetV2).
 * Handles rendering, advancement logic, drag-and-drop and button clicks.
 */
export default class DedrelCharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  
  static DEFAULT_OPTIONS = {
    classes: ["dedrel", "sheet", "actor", "character"],
    tag: "form",
    window: {
      resizable: true,
      controls: []
    },
    position: {
      width: 850,
      height: 800
    },
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      edit: DedrelCharacterSheet.#onEditItem,
      delete: DedrelCharacterSheet.#onDeleteItem,
      "toggle-favorite": DedrelCharacterSheet.#onToggleFavorite,
      create: DedrelCharacterSheet.#onCreateItem,
      changeTab: DedrelCharacterSheet.#onChangeTab,
      rollCheck: DedrelCharacterSheet.#onRollCheck,
      useItem: DedrelCharacterSheet.#onUseItem,
      editImage: DedrelCharacterSheet.#onEditImage,
      toggleSkillFavorite: DedrelCharacterSheet.#onToggleSkillFavorite,
      shortRest: DedrelCharacterSheet.#onShortRest,
      longRest: DedrelCharacterSheet.#onLongRest,
      toggleItemsLock: DedrelCharacterSheet.#onToggleItemsLock,
      toggleCreationLock: DedrelCharacterSheet.#onToggleCreationLock,
      toggleCreationView: DedrelCharacterSheet.#onToggleCreationView,
      increaseBloodline: DedrelCharacterSheet.#onIncreaseBloodline,
      decreaseBloodline: DedrelCharacterSheet.#onDecreaseBloodline,
      increaseAttribute: DedrelCharacterSheet.#onIncreaseAttribute,
      decreaseAttribute: DedrelCharacterSheet.#onDecreaseAttribute,
      increaseSkill: DedrelCharacterSheet.#onIncreaseSkill,
      decreaseSkill: DedrelCharacterSheet.#onDecreaseSkill,
      upgradeAttribute: DedrelCharacterSheet.#onUpgradeAttribute,
      upgradeSkill: DedrelCharacterSheet.#onUpgradeSkill,
      upgradeDoctrine: DedrelCharacterSheet.#onUpgradeDoctrine,
      openSpellConstructor: DedrelCharacterSheet.#onOpenSpellConstructor,
      pinSpell: DedrelCharacterSheet.#onPinSpell,
      toggleEffect: DedrelCharacterSheet.#onToggleEffect,
      editEffect: DedrelCharacterSheet.#onEditEffect,
      deleteEffect: DedrelCharacterSheet.#onDeleteEffect,
      spendLuck: DedrelCharacterSheet.#onSpendLuck,
      resetLuck: DedrelCharacterSheet.#onResetLuck,
      equipArmor: DedrelCharacterSheet.#onEquipArmor,
      unequipArmor: DedrelCharacterSheet.#onUnequipArmor,
      equipWeapon: DedrelCharacterSheet.#onEquipWeapon,
      unequipWeapon: DedrelCharacterSheet.#onUnequipWeapon,
      collapseCurrency: DedrelCharacterSheet.#onCollapseCurrency,
      depositCurrency: DedrelCharacterSheet.#onDepositCurrency,
      payCurrency: DedrelCharacterSheet.#onPayCurrency,
      openContainer: DedrelCharacterSheet.#onOpenContainer,
      createContainer: DedrelCharacterSheet.#onCreateContainer,
      unlinkContainer: DedrelCharacterSheet.#onUnlinkContainer,
      unequipSlot: DedrelCharacterSheet.#onUnequipSlot
    }
  };

  static PARTS = {
    navigation: { template: "systems/dedrel/templates/actor/parts/character-navigation.hbs" },
    main: { template: "systems/dedrel/templates/actor/parts/character-main.hbs" },
    inventory: { template: "systems/dedrel/templates/actor/parts/character-inventory.hbs" },
    maneuvers: { template: "systems/dedrel/templates/actor/parts/character-maneuvers.hbs" },
    spells: { template: "systems/dedrel/templates/actor/parts/character-spells.hbs" },
    mutations: { template: "systems/dedrel/templates/actor/parts/character-mutations.hbs" },
    talents: { template: "systems/dedrel/templates/actor/parts/character-talents.hbs" },
    statuses: { template: "systems/dedrel/templates/actor/parts/character-statuses.hbs" },
    biography: { template: "systems/dedrel/templates/actor/parts/character-biography.hbs" },
    experience: { template: "systems/dedrel/templates/actor/parts/character-experience.hbs" }
  };

  get title() {
    return this.document.name;
  }

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
        { id: "experience", label: "DEDREL.ActorSheet.Tabs.Experience" }
      ],
      initial: "main",
      navSelector: ".tabs[data-group='primary']",
      contentSelector: ".sheet-body"
    }
  };

  /**
   * Preparing data to pass into the Handlebars templates.
   * Orchestrator: each context section is assembled by its own #prepare* helper
   * (items, slots, character creation, advancement prices, skills, effects,
   * wallet, encumbrance); here they are only assembled into context.
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actorData = this.document;

    // Item deletion lock
    context.itemsLocked = this.document.getFlag("dedrel", "itemsLocked") ?? true;

    const items = this.#prepareItems(actorData);
    const equipment_slots = this.#prepareEquipmentSlots(actorData);

    // Enrich HTML for biography using namespaced TextEditor
    const enrichedBiography = await foundry.applications.ux.TextEditor.enrichHTML(actorData.system.details?.biography || "", {
      async: true,
      secrets: this.document.isOwner,
      rollData: this.document.getRollData()
    });

    const creationData = this.#prepareCreationData(actorData, items.mutations, items.mutilations);
    const xpData = this.#prepareXpData(actorData);
    const doctrinePaths = this.#prepareDoctrinePaths(actorData);
    const { skillGroups, favoriteSkillsData } = this.#prepareSkillGroups(actorData);
    const { permanentEffects, temporaryEffects } = this.#prepareEffects(actorData);
    const attributesData = this.#prepareAttributesData(actorData);
    const { walletCurrencies, walletTotal } = this.#prepareWallet(actorData);
    const encumbrance = this.#prepareEncumbrance(actorData);

    Object.assign(context, {
      actor: actorData,
      system: actorData.system,
      attributesData,
      encumbrance,
      walletCurrencies,
      walletTotal,
      walletWeight: actorData.system.wallet?.weight || 0,
      canCreateActors: Actor.canUserCreate(game.user),
      ...items,
      permanentEffects,
      temporaryEffects,
      enrichedBiography,
      creationData,
      xpData,
      doctrinePaths,
      skillGroups,
      favoriteSkillsData,
      equipment_slots,
      tabs: this._prepareTabs("primary"),
      editable: this.isEditable
    });

    return context;
  }

  /**
   * Categorizes the actor's items by type and group for the sheet tabs,
   * plus favorites (maneuvers/spells and quick slots) and the tail flag.
   * @returns {object} A bundle of arrays and groups to spread into the render context.
   */
  #prepareItems(actorData) {
    const maneuvers = [];
    const maneuversGroups = {
      basic: { label: "DEDREL.ManeuverSources.basic", items: [] },
      talent: { label: "DEDREL.ManeuverSources.talent", items: [] },
      mutation: { label: "DEDREL.ManeuverSources.mutation", items: [] }
    };
    const spells = [];
    const mutations = [];
    const mutationsGroups = {
      human: { label: "DEDREL.Bloodline.human", items: [] },
      demon: { label: "DEDREL.Bloodline.demon", items: [] },
      dragon: { label: "DEDREL.Bloodline.dragon", items: [] },
      fay: { label: "DEDREL.Bloodline.fay", items: [] },
      elf: { label: "DEDREL.Bloodline.elf", items: [] },
      general: { label: "DEDREL.Bloodline.general", items: [] }
    };
    const talents = [];
    const talentsGroups = {
      attributes: { label: "DEDREL.ActorSheet.Attributes", items: [] },
      mutations: { label: "DEDREL.ActorSheet.Mutations", items: [] },
      other: { label: "DEDREL.UI.Other", items: [] }
    };
    const mutilations = [];
    const inventory = [];
    const currencyItems = []; // "Loose" coin items (type currency) to deposit into the wallet
    const containers = [];    // Items referencing container actors (bags/chests)

    const weapons = [];
    const armors = [];
    const magic_items = [];

    const favoriteManeuversSpells = [];
    const quickSlots = [];
    const equippedWeapons = [];
    const naturalWeapons = [];

    for (let i of actorData.items) {
      const isFav = i.getFlag("dedrel", "isFavorite");

      // A container reference item: any item with the linkedActorUuid flag.
      // Shown as a separate section; its system.weight is its contribution to encumbrance
      // (for a "bag of holding" — fixed, regardless of contents).
      const linkedUuid = i.getFlag("dedrel", "linkedActorUuid");
      if (linkedUuid) {
        containers.push({ item: i, uuid: linkedUuid });
        continue;
      }

      if (i.type === 'maneuver') {
        maneuvers.push(i);
        const source = i.system.source || "basic";
        if (maneuversGroups[source]) {
          maneuversGroups[source].items.push(i);
        } else {
          maneuversGroups.basic.items.push(i);
        }
        if (isFav) favoriteManeuversSpells.push(i);
      }
      else if (i.type === 'spell') {
        spells.push(i);
        if (isFav) favoriteManeuversSpells.push(i);
      }
      else if (i.type === 'mutation') {
        mutations.push(i);
        const bloodlines = i.system.prerequisites_bloodlines || [];
        if (bloodlines.length > 0 && typeof bloodlines[0] === "string") {
           const bl = bloodlines[0].toLowerCase();
           if (mutationsGroups[bl]) mutationsGroups[bl].items.push(i);
           else mutationsGroups.general.items.push(i);
        } else {
           mutationsGroups.general.items.push(i);
        }
      }
      else if (i.type === 'talent') {
        talents.push(i);
        const reqAttr = i.system.prerequisites_attributes || [];
        const reqMut = i.system.prerequisites_mutations || [];

        if (reqAttr.length > 0) {
           talentsGroups.attributes.items.push(i);
        } else if (reqMut.length > 0) {
           talentsGroups.mutations.items.push(i);
        } else {
           talentsGroups.other.items.push(i);
        }
      }
      // Disfigurations: the legacy mutilation type and current condition items from the
      // mutilations pack (congenital flaws, biomancy mutilations) — one list.
      else if (i.type === 'mutilation' || i.type === 'condition') mutilations.push(i);
      else if (i.type === 'weapon') {
        weapons.push(i);
        // Natural weapons go into their own block (extend/retract); if one is
        // "extended" (equipped), it also lands in the quick attacks panel alongside regular ones.
        if (i.system.properties?.natural) naturalWeapons.push(i);
        if (i.system.equipped) equippedWeapons.push(i);
      }
      else if (i.type === 'armor') armors.push(i);
      else if (i.type === 'magic_item') {
        magic_items.push(i);
        if (isFav) quickSlots.push(i);
      }
      else if (i.type === 'currency') {
        // Coin items don't go into the general inventory: they are deposited into the wallet
        currencyItems.push(i);
      }
      else {
        inventory.push(i);
        if (isFav) quickSlots.push(i);
      }
    }

    const hasTail = mutations.some(m => m.system.key && m.system.key.includes("tail"));

    return {
      maneuvers, maneuversGroups, spells, mutations, mutationsGroups,
      talents, talentsGroups, mutilations, inventory, currencyItems, containers,
      weapons, armors, magic_items,
      favoriteManeuversSpells, quickSlots, equippedWeapons, hasTail,
      naturalWeapons, hasNaturalWeapon: naturalWeapons.length > 0
    };
  }

  /**
   * Resolving equipment slots: each slot's item_id → a live item of the actor
   * (or null if the slot is empty or the reference is dead).
   */
  #prepareEquipmentSlots(actorData) {
    const slotItem = (key) => {
      const id = actorData.system.equipment_slots?.[key]?.item_id;
      return id ? actorData.items.get(id) : null;
    };
    const equipment_slots = {};
    for (const key of [
      "armor_upper", "armor_middle", "armor_lower", "main_hand", "off_hand", "tail",
      "head", "neck", "torso", "acc_left_1", "acc_left_2", "acc_right_1", "acc_right_2", "acc_tail"
    ]) {
      equipment_slots[key] = slotItem(key);
    }
    return equipment_slots;
  }

  /**
   * Character creation mode data: points spent on bloodlines/attributes/
   * skills/mutations and the check for exceeding the creation caps.
   */
  #prepareCreationData(actorData, mutations, mutilations = []) {
    const creationData = {
      bloodlinesUsed: 0,
      attributesUsed: 0,
      skillsUsed: 0,
      mutationsUsed: 0,
      mutationsMax: 3,
      harmfulMutationsCount: 0,
      startingUsefulMutations: [],
      startingHarmfulMutations: []
    };

    if (this.document._source.system.bloodlines) {
      for (const [k, v] of Object.entries(this.document._source.system.bloodlines)) {
        creationData.bloodlinesUsed += (v.rank - 1);
      }
    }

    for (const [k, v] of Object.entries(this.document._source.system.attributes)) {
      creationData.attributesUsed += (v.rank - 1);
    }

    if (this.document._source.system.skills) {
      for (const [k, v] of Object.entries(this.document._source.system.skills)) {
        creationData.skillsUsed += v.rank;
      }
    }

    for (let m of mutations) {
      if (m.system.starting) {
        if (m.system.mutation_type === "harmful") {
          creationData.startingHarmfulMutations.push(m);
          creationData.harmfulMutationsCount++;
        } else {
          creationData.startingUsefulMutations.push(m);
          creationData.mutationsUsed += (m.system.xp_cost || 0);
        }
      }
    }

    // Congenital flaws are condition items from the mutilations pack with the
    // innate flag (3. Harmful Mutations: the catalog sets the disfiguration, the source sets the term).
    for (let c of mutilations) {
      if (c.getFlag("dedrel", "innate")) {
        creationData.startingHarmfulMutations.push(c);
        creationData.harmfulMutationsCount++;
      }
    }

    creationData.mutationsMax += Math.min(creationData.harmfulMutationsCount, 2);

    // Check for attributes over cap during creation.
    // IMPORTANT: we don't mutate the live system model (actorData.system.*), but build
    // separate objects for the render context. Otherwise the isOverCap flags end up
    // in the actor's prepared data and can "leak" elsewhere.
    let hasOverCapAttributes = false;
    let hasOverCapSkills = false;
    const creationAttributes = {};
    const creationSkills = {};
    if (actorData.flags?.dedrel?.showCreation) {
      for (const [key, attr] of Object.entries(actorData.system.attributes)) {
        const isOverCap = attr.rank > 4;
        if (isOverCap) hasOverCapAttributes = true;
        creationAttributes[key] = { rank: attr.rank, isOverCap };
      }
      for (const [key, skill] of Object.entries(actorData.system.skills)) {
        const isOverCap = skill.rank > 3;
        if (isOverCap) hasOverCapSkills = true;
        creationSkills[key] = { rank: skill.rank, isOverCap };
      }
    }
    creationData.hasOverCapAttributes = hasOverCapAttributes;
    creationData.hasOverCapSkills = hasOverCapSkills;
    creationData.attributes = creationAttributes;
    creationData.skills = creationSkills;

    return creationData;
  }

  /**
   * XP advancement prices: attributes (with bloodline discounts), skills
   * and Spell Constructor doctrines.
   */
  #prepareXpData(actorData) {
    const xpData = {
      attributes: {},
      skills: {},
      activeDiscounts: []
    };
    const xpCostsList = [2, 4, 8, 16, 32];
    const bloodlineAttrMap = {
      human: "will", demon: "rea", dragon: "log", fay: "luck", elf: "dex"
    };

    if (actorData.system.bloodlines) {
      for (const [blKey, attrKey] of Object.entries(bloodlineAttrMap)) {
        const rank = actorData.system.bloodlines[blKey]?.rank || 1;
        if (rank >= 3) {
          const discount = rank >= 5 ? 4 : 2;
          xpData.activeDiscounts.push({ attrKey, discount });
        }
      }
    }

    const getDiscount = (attrKey) => {
      let discount = 0;
      if (actorData.system.bloodlines) {
        for (const [blKey, attr] of Object.entries(bloodlineAttrMap)) {
          if (attr === attrKey && actorData.system.bloodlines[blKey]) {
            const rank = actorData.system.bloodlines[blKey].rank;
            if (rank >= 5) discount = 4;
            else if (rank >= 3) discount = 2;
          }
        }
      }
      return discount;
    };

    for (const [key, attr] of Object.entries(actorData.system.attributes)) {
      const currentRank = attr.rank;
      if (currentRank >= 6) {
        xpData.attributes[key] = { cost: "-", canUpgrade: false };
      } else {
        const baseCost = xpCostsList[currentRank - 1] || 999;
        const discount = getDiscount(key);
        let finalCost = baseCost - discount;
        if (finalCost < 1) finalCost = 1;

        xpData.attributes[key] = {
           cost: finalCost,
           canUpgrade: ((actorData.system.details.xp || 0) >= finalCost)
        };
      }
    }

    if (actorData.system.skills) {
      for (const [key, skill] of Object.entries(actorData.system.skills)) {
        const nextRank = skill.rank + 1;
        const cost = nextRank * 2;
        xpData.skills[key] = {
           cost: cost,
           canUpgrade: ((actorData.system.details.xp || 0) >= cost),
           needsSpecialization: skill.rank >= 3 && key !== "armor_use"
        };
      }
    }

    // Doctrine Upgrade (Spell Constructor): we show only doctrines unlocked
    // by talents (unlocked via AE), grouped by the groups from the config.
    // The price is computed from the DERIVED rank (source + talent effects), since access
    // talents usually grant rank 1; a purchase, however, writes +1 into source (see #onUpgradeDoctrine).
    xpData.doctrineGroups = [];
    const magicCfg = CONFIG.DEDREL?.magic;
    if (magicCfg && actorData.system.doctrines) {
      const xpAvailable = actorData.system.details.xp || 0;
      for (const [groupKey, doctrineKeys] of Object.entries(magicCfg.doctrineGroups)) {
        const groupDoctrines = [];
        for (const key of doctrineKeys) {
          const doctrine = actorData.system.doctrines[key];
          if (!doctrine || !doctrine.unlocked) continue;
          const rank = doctrine.rank || 0;
          const isMax = rank >= 6;
          const cost = isMax ? 0 : (magicCfg.rankXpCosts[rank] ?? 999);
          groupDoctrines.push({
            key,
            rank,
            isMax,
            cost,
            canUpgrade: !isMax && xpAvailable >= cost
          });
        }
        if (groupDoctrines.length > 0) {
          xpData.doctrineGroups.push({ key: groupKey, doctrines: groupDoctrines });
        }
      }
    }
    xpData.hasDoctrines = xpData.doctrineGroups.length > 0;

    return xpData;
  }

  /**
   * Learned doctrine Paths (purchased via talents) — a badge on the Spells tab.
   * The switchable "stance" is gone: the path is chosen in the Constructor build.
   */
  #prepareDoctrinePaths(actorData) {
    const doctrinePaths = [];
    const magicCfg = CONFIG.DEDREL?.magic;
    if (magicCfg && actorData.system.doctrines) {
      for (const [key, cfg] of Object.entries(magicCfg.doctrines)) {
        if (!cfg.paths) continue;
        const state = actorData.system.doctrines[key];
        if (!state?.unlocked) continue;
        const known = Object.entries(cfg.paths)
          .filter(([pk]) => state.paths?.[pk])
          .map(([pk, pcfg]) => ({ key: pk, label: game.i18n.localize(pcfg.label) }));
        if (known.length) {
          doctrinePaths.push({
            key,
            label: game.i18n.localize(`DEDREL.Magic.Doctrines.${key}`),
            paths: known
          });
        }
      }
    }
    return doctrinePaths;
  }

  /**
   * Grouping skills by category and assembling the favorites.
   * Skills are stored in the DataModel as a flat list, but split into categories in the UI.
   */
  #prepareSkillGroups(actorData) {
    const skillCategories = {
      combat: ["crossbows", "unarmed_combat", "pole_weapons", "blunt_weapons", "artillery", "firearms", "throwing", "exotic_weapons", "magical_attacks", "bows", "bladed_weapons", "armor_use"],
      intellectual: ["cultural_awareness", "knowledge", "logic_reasoning", "interpretation", "research"],
      practical: ["craftsmanship", "stealth", "thievery", "healing", "survival", "engineering", "atletism", "perception"],
      social: ["persuasion", "insight", "deception", "intimidation", "performance"]
    };

    const skillGroups = { combat: [], intellectual: [], practical: [], social: [] };
    const favoriteSkillsData = [];
    const favSkillsFlag = this.document.getFlag("dedrel", "favoriteSkills") || [];

    if (actorData.system.skills) {
      for (const [key, skillData] of Object.entries(actorData.system.skills)) {
        // Determine the skill's category for correct display in the UI
        let category = "combat";
        if (skillCategories.intellectual.includes(key)) category = "intellectual";
        else if (skillCategories.practical.includes(key)) category = "practical";
        else if (skillCategories.social.includes(key)) category = "social";

        const skillObj = { key: key, ...skillData, isFavorite: favSkillsFlag.includes(key), category: category };
        skillGroups[category].push(skillObj);

        if (skillObj.isFavorite) {
          favoriteSkillsData.push(skillObj);
        }
      }
    }

    return { skillGroups, favoriteSkillsData };
  }

  /**
   * Effects for the Statuses tab: the actor's own effects (temporary)
   * and effects from items (permanent), with an icon picked for display.
   */
  #prepareEffects(actorData) {
    const permanentEffects = [];
    const temporaryEffects = [];

    for (const e of actorData.effects) {
      const effect = e.toObject(false);
      effect.id = e.id;
      effect.parent = e.parent;
      effect.displayIcon = (effect.img && effect.img !== "icons/svg/aura.svg") ? effect.img : (effect.parent?.img || "icons/svg/aura.svg");
      temporaryEffects.push(effect);
    }

    for (const item of actorData.items) {
      if (item.effects && item.effects.size > 0) {
        for (const e of item.effects) {
          const effect = e.toObject(false);
          effect.id = e.id;
          effect.parent = e.parent;
          effect.displayIcon = (effect.img && effect.img !== "icons/svg/aura.svg") ? effect.img : (effect.parent?.img || "icons/svg/aura.svg");
          permanentEffects.push(effect);
        }
      }
    }

    return { permanentEffects, temporaryEffects };
  }

  /**
   * A copy of the attributes with the final saving throw (rank + attribute bonus + global
   * bonus). A copy — so as not to mutate the live system model.
   */
  #prepareAttributesData(actorData) {
    const attributesData = foundry.utils.deepClone(actorData.system.attributes);
    const globalSave = actorData.system.bonuses?.global_save || 0;
    for (const [key, attr] of Object.entries(attributesData)) {
      attr.final_save = attr.rank + (attr.save_bonus || 0) + globalSave;
    }
    return attributesData;
  }

  /**
   * Wallet (multi-currency): the currency list comes from the world setting,
   * the counters from the actor's system.currency.
   */
  #prepareWallet(actorData) {
    const walletCurrencies = [];
    let walletTotal = 0;
    try {
      const defs = DedrelCurrency.defs();
      const counts = actorData.system.currency || {};
      for (const def of defs) {
        const count = Number(counts[def.key]) || 0;
        walletCurrencies.push({ ...def, count });
        walletTotal += count * (Number(def.base_value) || 0);
      }
    } catch (e) {
      // The currency setting is unavailable
    }
    return { walletCurrencies, walletTotal };
  }

  /**
   * Encumbrance for the indicator bar: fill percentage up to the "heavy" threshold,
   * color and the localized category label.
   */
  #prepareEncumbrance(actorData) {
    const enc = actorData.system.resources?.encumbrance;
    if (!enc) return null;

    const heavy = enc.thresholds?.heavy || 0;
    const pct = heavy > 0 ? Math.min(100, Math.round((enc.total / heavy) * 100)) : 0;
    const colorMap = { light: "#4caf50", medium: "#e0c341", heavy: "#e08a2e", overloaded: "#c0392b" };
    return {
      ...enc,
      pct,
      color: colorMap[enc.category] || "#4caf50",
      label: game.i18n.localize(`DEDREL.Encumbrance.${enc.category}`)
    };
  }

  async _preRender(context, options) {
    await super._preRender(context, options);
    const activeTab = this.element?.querySelector(".tab.active");
    this._savedScrollTop = activeTab ? activeTab.scrollTop : 0;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const activeTab = this.element?.querySelector(".tab.active");
    if (activeTab) {
      activeTab.scrollTop = this._savedScrollTop;
    }

    const dragTargets = this.element.querySelectorAll(".item-row, .skill-item");
    for (let el of dragTargets) {
      el.setAttribute("draggable", "true");
      el.addEventListener("dragstart", this.#onDragStart.bind(this));
    }

    // Highlighting equipment slots while dragging (the drop itself is handled by _onDrop)
    for (const slot of this.element.querySelectorAll(".equip-slot")) {
      slot.addEventListener("dragover", (ev) => { ev.preventDefault(); slot.classList.add("drag-over"); });
      slot.addEventListener("dragleave", () => slot.classList.remove("drag-over"));
      slot.addEventListener("drop", () => slot.classList.remove("drag-over"));
    }
  }

  #onDragStart(event) {
    const el = event.currentTarget;
    let dragData = null;

    if (el.classList.contains("item-row")) {
      const itemId = el.dataset.itemId;
      if (itemId) {
        const item = this.document.items.get(itemId);
        if (item) {
          dragData = { type: "Item", uuid: item.uuid };
        }
      }
    } else if (el.classList.contains("skill-item")) {
      const skillId = el.dataset.skillId;
      if (skillId) {
        dragData = { type: "Skill", actorId: this.document.id, skillId: skillId };
      }
    }

    if (dragData) {
      event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    }
  }

  changeTab(tab, group, options={}) {
    return super.changeTab(tab, group, options);
  }

  _onClickTab(event) {
    return super._onClickTab(event);
  }

  _onClickAction(event, target) {
    return super._onClickAction(event, target);
  }

  static async #onEditItem(event, target) {
    const itemId = target.closest(".item-row").dataset.itemId;
    const item = this.document.items.get(itemId);
    if (item) {
      item.sheet.render(true);
    } else {
      console.warn("Dedrel | No item found with ID:", itemId);
    }
  }

  static async #onDeleteItem(event, target) {
    const itemId = target.closest(".item-row").dataset.itemId;
    const item = this.document.items.get(itemId);
    if (item) item.deleteDialog();
  }

  static async #onToggleFavorite(event, target) {
    const itemId = target.closest(".item-row").dataset.itemId;
    const item = this.document.items.get(itemId);
    if (item) {
      if (item.type === "weapon") {
        ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.EquipWeaponHint"));
      } else if (item.type === "armor") {
        ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.EquipArmorHint"));
      } else {
        const isFav = item.getFlag("dedrel", "isFavorite");
        await item.setFlag("dedrel", "isFavorite", !isFav);
      }
    }
  }

  /**
   * Check for the "Light only" property (12. Armor §Properties).
   * Such armor doesn't share the stack with anything heavier than light, and the rule
   * works in BOTH directions: a mantle can't go over chainmail, chainmail can't
   * go under a mantle already worn — otherwise the ban could be bypassed by the order of putting things on.
   *
   * @param {Item} item          the armor being put on
   * @param {string} targetSlot  the target slot ("armor_upper", etc.) — it doesn't get in its own way
   * @returns {string|null}      a ready refusal text, or null if it can be worn
   */
  #checkLightLayers(item, targetSlot) {
    const incomingLightOnly = !!item.system.properties?.light_layers_only;
    const incomingHeavier = item.system.weight_class !== "light";
    if (!incomingLightOnly && !incomingHeavier) return null;

    const slots = this.document.system.equipment_slots;
    for (const s of ["armor_upper", "armor_middle", "armor_lower"]) {
      if (s === targetSlot) continue;
      const cid = slots[s]?.item_id;
      // Universal armor may already sit in another layer — it doesn't get in its own way.
      if (!cid || cid === item.id) continue;
      const worn = this.document.items.get(cid);
      if (!worn) continue;

      if (incomingLightOnly && worn.system.weight_class !== "light") {
        return game.i18n.format("DEDREL.Notifications.LightLayersOnlyBlocked", { name: item.name, other: worn.name });
      }
      if (incomingHeavier && worn.system.properties?.light_layers_only) {
        return game.i18n.format("DEDREL.Notifications.LightLayersOnlyWorn", { name: item.name, other: worn.name });
      }
    }
    return null;
  }

  static async #onEquipArmor(event, target) {
    const itemId = target.closest(".item-row").dataset.itemId;
    const item = this.document.items.get(itemId);
    if (!item || item.type !== "armor") return;

    const slotOptions = {
      "lower": ["armor_lower"],
      "middle": ["armor_middle"],
      "upper": ["armor_upper"],
      "universal": ["armor_lower", "armor_middle"]
    };

    const allowedSlots = slotOptions[item.system.slot];
    if (!allowedSlots) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.UnknownArmorSlot"));

    const equipment_slots = this.document.system.equipment_slots;
    
    // If this is exclusive armor, everything else has to come off
    const isExclusive = item.system.properties?.exclusive_slot;
    const updates = {};
    
    // Try to find the first free slot
    let targetSlot = allowedSlots.find(s => !equipment_slots[s]?.item_id);
    if (!targetSlot) targetSlot = allowedSlots[0]; // If everything is occupied, replace the first available one

    if (isExclusive) {
      updates["system.equipment_slots.armor_upper.item_id"] = "";
      updates["system.equipment_slots.armor_middle.item_id"] = "";
      updates["system.equipment_slots.armor_lower.item_id"] = "";
      updates[`system.equipment_slots.${targetSlot}.item_id`] = item.id;
      ui.notifications.info(game.i18n.format("DEDREL.Notifications.ExclusiveArmorEquipped", {name: item.name}));
    } else {
      // Check whether exclusive armor is already worn
      let hasExclusive = false;
      for (const s of ['armor_upper', 'armor_middle', 'armor_lower']) {
        const currentId = equipment_slots[s]?.item_id;
        if (currentId) {
           const currentArmor = this.document.items.get(currentId);
           if (currentArmor && currentArmor.system.properties?.exclusive_slot) {
             hasExclusive = true;
           }
        }
      }
      
      if (hasExclusive) {
        return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.CannotEquipExclusive"));
      }

      const lightLayersError = this.#checkLightLayers(item, targetSlot);
      if (lightLayersError) return ui.notifications.warn(lightLayersError);

      updates[`system.equipment_slots.${targetSlot}.item_id`] = item.id;
    }

    await this.document.update(updates);
  }

  static async #onUnequipArmor(event, target) {
    const slot = target.dataset.slot; // e.g. "armor_upper"
    if (slot) {
      await this.document.update({ [`system.equipment_slots.${slot}.item_id`]: "" });
    }
  }

  static async #onEquipWeapon(event, target) {
    // The button lives either in an inventory row (.item-row) or in the
    // natural weapons block (data-item-id right on the Extend button).
    const itemId = target.closest(".item-row")?.dataset.itemId || target.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (!item || item.type !== "weapon") return;

    if (item.system.equipped) {
      return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.WeaponAlreadyEquipped"));
    }

    // A natural weapon (claws/bite from a mutation): "equipped" but does NOT occupy
    // a hand slot — the hands stay free. It lives in a separate sheet block, and all
    // the slot logic (grip, Block from a shield) reads the hand slots and doesn't see it.
    if (item.system.properties?.natural) {
      await item.update({ "system.equipped": true });
      return;
    }

    const equipment_slots = this.document.system.equipment_slots;
    // A slot is occupied only if its item_id resolves to an EXISTING item.
    // A dead reference (the id of a deleted weapon) is drawn as an empty slot in the UI
    // (slotItem() → null), so a check on the raw string falsely blocked
    // equipping ("needs both hands" while the hands are visibly free).
    const slotFree = (key) => {
      const id = equipment_slots[key]?.item_id;
      return !id || !this.document.items.get(id);
    };
    // Paired (is_paired) occupies both hands just like two-handed
    const isTwoHanded = item.system.is_twohanded || item.system.is_paired;
    const hasTail = this.document.items.some(i => i.type === "mutation" && i.system.key && i.system.key.includes("tail"));

    const updates = {};

    if (isTwoHanded) {
      if (slotFree("main_hand") && slotFree("off_hand")) {
         updates["system.equipment_slots.main_hand.item_id"] = item.id;
         updates["system.equipment_slots.off_hand.item_id"] = item.id;
      } else {
         return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.TwoHandsRequired"));
      }
    } else {
      if (slotFree("main_hand")) {
         updates["system.equipment_slots.main_hand.item_id"] = item.id;
      } else if (slotFree("off_hand")) {
         updates["system.equipment_slots.off_hand.item_id"] = item.id;
      } else if (hasTail && slotFree("tail")) {
         updates["system.equipment_slots.tail.item_id"] = item.id;
      } else {
         return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NoWeaponSlots"));
      }
    }

    if (Object.keys(updates).length > 0) {
      await this.document.update(updates);
      await item.update({"system.equipped": true});
    }
  }

  static async #onUnequipWeapon(event, target) {
    // A natural weapon doesn't sit in a hand slot — "retract" = clear the equipped flag
    // by item-id right from its block on the sheet (data-item-id, without data-slot).
    if (target.dataset.itemId && !target.dataset.slot) {
      const natural = this.document.items.get(target.dataset.itemId);
      if (natural) await natural.update({ "system.equipped": false });
      return;
    }

    const slot = target.dataset.slot;
    const equipment_slots = this.document.system.equipment_slots;
    const itemId = equipment_slots[slot]?.item_id;
    if (!itemId) return;

    const updates = {};
    const item = this.document.items.get(itemId);
    
    if (item && (item.system.is_twohanded || item.system.is_paired)) {
      updates["system.equipment_slots.main_hand.item_id"] = "";
      updates["system.equipment_slots.off_hand.item_id"] = "";
    } else {
      updates[`system.equipment_slots.${slot}.item_id`] = "";
    }

    await this.document.update(updates);
    if (item) {
      await item.update({"system.equipped": false});
    }
  }

  /**
   * Deposits coins into the actor's wallet: adds value to the counter of the currency
   * with key denomination. Returns true if the currency is known to the world.
   */
  static async depositToWallet(actor, denomination, value) {
    const v = Number(value);
    if (!denomination || !(v > 0)) return false; // only a positive deposit
    let defs = [];
    try { defs = DedrelCurrency.defs(); } catch (e) {}
    if (!defs.some(d => d.key === denomination)) return false;
    const current = Number(actor.system.currency?.[denomination]) || 0;
    await actor.update({ [`system.currency.${denomination}`]: current + v });
    return true;
  }

  /** Deposits a "loose" coin item into the wallet and deletes the item. */
  static async #onDepositCurrency(event, target) {
    const itemId = target.closest(".item-row")?.dataset.itemId;
    const item = itemId ? this.document.items.get(itemId) : null;
    if (!item || item.type !== "currency") return;
    const ok = await DedrelCharacterSheet.depositToWallet(this.document, item.system.denomination, item.system.value);
    if (!ok) {
      return ui.notifications.warn(game.i18n.format("DEDREL.Notifications.UnknownDenomination", { key: item.system.denomination }));
    }
    const value = item.system.value;
    const denom = item.system.denomination;
    await item.delete();
    ui.notifications.info(game.i18n.format("DEDREL.Notifications.CurrencyDeposited", { value, denom }));
  }

  /**
   * "Collapse": redistributes the whole wallet across denominations from the top down
   * (greedy algorithm by base_value), minimizing the number of coins. The total value doesn't
   * change if a base currency exists (base_value = 1); otherwise a remainder is possible,
   * which stays in the smallest denomination.
   */
  static async #onCollapseCurrency(event, target) {
    let defs = [];
    try { defs = DedrelCurrency.defs(); } catch (e) {}
    const valued = defs.filter(d => Number(d.base_value) > 0).sort((a, b) => b.base_value - a.base_value);
    if (!valued.length) return;

    const counts = this.document.system.currency || {};
    let remainder = 0;
    for (const d of valued) remainder += (Number(counts[d.key]) || 0) * Number(d.base_value);
    remainder = Math.round(remainder);

    const update = {};
    valued.forEach((d, idx) => {
      const bv = Number(d.base_value);
      if (idx === valued.length - 1) {
        // The smallest denomination takes the whole remainder (preserving value)
        update[`system.currency.${d.key}`] = Math.round(remainder / bv);
      } else {
        const n = Math.floor(remainder / bv);
        update[`system.currency.${d.key}`] = n;
        remainder -= n * bv;
      }
    });
    await this.document.update(update);
    ui.notifications.info(game.i18n.localize("DEDREL.Notifications.CurrencyCollapsed"));
  }

  /**
   * Transferring money to another actor. Opens a dialog for choosing the recipient and the amounts
   * per currency; execution goes through DedrelSocket (directly if permissions suffice,
   * otherwise through the active GM). Lets players pay without owning
   * the recipient's wallet.
   */
  static async #onPayCurrency(event, target) {
    const actor = this.document;
    let defs = [];
    try { defs = DedrelCurrency.defs(); } catch (e) {}
    if (!defs.length) return ui.notifications.warn(game.i18n.localize("DEDREL.ActorSheet.NoCurrenciesConfigured"));

    // Recipients: other actors with a wallet that are allowed to receive money
    // (the can_receive_currency flag) — so the list doesn't get clogged with chests/loot.
    const targets = game.actors.filter(a =>
      a.id !== actor.id && a.system?.currency !== undefined && a.system?.can_receive_currency);
    if (!targets.length) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NoTransferTargets"));

    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
    const targetOptions = targets.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join("");
    const currencyRows = defs.map(d => {
      const have = Number(actor.system.currency?.[d.key]) || 0;
      return `<div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
          <label style="flex:1;">${esc(d.name)} (${esc(d.abbr)}) — ${game.i18n.localize("DEDREL.ActorSheet.WalletHave")}: ${have}</label>
          <input type="number" class="pay-amount" data-key="${esc(d.key)}" min="0" step="1" value="0" style="width:80px;"/>
        </div>`;
    }).join("");

    const content = `
      <div class="form-group" style="margin-bottom:8px;">
        <label style="font-weight:bold;">${game.i18n.localize("DEDREL.ActorSheet.TransferTo")}</label>
        <select id="pay-target" style="width:100%;">${targetOptions}</select>
      </div>
      <div>${currencyRows}</div>`;

    const { DialogV2 } = foundry.applications.api;
    await DialogV2.wait({
      window: { title: game.i18n.localize("DEDREL.ActorSheet.TransferMoney") },
      content,
      buttons: [
        {
          action: "pay",
          icon: "fa-solid fa-hand-holding-dollar",
          label: game.i18n.localize("DEDREL.ActorSheet.TransferSend"),
          default: true,
          callback: async (event, button, dialog) => {
            const targetId = dialog.element.querySelector("#pay-target")?.value;
            const targetActor = game.actors.get(targetId);
            if (!targetActor) return;
            const changes = {};
            for (const inp of dialog.element.querySelectorAll(".pay-amount")) {
              const amt = parseInt(inp.value) || 0;
              if (amt > 0) changes[inp.dataset.key] = amt;
            }
            if (!Object.keys(changes).length) return;
            await DedrelSocket.transferCurrency(actor, targetActor, changes);
          }
        },
        { action: "cancel", icon: "fa-solid fa-times", label: game.i18n.localize("DEDREL.Chat.Cancel") }
      ]
    });
  }

  /** Opens the sheet of the linked container actor (bag/chest). */
  static async #onOpenContainer(event, target) {
    const uuid = target.closest("[data-container-uuid]")?.dataset.containerUuid;
    const actor = uuid ? await fromUuid(uuid) : null;
    if (actor) actor.sheet.render(true);
    else ui.notifications.warn(game.i18n.localize("DEDREL.Container.NotFound"));
  }

  /** Creates a new container actor and a reference item to it on this character. */
  static async #onCreateContainer(event, target) {
    if (!Actor.canUserCreate(game.user)) {
      return ui.notifications.warn(game.i18n.localize("DEDREL.Container.CannotCreate"));
    }
    const containerActor = await Actor.create({
      name: game.i18n.localize("DEDREL.Container.NewName"),
      type: "loot",
      system: { mode: "container" }
    });
    if (containerActor) await this._linkContainer(containerActor);
  }

  /** Unlinks a container: deletes only the reference item, the container actor remains. */
  static async #onUnlinkContainer(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = itemId ? this.document.items.get(itemId) : null;
    if (!item) return;
    const { DialogV2 } = foundry.applications.api;
    const confirm = await DialogV2.confirm({
      window: { title: game.i18n.localize("DEDREL.Container.Unlink") },
      content: `<p>${game.i18n.localize("DEDREL.Container.UnlinkConfirm")}</p>`
    });
    if (confirm) await item.delete();
  }

  /** Creates a reference item (type loot) to a container actor on the character. */
  async _linkContainer(containerActor) {
    const itemData = {
      name: containerActor.name,
      type: "loot",
      img: containerActor.img,
      system: { weight: 0, base_price: 0, stackable: false },
      flags: { dedrel: { linkedActorUuid: containerActor.uuid } }
    };
    await this.document.createEmbeddedDocuments("Item", [itemData]);
    ui.notifications.info(game.i18n.format("DEDREL.Container.Linked", { name: containerActor.name }));
  }

  /** Equips an item into a SPECIFIC slot (drag-n-drop onto an equipment slot). */
  async #equipToSlot(item, slotKey, kind, accept) {
    if (kind === "accessory") return this.#equipAccessoryToSlot(item, slotKey, accept);
    if (kind === "weapon" && item.type === "weapon") return this.#equipWeaponToSlot(item, slotKey);
    if (kind === "armor" && item.type === "armor") return this.#equipArmorToSlot(item, slotKey);
    return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.WrongSlotKind"));
  }

  /** Equips an accessory (by matching system.equip_slot against the slot type). */
  async #equipAccessoryToSlot(item, slotKey, accept) {
    const es = item.system.equip_slot;
    if (!es || es !== accept) {
      return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.WrongSlotKind"));
    }
    // The tail slot requires the corresponding mutation
    if (slotKey === "acc_tail") {
      const hasTail = this.document.items.some(i => i.type === "mutation" && i.system.key && i.system.key.includes("tail"));
      if (!hasTail) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.TailSlotLocked"));
    }
    const ACC = ["head", "neck", "torso", "acc_left_1", "acc_left_2", "acc_right_1", "acc_right_2", "acc_tail"];
    const slots = this.document.system.equipment_slots;
    const updates = {};
    // Remove the item from other accessory slots if it is already there
    for (const s of ACC) {
      if (s !== slotKey && slots[s]?.item_id === item.id) updates[`system.equipment_slots.${s}.item_id`] = "";
    }
    updates[`system.equipment_slots.${slotKey}.item_id`] = item.id;
    await this.document.update(updates);
  }

  async #equipWeaponToSlot(item, slotKey) {
    // A natural weapon doesn't occupy a hand even when dragged onto a slot —
    // we just mark it equipped (it will appear in its own block).
    if (item.system.properties?.natural) {
      return item.update({ "system.equipped": true });
    }
    const slots = this.document.system.equipment_slots;
    const hasTail = this.document.items.some(i => i.type === "mutation" && i.system.key && i.system.key.includes("tail"));
    if (slotKey === "tail" && !hasTail) {
      return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.TailSlotLocked"));
    }

    const updates = {};
    // Free the slots where this item already sits
    for (const s of ["main_hand", "off_hand", "tail"]) {
      if (slots[s]?.item_id === item.id) updates[`system.equipment_slots.${s}.item_id`] = "";
    }

    if (item.system.is_twohanded || item.system.is_paired) {
      // Two-handed/paired occupies both hands — remove the current main/off occupants
      for (const s of ["main_hand", "off_hand"]) {
        const cid = slots[s]?.item_id;
        if (cid && cid !== item.id) {
          const cur = this.document.items.get(cid);
          if (cur) await cur.update({ "system.equipped": false });
        }
      }
      updates["system.equipment_slots.main_hand.item_id"] = item.id;
      updates["system.equipment_slots.off_hand.item_id"] = item.id;
    } else {
      // Remove whatever was in the target slot (if 2H/paired — free both)
      const cid = slots[slotKey]?.item_id;
      if (cid && cid !== item.id) {
        const cur = this.document.items.get(cid);
        if (cur?.system.is_twohanded || cur?.system.is_paired) {
          updates["system.equipment_slots.main_hand.item_id"] = "";
          updates["system.equipment_slots.off_hand.item_id"] = "";
        }
        if (cur) await cur.update({ "system.equipped": false });
      }
      updates[`system.equipment_slots.${slotKey}.item_id`] = item.id;
    }

    await this.document.update(updates);
    await item.update({ "system.equipped": true });
  }

  async #equipArmorToSlot(item, slotKey) {
    // Accessory armor (a helmet, etc.) doesn't go into the body layers — only into its accessory slot
    if (item.system.equip_slot) {
      return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.WrongArmorSlot"));
    }
    const allowedMap = {
      lower: ["armor_lower"],
      middle: ["armor_middle"],
      upper: ["armor_upper"],
      // Universal = Lower OR Middle (12. Armor §Universal armor);
      // the upper slot isn't included — cf. slotOptions in #onEquipArmor.
      universal: ["armor_lower", "armor_middle"]
    };
    const allowed = allowedMap[item.system.slot] || [];
    if (!allowed.includes(slotKey)) {
      return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.WrongArmorSlot"));
    }

    const slots = this.document.system.equipment_slots;
    const isExclusive = item.system.properties?.exclusive_slot;
    const updates = {};

    if (isExclusive) {
      updates["system.equipment_slots.armor_upper.item_id"] = "";
      updates["system.equipment_slots.armor_middle.item_id"] = "";
      updates["system.equipment_slots.armor_lower.item_id"] = "";
      updates[`system.equipment_slots.${slotKey}.item_id`] = item.id;
    } else {
      // Can't be worn over exclusive armor
      for (const s of ["armor_upper", "armor_middle", "armor_lower"]) {
        const cid = slots[s]?.item_id;
        if (cid) {
          const cur = this.document.items.get(cid);
          if (cur?.system.properties?.exclusive_slot) {
            return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.CannotEquipExclusive"));
          }
        }
      }
      const lightLayersError = this.#checkLightLayers(item, slotKey);
      if (lightLayersError) return ui.notifications.warn(lightLayersError);

      // Remove the item from other slots if it is already worn
      for (const s of ["armor_upper", "armor_middle", "armor_lower"]) {
        if (s !== slotKey && slots[s]?.item_id === item.id) updates[`system.equipment_slots.${s}.item_id`] = "";
      }
      updates[`system.equipment_slots.${slotKey}.item_id`] = item.id;
    }

    await this.document.update(updates);
  }

  /** Removes an item from an arbitrary equipment slot (accessories). */
  static async #onUnequipSlot(event, target) {
    const slot = target.dataset.slot;
    if (slot) await this.document.update({ [`system.equipment_slots.${slot}.item_id`]: "" });
  }

  static async #onToggleSkillFavorite(event, target) {
    event.preventDefault();
    const skillItem = target.closest(".skill-item");
    if (!skillItem) return;
    const skillId = skillItem.dataset.skillId;
    if (!skillId) return;

    let favSkills = this.document.getFlag("dedrel", "favoriteSkills") || [];
    if (favSkills.includes(skillId)) {
      favSkills = favSkills.filter(s => s !== skillId);
    } else {
      favSkills = [...favSkills, skillId];
    }
    await this.document.setFlag("dedrel", "favoriteSkills", favSkills);
  }

  static async #onCreateItem(event, target) {
    const type = target.dataset.type;
    const itemData = {
      // Localized type name from TYPES.Item.<type> (the same keys as in the creation dialog)
      name: game.i18n.format("DEDREL.Notifications.NewItemName", {
        type: game.i18n.localize(`TYPES.Item.${type}`)
      }),
      type: type
    };
    return this.document.createEmbeddedDocuments("Item", [itemData]);
  }

  static #onChangeTab(event, target) {
    const tab = target.dataset.tab;
    const group = target.dataset.group || "primary";
    this.changeTab(tab, group, { event });
  }

  static async #onRollCheck(event, target) {
    const actor = this.document;
    const label = target.dataset.label;
    const rank = parseInt(target.dataset.rank) || 0;
    const isSave = target.dataset.isSave === "true";
    const saveAttr = target.dataset.attr;
    const skillId = target.dataset.skill;
    
    await showRollDialog({
      actor: actor,
      title: label,
      baseRank: rank,
      isSave: isSave,
      saveAttr: saveAttr,
      skillId: skillId
    });
  }

  static async #onUseItem(event, target) {
    const itemId = target.closest(".item-row").dataset.itemId;
    const item = this.document.items.get(itemId);
    if (item && typeof item.use === "function") {
      await item.use();
    } else if (item) {
      ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ItemCannotBeUsed"));
    }
  }

  static async #onEditImage(event, target) {
    const attr = target.dataset.edit || "img";
    const current = foundry.utils.getProperty(this.document, attr);
    const fp = new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current: current,
      callback: path => {
        target.src = path;
        this.document.update({ [attr]: path });
      },
      top: this.position.top + 40,
      left: this.position.left + 10
    });
    return fp.browse();
  }

  static async #onShortRest(event, target) {
    const { DialogV2 } = foundry.applications.api;
    const confirm = await DialogV2.confirm({
      window: { title: game.i18n.localize("DEDREL.ActorSheet.ShortRest") },
      content: `<p>${game.i18n.localize("DEDREL.Chat.ShortRestConfirm")}</p>`
    });
    if (!confirm) return;
    await DedrelCharacterSheet.performRest(this.document, "short");
  }

  static async #onLongRest(event, target) {
    const { DialogV2 } = foundry.applications.api;
    const confirm = await DialogV2.confirm({
      window: { title: game.i18n.localize("DEDREL.ActorSheet.LongRest") },
      content: `<p>${game.i18n.localize("DEDREL.Chat.LongRestConfirm")}</p>`
    });
    if (!confirm) return;
    await DedrelCharacterSheet.performRest(this.document, "long");
  }

  static async #onSpendLuck(event, target) {
    const actor = this.document;
    const currentLuck = actor.system.resources.luck_points.value;
    
    if (currentLuck <= 0) {
      return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NoLuckPoints"));
    }

    const { DialogV2 } = foundry.applications.api;
    const confirm = await DialogV2.confirm({
      window: { title: game.i18n.localize("DEDREL.Chat.SpendLuckTitle") },
      content: game.i18n.localize("DEDREL.Chat.SpendLuckContent")
    });

    if (confirm) {
      await actor.update({ "system.resources.luck_points.value": currentLuck - 1 });
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        content: `<div class="dedrel-item-chat"><h3 style="border-bottom: 1px solid var(--color-border-dark); padding-bottom: 3px; margin-bottom: 8px;"><i class="fas fa-clover" style="color: green;"></i> ${game.i18n.localize("DEDREL.Chat.LuckChatTitle")}</h3><p>${game.i18n.format("DEDREL.Chat.LuckChatFlavor", {name: actor.name})}</p><p>${game.i18n.localize("DEDREL.Chat.LuckChatDesc")}</p></div>`
      });
    }
  }

  static async #onResetLuck(event, target) {
    const actor = this.document;
    const maxLuck = actor.system.resources.luck_points.max;
    await actor.update({ "system.resources.luck_points.value": maxLuck });
    ui.notifications.info(game.i18n.localize("DEDREL.Notifications.LuckPointsRestored"));
  }


  static async performRest(actor, restType, { advanceTime = true, notify = true } = {}) {
    // advanceTime: false — time has already been advanced outside (a group rest from TimeHUD),
    // otherwise each actor of the group would advance world time again.
    if (advanceTime) {
      if (game.user.isGM) {
        await game.time.advance(restType === "long" ? 28800 : 3600);
      } else {
        ui.notifications.info(game.i18n.localize("DEDREL.Notifications.GMRestoreTimeOnly"));
      }
    }
    
    const updateData = {};
    const res = actor.system.resources;
    // By the rules a rest doesn't restore AP (they reset every round anyway).
    // The reset is kept deliberately — for testing maneuvers outside combat: it's important to see
    // how much AP things cost, to check combo chains, etc.
    if (res.ap_universal) updateData["system.resources.ap_universal.value"] = res.ap_universal.max;
    if (res.ap_magic) updateData["system.resources.ap_magic.value"] = res.ap_magic.max;
    if (res.ap_maneuver) updateData["system.resources.ap_maneuver.value"] = res.ap_maneuver.max;
    // Temporary HP burns off on any rest (rules: "9. Combat and Damage" §4)
    if (res.hp?.temp) updateData["system.resources.hp.temp"] = 0;
    
    await actor.update(updateData);
    
    const itemUpdates = [];
    for (const item of actor.items) {
      if (!item.system.uses_max || !item.system.uses_per) continue;
      
      let shouldRestore = false;
      if (restType === "short" && item.system.uses_per === "short_rest") shouldRestore = true;
      if (restType === "long" && ["short_rest", "long_rest", "day"].includes(item.system.uses_per)) shouldRestore = true;
      
      if (shouldRestore) {
        let maxVal = 0;
        if (!isNaN(item.system.uses_max)) {
           maxVal = parseInt(item.system.uses_max);
        } else {
           try {
             const r = new Roll(item.system.uses_max, actor.getRollData());
             await r.evaluate();
             maxVal = r.total;
           } catch(e) {
             console.error("Dedrel | Error parsing uses_max", e);
           }
        }
        itemUpdates.push({ _id: item.id, "system.uses_value": maxVal });
      }
    }
    
    if (itemUpdates.length > 0) {
      await actor.updateEmbeddedDocuments("Item", itemUpdates);
    }
    
    if (notify) ui.notifications.info(game.i18n.format("DEDREL.Notifications.RestPerformed", {name: actor.name, restType: restType === "long" ? game.i18n.localize("DEDREL.Notifications.RestLong") : game.i18n.localize("DEDREL.Notifications.RestShort")}));
  }

  static async #onToggleCreationLock(event, target) {
    const currentlyLocked = !!this.document.getFlag("dedrel", "creationLocked");
    await this.document.setFlag("dedrel", "creationLocked", !currentlyLocked);
  }

  static async #onToggleItemsLock(event, target) {
    const currentlyLocked = this.document.getFlag("dedrel", "itemsLocked") ?? true;
    await this.document.setFlag("dedrel", "itemsLocked", !currentlyLocked);
  }

  static async #onToggleCreationView(event, target) {
    const currentlyShowing = !!this.document.getFlag("dedrel", "showCreation");
    await this.document.setFlag("dedrel", "showCreation", !currentlyShowing);
  }

  static async #onIncreaseBloodline(event, target) {
    if (this.document.getFlag("dedrel", "creationLocked")) return;
    const key = target.dataset.key;
    const current = this.document._source.system.bloodlines[key].rank;
    if (current < 6) { // check total?
      let total = 0;
      for (const [k, v] of Object.entries(this.document._source.system.bloodlines)) total += (v.rank - 1);
      if (total < 10) {
        await this.document.update({ [`system.bloodlines.${key}.rank`]: current + 1 });
      } else {
        ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.BloodlinePointsLimit"));
      }
    }
  }

  static async #onDecreaseBloodline(event, target) {
    if (this.document.getFlag("dedrel", "creationLocked")) return;
    const key = target.dataset.key;
    const current = this.document._source.system.bloodlines[key].rank;
    if (current > 1) {
      await this.document.update({ [`system.bloodlines.${key}.rank`]: current - 1 });
    }
  }

  static async #onIncreaseAttribute(event, target) {
    if (this.document.getFlag("dedrel", "creationLocked")) return;
    const key = target.dataset.key;
    const current = this.document._source.system.attributes[key].rank;
    if (current < 4) { // Max starting rank
      let total = 0;
      for (const [k, v] of Object.entries(this.document._source.system.attributes)) total += (v.rank - 1);
      if (total < 10) {
        await this.document.update({ [`system.attributes.${key}.rank`]: current + 1 });
      } else {
        ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.StartingAttributesLimit"));
      }
    } else {
      ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.MaxStartingAttribute"));
    }
  }

  static async #onDecreaseAttribute(event, target) {
    if (this.document.getFlag("dedrel", "creationLocked")) return;
    const key = target.dataset.key;
    const current = this.document._source.system.attributes[key].rank;
    if (current > 1) {
      await this.document.update({ [`system.attributes.${key}.rank`]: current - 1 });
    }
  }

  static async #onIncreaseSkill(event, target) {
    if (this.document.getFlag("dedrel", "creationLocked")) return;
    const key = target.dataset.key;
    const current = this.document._source.system.skills[key].rank;
    if (current < 3) { // Max starting rank
      let total = 0;
      for (const [k, v] of Object.entries(this.document._source.system.skills)) total += v.rank;
      if (total < 15) {
        await this.document.update({ [`system.skills.${key}.rank`]: current + 1 });
      } else {
        ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.StartingSkillsLimit"));
      }
    } else {
      ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.MaxStartingSkill"));
    }
  }

  static async #onDecreaseSkill(event, target) {
    if (this.document.getFlag("dedrel", "creationLocked")) return;
    const key = target.dataset.key;
    const current = this.document._source.system.skills[key].rank;
    if (current > 0) {
      await this.document.update({ [`system.skills.${key}.rank`]: current - 1 });
    }
  }

  static async #onUpgradeAttribute(event, target) {
    const key = target.dataset.key;
    const cost = parseInt(target.dataset.cost);
    const currentXp = this.document.system.details.xp || 0;
    const currentRank = this.document.system.attributes[key].rank;

    if (currentXp >= cost && currentRank < 6) {
      await this.document.update({
        [`system.attributes.${key}.rank`]: currentRank + 1,
        "system.details.xp": currentXp - cost
      });
      ui.notifications.info(game.i18n.format("DEDREL.Notifications.AttributeUpgraded", {cost: cost}));
    } else {
      ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NotEnoughXPOrMaxRank"));
    }
  }

  static async #onUpgradeSkill(event, target) {
    const key = target.dataset.key;
    const current = this.document.system.skills[key].rank;
    const nextRank = current + 1;
    const cost = nextRank * 2;
    const currentXp = this.document.system.details.xp || 0;

    if (currentXp >= cost) {
      await this.document.update({
        [`system.skills.${key}.rank`]: nextRank,
        "system.details.xp": currentXp - cost
      });
      ui.notifications.info(game.i18n.format("DEDREL.Notifications.SkillUpgraded", {key: key, nextRank: nextRank, cost: cost}));
    } else {
      ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NotEnoughXPForSkill"));
    }
  }

  static async #onOpenSpellConstructor(event, target) {
    game.dedrel.openSpellConstructor(this.document);
  }


  /** Clears the ephemeral flag — the temporary spell becomes permanent. */
  static async #onPinSpell(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = itemId ? this.document.items.get(itemId) : null;
    if (item) {
      await item.unsetFlag("dedrel", "ephemeral");
      ui.notifications.info(game.i18n.format("DEDREL.Notifications.SpellPinned", { name: item.name }));
    }
  }

  static async #onUpgradeDoctrine(event, target) {
    const key = target.dataset.key;
    const doctrine = this.document.system.doctrines?.[key];
    const magicCfg = CONFIG.DEDREL?.magic;
    if (!doctrine || !magicCfg) return;

    if (!doctrine.unlocked) {
      return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.DoctrineLocked"));
    }

    // The derived rank (source + granted by a talent) determines the step price,
    // but +1 is written into SOURCE: otherwise we would bake the effect's bonus into the base again.
    const derivedRank = doctrine.rank || 0;
    if (derivedRank >= 6) {
      return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NotEnoughXPOrMaxRank"));
    }

    const cost = magicCfg.rankXpCosts[derivedRank] ?? 999;
    const currentXp = this.document.system.details.xp || 0;
    if (currentXp < cost) {
      return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NotEnoughXPOrMaxRank"));
    }

    const sourceRank = this.document._source.system.doctrines[key].rank || 0;
    await this.document.update({
      [`system.doctrines.${key}.rank`]: sourceRank + 1,
      "system.details.xp": currentXp - cost
    });
    ui.notifications.info(game.i18n.format("DEDREL.Notifications.DoctrineUpgraded", {
      name: game.i18n.localize(`DEDREL.Magic.Doctrines.${key}`),
      rank: derivedRank + 1,
      cost: cost
    }));
  }

  static async #onToggleEffect(event, target) {
    const effectId = target.closest(".effect-row").dataset.effectId;
    const parentId = target.closest(".effect-row").dataset.parentId;
    let effect;
    if (parentId && this.document.items.has(parentId)) {
      effect = this.document.items.get(parentId).effects.get(effectId);
    } else {
      effect = this.document.effects.get(effectId);
    }
    if (effect) {
      return effect.update({ disabled: !effect.disabled });
    }
  }

  static async #onEditEffect(event, target) {
    const effectId = target.closest(".effect-row").dataset.effectId;
    const parentId = target.closest(".effect-row").dataset.parentId;
    let effect;
    if (parentId && this.document.items.has(parentId)) {
      effect = this.document.items.get(parentId).effects.get(effectId);
    } else {
      effect = this.document.effects.get(effectId);
    }
    if (effect) {
      return effect.sheet.render(true);
    }
  }

  static async #onDeleteEffect(event, target) {
    const effectId = target.closest(".effect-row").dataset.effectId;
    const parentId = target.closest(".effect-row").dataset.parentId;
    let effect;
    if (parentId && this.document.items.has(parentId)) {
      effect = this.document.items.get(parentId).effects.get(effectId);
    } else {
      effect = this.document.effects.get(effectId);
    }
    
    if (effect && effect.parent.documentName === "Actor") {
      return effect.delete();
    } else if (effect) {
      ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.CannotDeleteItemEffect"));
    }
  }

  /**
   * Handler for creating a document after it is dropped onto the sheet.
   * Used for special item logic (e.g. EXP).
   */
  async _onDropItemCreate(itemData) {
    // If the player drops an "Experience" item onto the sheet, we don't create an item
    // but simply award the XP to the character.
    if (itemData.type === "exp") {
      const expValue = itemData.system.value || 0;
      const currentExp = this.document.system.details.xp || 0;
      // We also need a total exp tracker if it's not in schema, but schema details has only 'xp' 
      // Let's assume we update both if we add 'total_xp' later, or just update 'xp'.
      const totalExp = this.document.getFlag("dedrel", "total_xp") || 0;
      
      await this.document.update({
        "system.details.xp": currentExp + expValue
      });
      await this.document.setFlag("dedrel", "total_xp", totalExp + expValue);
      
      ui.notifications.info(game.i18n.format("DEDREL.Notifications.XPGained", {value: expValue}));
      // Do not create the item
      return [];
    }

    // For mutations in creation block
    if (itemData.type === "mutation") {
      // Check if dropped into starting zones
      // Since _onDropItemCreate doesn't have event easily accessible in V2 without overriding _onDrop
      // We can just add it and let the player flag it, but wait, the plan is to drag & drop.
      // In V2, we override _onDrop to know the target.
    }
    
    return super._onDropItemCreate(itemData);
  }

  /** XP spent on the last purchase — carried over into the mutation creation block. */
  #pendingXpPaid = 0;

  /**
   * How many congenital flaws are already taken: both legacy mutations
   * (mutation_type harmful) and disfiguration conditions with the innate flag.
   */
  #countHarmfulStarting() {
    let count = 0;
    for (const i of this.document.items) {
      if (i.type === "mutation" && i.system.starting && i.system.mutation_type === "harmful") count++;
      else if (i.type === "condition" && i.getFlag("dedrel", "innate")) count++;
    }
    return count;
  }

  /**
   * Custom Drag & Drop handling (V2).
   * Lets us track exactly which zone the item was dropped into 
   * (e.g. starting mutations during character creation).
   */
  async _onDrop(event) {
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch(err) {
      return super._onDrop(event);
    }
    // Dropping a container actor (type loot) → create a reference item in the inventory.
    if (data.type === "Actor") {
      const droppedActor = await Actor.implementation.fromDropData(data);
      if (droppedActor && droppedActor.type === "loot") {
        await this._linkContainer(droppedActor);
        return false;
      }
      return super._onDrop(event);
    }

    if (data.type !== "Item") return super._onDrop(event);

    const item = await Item.implementation.fromDropData(data);
    if (!item) return super._onDrop(event);

    // Equipping by dragging: dropping a weapon/armor onto a specific slot.
    // Works for items already owned by this actor; external items
    // first land in the inventory (standard behavior), then they can be equipped.
    const slotEl = event.target?.closest?.(".equip-slot");
    if (slotEl) {
      const ownItem = this.document.items.get(item.id);
      if (ownItem) {
        await this.#equipToSlot(ownItem, slotEl.dataset.equipSlot, slotEl.dataset.slotKind, slotEl.dataset.accept);
        return false;
      }
    }

    if (item.type === "exp") {
      return this._onDropItemCreate(item.toObject());
    }

    // Coins dropped onto the sheet: deposit them into the wallet if the currency is known to the world.
    // Otherwise (an unknown denomination) — fall back to regular item creation.
    if (item.type === "currency") {
      const ok = await DedrelCharacterSheet.depositToWallet(this.document, item.system.denomination, item.system.value);
      if (ok) {
        ui.notifications.info(game.i18n.format("DEDREL.Notifications.CurrencyDeposited", {
          value: item.system.value, denom: item.system.denomination
        }));
        return false;
      }
    }

    // Prerequisite check when adding a talent/mutation/maneuver from outside.
    // Maneuvers are gated too: there are basic maneuvers with skill rank requirements
    // (Braced Shot, Finishing Blow). Unmet requirements don't block
    // hard: the GM confirms through a dialog.
    if (["talent", "mutation", "maneuver"].includes(item.type) && !this.document.items.get(item.id)) {
      // Purchase with XP (10. Progression): a talent and a mutation cost their xp_cost.
      // These don't spend XP: starting mutations (paid with creation points in the zone below),
      // maneuvers (they come with talents) and any NPC abilities — the npc type has no
      // details.xp, the GM fills its sheet by hand.
      const inCreationZone = !!event.target?.closest?.(".drop-zone");
      const costsXp = this.document.type === "character"
        && (item.type === "talent" || (item.type === "mutation" && !inCreationZone));
      const xpCost = costsXp ? (item.system.xp_cost || 0) : 0;
      const currentXp = this.document.system.details.xp || 0;
      if (xpCost > currentXp) {
        ui.notifications.warn(game.i18n.format("DEDREL.Notifications.NotEnoughXPForItem", {
          name: item.name, cost: xpCost, xp: currentXp
        }));
        return false;
      }

      const proceed = await confirmPrerequisites(this.document, item);
      if (!proceed) return false;
      if (xpCost > 0) {
        await this.document.update({ "system.details.xp": currentXp - xpCost });
        ui.notifications.info(game.i18n.format("DEDREL.Notifications.ItemBought", {
          name: item.name, cost: xpCost
        }));
      }
      // IMPORTANT: confirmPrerequisites does an await (dialog). event.dataTransfer lives
      // only during synchronous drop handling — after the await it goes stale, and
      // super._onDrop (which reads it again) silently creates nothing.
      // So a talent/maneuver is created directly from the already resolved item.
      // A mutation goes further — it has its own starting zone logic below.
      if (item.type !== "mutation") {
        const bought = item.toObject();
        // How much XP was actually spent — remember it on the item: on deletion
        // the actor will refund exactly this amount (DedrelActor#refundXpForDeletedItems).
        if (xpCost > 0) foundry.utils.setProperty(bought, "flags.dedrel.xpPaid", xpCost);
        return this.document.createEmbeddedDocuments("Item", [bought]);
      }
      if (xpCost > 0) this.#pendingXpPaid = xpCost;
    }

    // Congenital flaw: a disfiguration from the mutilations pack dropped into the
    // harmful mutations zone. The disfiguration catalog is shared with biomancy mutilations, so
    // the entity isn't duplicated — the source sets the term (3. Harmful Mutations):
    // from the creation zone the condition is applied as permanent and with the innate flag.
    if (item.type === "condition") {
      const zone = event.target.closest(".drop-zone");
      if (zone?.dataset.dropType === "mutation-harmful") {
        if (this.document.getFlag("dedrel", "creationLocked")) {
          ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.CharacterCreationLocked"));
          return false;
        }
        if (this.#countHarmfulStarting() >= 2) {
          ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.MaxStartingHarmfulMutations"));
          return false;
        }
        const itemObj = item.toObject();
        itemObj.system.duration = { units: "permanent", value: 0 };
        itemObj.system.expiry_events = [];
        foundry.utils.setProperty(itemObj, "flags.dedrel.innate", true);
        return this.document.createEmbeddedDocuments("Item", [itemObj]);
      }
    }

    if (item.type === "mutation") {
      const targetElement = event.target.closest(".drop-zone");
      if (targetElement) {
        if (this.document.getFlag("dedrel", "creationLocked")) {
          ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.CharacterCreationLocked"));
          return false;
        }

        const dropType = targetElement.dataset.dropType;
        const itemObj = item.toObject();
        itemObj.system.starting = true;
        
        if (dropType === "mutation-useful") {
           itemObj.system.mutation_type = "useful";
           // Re-calculate points
           let totalUsed = 0;
           for (let m of this.document.items) {
             if (m.type === "mutation" && m.system.starting && m.system.mutation_type !== "harmful") {
                totalUsed += (m.system.xp_cost || 0);
             }
           }
           const maxPoints = 3 + Math.min(this.#countHarmfulStarting(), 2);
           if (totalUsed + (itemObj.system.xp_cost || 0) > maxPoints) {
             ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NotEnoughPointsForMutation"));
             return false;
           }
        } else if (dropType === "mutation-harmful") {
           itemObj.system.mutation_type = "harmful";
           if (this.#countHarmfulStarting() >= 2) {
             ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.MaxStartingHarmfulMutations"));
             return false;
           }
        }
        
        return this.document.createEmbeddedDocuments("Item", [itemObj]);
      }
      // An external mutation outside the starting zone (acquired after creation): created
      // directly — super._onDrop would rely on the dataTransfer gone stale after the await.
      // A mutation already owned by the actor (re-sorting, there was no await) is handed to
      // the standard super._onDrop below, so as not to create a duplicate.
      if (!this.document.items.get(item.id)) {
        const bought = item.toObject();
        if (this.#pendingXpPaid > 0) {
          foundry.utils.setProperty(bought, "flags.dedrel.xpPaid", this.#pendingXpPaid);
          this.#pendingXpPaid = 0;
        }
        return this.document.createEmbeddedDocuments("Item", [bought]);
      }
      this.#pendingXpPaid = 0;
    }

    return super._onDrop(event);
  }
}
