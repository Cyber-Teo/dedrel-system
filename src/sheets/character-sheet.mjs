import { ItemDataModels } from "../data/items/index.mjs";
import { ActorDataModels } from "../data/actors/index.mjs";
import { showRollDialog } from "../dice/roll.mjs";
import { confirmPrerequisites } from "../utils/prerequisites.mjs";
import { DedrelSocket } from "../socket.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Основной класс Листа Персонажа для системы Dedrel.
 * Наследуется от нового Foundry V2 Application Framework (ActorSheetV2).
 * Обрабатывает рендеринг, логику прокачки, драг-н-дроп и клики по кнопкам.
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
      toggleDoctrinePath: DedrelCharacterSheet.#onToggleDoctrinePath,
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
   * Подготовка данных для передачи в Handlebars шаблоны.
   * Здесь мы сортируем предметы по категориям, рассчитываем стоимость прокачки и логику создания персонажа.
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actorData = this.document;
    
    // Блокировка удаления предметов
    context.itemsLocked = this.document.getFlag("dedrel", "itemsLocked") ?? true;
    
    // Categorize Items
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
    const currencyItems = []; // «Рыхлые» монеты-предметы (тип currency) для зачисления в кошелёк
    const containers = [];    // Предметы-ссылки на акторов-контейнеры (сумки/сундуки)
    
    // New equipment
    const weapons = [];
    const armors = [];
    const magic_items = [];

    // Favorites
    const favoriteManeuversSpells = [];
    const quickSlots = [];
    const equippedWeapons = [];

    for (let i of actorData.items) {
      const isFav = i.getFlag("dedrel", "isFavorite");

      // Предмет-ссылка на контейнер: любой предмет с флагом linkedActorUuid.
      // Показывается отдельной секцией; его system.weight — вклад в перегрузку
      // (для «сумки удержания» — фиксированный, независимо от содержимого).
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
      else if (i.type === 'mutilation') mutilations.push(i);
      else if (i.type === 'weapon') {
        weapons.push(i);
        if (i.system.equipped) equippedWeapons.push(i);
      }
      else if (i.type === 'armor') armors.push(i);
      else if (i.type === 'magic_item') {
        magic_items.push(i);
        if (isFav) quickSlots.push(i);
      }
      else if (i.type === 'currency') {
        // Монеты-предметы не идут в общий инвентарь: их зачисляют в кошелёк
        currencyItems.push(i);
      }
      else {
        inventory.push(i);
        if (isFav) quickSlots.push(i);
      }
    }

    const hasTail = mutations.some(m => m.system.key && m.system.key.includes("tail"));

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

    // Enrich HTML for biography using namespaced TextEditor
    const enrichedBiography = await foundry.applications.ux.TextEditor.enrichHTML(actorData.system.details?.biography || "", {
      async: true,
      secrets: this.document.isOwner,
      rollData: this.document.getRollData()
    });

    // Calculate creation data
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
    
    creationData.mutationsMax += Math.min(creationData.harmfulMutationsCount, 2);

    // Calculate Upgrade Costs
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

    // Прокачка Доктрин (Магический Конструктор): показываем только разблокированные
    // талантами доктрины (unlocked через AE), сгруппированные по группам из конфига.
    // Цена считается от ПРОИЗВОДНОГО ранга (source + эффекты талантов), т.к. таланты
    // доступа обычно дарят ранг 1; покупка же пишет +1 в source (см. #onUpgradeDoctrine).
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

    // Тумблеры Путей двухпутёвых доктрин (гидро/венто) для вкладки Заклинания.
    // Переключение свободно "в начале хода" — механически не энфорсится,
    // смена публикуется в чат (социальный контроль).
    const doctrinePaths = [];
    if (magicCfg && actorData.system.doctrines) {
      for (const [key, cfg] of Object.entries(magicCfg.doctrines)) {
        if (!cfg.paths) continue;
        const state = actorData.system.doctrines[key];
        if (!state?.unlocked) continue;
        doctrinePaths.push({
          key,
          label: game.i18n.localize(`DEDREL.Magic.Doctrines.${key}`),
          paths: Object.entries(cfg.paths).map(([pk, pcfg]) => ({
            key: pk,
            label: game.i18n.localize(pcfg.label),
            active: state.active_path === pk
          }))
        });
      }
    }

    // ==========================================
    // Группировка навыков и избранное
    // ==========================================
    // Навыки в DataModel хранятся плоским списком, но в UI разбиты по категориям.
    const skillCategories = {
      combat: ["crossbows", "unarmed_combat", "pole_weapons", "blunt_weapons", "artillery", "firearms", "throwing", "exotic_weapons", "magical_attacks", "bows", "bladed_weapons", "armor_use"],
      intellectual: ["cultural_awareness", "knowledge", "logic_reasoning", "interpretation", "research"],
      practical: ["craftsmanship", "stealth", "healing", "survival", "engineering", "atletism"],
      social: ["persuasion", "insight", "deception", "intimidation", "performance"]
    };

    const skillGroups = { combat: [], intellectual: [], practical: [], social: [] };
    const favoriteSkillsData = [];
    const favSkillsFlag = this.document.getFlag("dedrel", "favoriteSkills") || [];

    if (actorData.system.skills) {
      for (const [key, skillData] of Object.entries(actorData.system.skills)) {
        // Определяем категорию навыка для правильного отображения в UI
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

    // Check for attributes over cap during creation.
    // ВАЖНО: не мутируем живую системную модель (actorData.system.*), а формируем
    // отдельные объекты для контекста рендера. Иначе флаги isOverCap попадают
    // в подготовленные данные актёра и могут «протечь» в другие места.
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

    const attributesData = foundry.utils.deepClone(actorData.system.attributes);
    const globalSave = actorData.system.bonuses?.global_save || 0;
    for (const [key, attr] of Object.entries(attributesData)) {
      attr.final_save = attr.rank + (attr.save_bonus || 0) + globalSave;
    }

    // ==========================================
    // Кошелёк (мультивалютность)
    // ==========================================
    // Список валют — из настройки мира; счётчики — из system.currency актора.
    const walletCurrencies = [];
    let walletTotal = 0;
    try {
      const defs = game.settings.get("dedrel", "currencies") || [];
      const counts = actorData.system.currency || {};
      for (const def of defs) {
        const count = Number(counts[def.key]) || 0;
        walletCurrencies.push({ ...def, count });
        walletTotal += count * (Number(def.base_value) || 0);
      }
    } catch (e) {
      // Настройка валют недоступна
    }

    // ==========================================
    // Перегрузка (для индикатора-бара)
    // ==========================================
    const enc = actorData.system.resources?.encumbrance;
    let encumbrance = null;
    if (enc) {
      const heavy = enc.thresholds?.heavy || 0;
      const pct = heavy > 0 ? Math.min(100, Math.round((enc.total / heavy) * 100)) : 0;
      const colorMap = { light: "#4caf50", medium: "#e0c341", heavy: "#e08a2e", overloaded: "#c0392b" };
      encumbrance = {
        ...enc,
        pct,
        color: colorMap[enc.category] || "#4caf50",
        label: game.i18n.localize(`DEDREL.Encumbrance.${enc.category}`)
      };
    }

    Object.assign(context, {
      actor: actorData,
      system: actorData.system,
      attributesData,
      encumbrance,
      walletCurrencies,
      walletTotal,
      walletWeight: actorData.system.wallet?.weight || 0,
      currencyItems,
      containers,
      canCreateActors: Actor.canUserCreate(game.user),
      maneuvers,
      maneuversGroups,
      spells,
      mutations,
      mutationsGroups,
      talents,
      talentsGroups,
      mutilations,
      inventory,
      weapons,
      armors,
      magic_items,
      favoriteManeuversSpells,
      quickSlots,
      equippedWeapons,
      permanentEffects,
      temporaryEffects,
      enrichedBiography,
      creationData,
      xpData,
      doctrinePaths,
      skillGroups,
      favoriteSkillsData,
      equipment_slots,
      hasTail,
      tabs: this._prepareTabs("primary"),
      editable: this.isEditable
    });

    return context;
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

    // Подсветка слотов экипировки при перетаскивании (сам дроп обрабатывает _onDrop)
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
    
    // Если это эксклюзивная броня, нужно снять всё остальное
    const isExclusive = item.system.properties?.exclusive_slot;
    const updates = {};
    
    // Пытаемся найти первый свободный слот
    let targetSlot = allowedSlots.find(s => !equipment_slots[s]?.item_id);
    if (!targetSlot) targetSlot = allowedSlots[0]; // Если всё занято, заменяем первый доступный

    if (isExclusive) {
      updates["system.equipment_slots.armor_upper.item_id"] = "";
      updates["system.equipment_slots.armor_middle.item_id"] = "";
      updates["system.equipment_slots.armor_lower.item_id"] = "";
      updates[`system.equipment_slots.${targetSlot}.item_id`] = item.id;
      ui.notifications.info(game.i18n.format("DEDREL.Notifications.ExclusiveArmorEquipped", {name: item.name}));
    } else {
      // Проверяем, нет ли уже надетой эксклюзивной брони
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
    const itemId = target.closest(".item-row").dataset.itemId;
    const item = this.document.items.get(itemId);
    if (!item || item.type !== "weapon") return;

    if (item.system.equipped) {
      return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.WeaponAlreadyEquipped"));
    }

    const equipment_slots = this.document.system.equipment_slots;
    // Парное (is_paired) занимает обе руки так же, как двуручное
    const isTwoHanded = item.system.is_twohanded || item.system.is_paired;
    const hasTail = this.document.items.some(i => i.type === "mutation" && i.system.key && i.system.key.includes("tail"));

    const updates = {};

    if (isTwoHanded) {
      if (!equipment_slots.main_hand.item_id && !equipment_slots.off_hand.item_id) {
         updates["system.equipment_slots.main_hand.item_id"] = item.id;
         updates["system.equipment_slots.off_hand.item_id"] = item.id;
      } else {
         return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.TwoHandsRequired"));
      }
    } else {
      if (!equipment_slots.main_hand.item_id) {
         updates["system.equipment_slots.main_hand.item_id"] = item.id;
      } else if (!equipment_slots.off_hand.item_id) {
         updates["system.equipment_slots.off_hand.item_id"] = item.id;
      } else if (hasTail && !equipment_slots.tail.item_id) {
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
   * Зачисляет монеты в кошелёк актора: прибавляет value к счётчику валюты
   * с ключом denomination. Возвращает true, если валюта известна миру.
   */
  static async depositToWallet(actor, denomination, value) {
    const v = Number(value);
    if (!denomination || !(v > 0)) return false; // только положительное зачисление
    let defs = [];
    try { defs = game.settings.get("dedrel", "currencies") || []; } catch (e) {}
    if (!defs.some(d => d.key === denomination)) return false;
    const current = Number(actor.system.currency?.[denomination]) || 0;
    await actor.update({ [`system.currency.${denomination}`]: current + v });
    return true;
  }

  /** Зачисляет «рыхлую» монету-предмет в кошелёк и удаляет предмет. */
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
   * «Свернуть номинал»: перераспределяет весь кошелёк по деноминациям сверху вниз
   * (жадный алгоритм по base_value), минимизируя число монет. Общая ценность не
   * меняется при наличии базовой валюты (base_value = 1); иначе возможен остаток,
   * который остаётся в наименьшей деноминации.
   */
  static async #onCollapseCurrency(event, target) {
    let defs = [];
    try { defs = game.settings.get("dedrel", "currencies") || []; } catch (e) {}
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
        // Наименьшая деноминация забирает остаток целиком (сохранение ценности)
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
   * Перевод денег другому актору. Открывает диалог выбора получателя и сумм
   * по валютам; исполнение — через DedrelSocket (напрямую, если хватает прав,
   * иначе через активного ГМа). Позволяет игрокам расплачиваться, не владея
   * кошельком получателя.
   */
  static async #onPayCurrency(event, target) {
    const actor = this.document;
    let defs = [];
    try { defs = game.settings.get("dedrel", "currencies") || []; } catch (e) {}
    if (!defs.length) return ui.notifications.warn(game.i18n.localize("DEDREL.ActorSheet.NoCurrenciesConfigured"));

    // Получатели: другие акторы с кошельком, которым разрешён приём денег
    // (флаг can_receive_currency) — чтобы список не забивался сундуками/лутом.
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

  /** Открывает лист привязанного актора-контейнера (сумки/сундука). */
  static async #onOpenContainer(event, target) {
    const uuid = target.closest("[data-container-uuid]")?.dataset.containerUuid;
    const actor = uuid ? await fromUuid(uuid) : null;
    if (actor) actor.sheet.render(true);
    else ui.notifications.warn(game.i18n.localize("DEDREL.Container.NotFound"));
  }

  /** Создаёт новый актор-контейнер и предмет-ссылку на него на этом персонаже. */
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

  /** Отвязывает контейнер: удаляет только предмет-ссылку, актор-контейнер остаётся. */
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

  /** Создаёт на персонаже предмет-ссылку (тип loot) на актор-контейнер. */
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

  /** Экипирует предмет в КОНКРЕТНЫЙ слот (drag-n-drop в слот экипировки). */
  async #equipToSlot(item, slotKey, kind, accept) {
    if (kind === "accessory") return this.#equipAccessoryToSlot(item, slotKey, accept);
    if (kind === "weapon" && item.type === "weapon") return this.#equipWeaponToSlot(item, slotKey);
    if (kind === "armor" && item.type === "armor") return this.#equipArmorToSlot(item, slotKey);
    return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.WrongSlotKind"));
  }

  /** Экипирует аксессуар (по совпадению system.equip_slot с типом слота). */
  async #equipAccessoryToSlot(item, slotKey, accept) {
    const es = item.system.equip_slot;
    if (!es || es !== accept) {
      return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.WrongSlotKind"));
    }
    // Слот хвоста требует соответствующую мутацию
    if (slotKey === "acc_tail") {
      const hasTail = this.document.items.some(i => i.type === "mutation" && i.system.key && i.system.key.includes("tail"));
      if (!hasTail) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.TailSlotLocked"));
    }
    const ACC = ["head", "neck", "torso", "acc_left_1", "acc_left_2", "acc_right_1", "acc_right_2", "acc_tail"];
    const slots = this.document.system.equipment_slots;
    const updates = {};
    // Снимаем предмет из других аксессуарных слотов, если он там уже стоит
    for (const s of ACC) {
      if (s !== slotKey && slots[s]?.item_id === item.id) updates[`system.equipment_slots.${s}.item_id`] = "";
    }
    updates[`system.equipment_slots.${slotKey}.item_id`] = item.id;
    await this.document.update(updates);
  }

  async #equipWeaponToSlot(item, slotKey) {
    const slots = this.document.system.equipment_slots;
    const hasTail = this.document.items.some(i => i.type === "mutation" && i.system.key && i.system.key.includes("tail"));
    if (slotKey === "tail" && !hasTail) {
      return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.TailSlotLocked"));
    }

    const updates = {};
    // Освобождаем слоты, где этот предмет уже стоит
    for (const s of ["main_hand", "off_hand", "tail"]) {
      if (slots[s]?.item_id === item.id) updates[`system.equipment_slots.${s}.item_id`] = "";
    }

    if (item.system.is_twohanded || item.system.is_paired) {
      // Двуручное/парное занимает обе руки — снимаем текущих владельцев main/off
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
      // Снимаем то, что было в целевом слоте (если 2H/парное — освобождаем оба)
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
    // Броня-аксессуар (шлем и т.п.) не идёт в слои тела — только в свой слот аксессуара
    if (item.system.equip_slot) {
      return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.WrongArmorSlot"));
    }
    const allowedMap = {
      lower: ["armor_lower"],
      middle: ["armor_middle"],
      upper: ["armor_upper"],
      universal: ["armor_lower", "armor_middle", "armor_upper"]
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
      // Нельзя надеть поверх эксклюзивной брони
      for (const s of ["armor_upper", "armor_middle", "armor_lower"]) {
        const cid = slots[s]?.item_id;
        if (cid) {
          const cur = this.document.items.get(cid);
          if (cur?.system.properties?.exclusive_slot) {
            return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.CannotEquipExclusive"));
          }
        }
      }
      // Снимаем предмет из других слотов, если он уже надет
      for (const s of ["armor_upper", "armor_middle", "armor_lower"]) {
        if (s !== slotKey && slots[s]?.item_id === item.id) updates[`system.equipment_slots.${s}.item_id`] = "";
      }
      updates[`system.equipment_slots.${slotKey}.item_id`] = item.id;
    }

    await this.document.update(updates);
  }

  /** Снимает предмет из произвольного слота экипировки (аксессуары). */
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
      // Локализованное имя типа из TYPES.Item.<type> (те же ключи, что в диалоге создания)
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


  static async performRest(actor, restType) {
    if (game.user.isGM) {
      const timeAdvance = restType === "long" ? 28800 : 3600;
      await game.time.advance(timeAdvance);
    } else {
      ui.notifications.info(game.i18n.localize("DEDREL.Notifications.GMRestoreTimeOnly"));
    }
    
    const updateData = {};
    const res = actor.system.resources;
    // По правилам отдых ОД не восстанавливает (они и так откатываются каждый раунд).
    // Сброс оставлен намеренно — для тестирования манёвров вне боя: важно видеть,
    // сколько ОД что стоит, проверять комбо-цепочки и т.д.
    if (res.ap_universal) updateData["system.resources.ap_universal.value"] = res.ap_universal.max;
    if (res.ap_magic) updateData["system.resources.ap_magic.value"] = res.ap_magic.max;
    if (res.ap_maneuver) updateData["system.resources.ap_maneuver.value"] = res.ap_maneuver.max;
    
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
    
    ui.notifications.info(game.i18n.format("DEDREL.Notifications.RestPerformed", {name: actor.name, restType: restType === "long" ? game.i18n.localize("DEDREL.Notifications.RestLong") : game.i18n.localize("DEDREL.Notifications.RestShort")}));
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

  /**
   * Переключает активный Путь двухпутёвой доктрины (Гидромантия/Вентомантия).
   * Смена публикуется в чат: правило "только в начале хода" не энфорсится
   * механически, публичность — социальный контроль.
   */
  static async #onToggleDoctrinePath(event, target) {
    const doctrineKey = target.dataset.doctrine;
    const pathKey = target.dataset.path;
    const state = this.document.system.doctrines?.[doctrineKey];
    if (!state || state.active_path === pathKey) return;

    await this.document.update({ [`system.doctrines.${doctrineKey}.active_path`]: pathKey });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.document }),
      content: `<div class="dedrel-item-chat"><p>${game.i18n.format("DEDREL.Magic.UI.PathSwitched", {
        actor: foundry.utils.escapeHTML(this.document.name),
        doctrine: game.i18n.localize(`DEDREL.Magic.Doctrines.${doctrineKey}`),
        path: game.i18n.localize(`DEDREL.Magic.Paths.${pathKey}`)
      })}</p></div>`
    });
  }

  /** Снимает флаг эфемерности — временное заклинание становится постоянным. */
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

    // Производный ранг (source + подаренный талантом) определяет цену шага,
    // но +1 пишем в SOURCE: иначе повторно запечём бонус эффекта в базу.
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
   * Обработчик создания документа после его дропа на лист.
   * Используется для специальной логики предметов (например, EXP).
   */
  async _onDropItemCreate(itemData) {
    // Если игрок бросает на лист предмет "Опыт", мы не создаем предмет,
    // а просто начислям опыт персонажу.
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

  /**
   * Кастомная обработка Drag & Drop (V2).
   * Позволяет отслеживать, в какую именно зону был брошен предмет 
   * (например, стартовые мутации при создании персонажа).
   */
  async _onDrop(event) {
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch(err) {
      return super._onDrop(event);
    }
    // Дроп актора-контейнера (тип loot) → создаём предмет-ссылку в инвентаре.
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

    // Экипировка перетаскиванием: дроп оружия/брони на конкретный слот.
    // Работает для предметов, уже принадлежащих этому актору; внешние предметы
    // сначала падают в инвентарь (стандартное поведение), затем их можно надеть.
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

    // Монеты, брошенные на лист: зачисляем в кошелёк, если валюта известна миру.
    // Иначе (неизвестная деноминация) — падаем в обычное создание предмета.
    if (item.type === "currency") {
      const ok = await DedrelCharacterSheet.depositToWallet(this.document, item.system.denomination, item.system.value);
      if (ok) {
        ui.notifications.info(game.i18n.format("DEDREL.Notifications.CurrencyDeposited", {
          value: item.system.value, denom: item.system.denomination
        }));
        return false;
      }
    }

    // Проверка пререквизитов при добавлении таланта/мутации/манёвра извне.
    // Манёвры тоже гейтятся: есть базовые манёвры с требованиями рангов навыков
    // («Выстрел с упора», «Добивание»). Невыполненные требования не блокируют
    // жёстко: Мастер подтверждает через диалог.
    if (["talent", "mutation", "maneuver"].includes(item.type) && !this.document.items.get(item.id)) {
      const proceed = await confirmPrerequisites(this.document, item);
      if (!proceed) return false;
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
           let harmfulCount = 0;
           for (let m of this.document.items) {
             if (m.type === "mutation" && m.system.starting) {
                if (m.system.mutation_type === "harmful") harmfulCount++;
                else totalUsed += (m.system.xp_cost || 0);
             }
           }
           const maxPoints = 3 + Math.min(harmfulCount, 2);
           if (totalUsed + (itemObj.system.xp_cost || 0) > maxPoints) {
             ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NotEnoughPointsForMutation"));
             return false;
           }
        } else if (dropType === "mutation-harmful") {
           itemObj.system.mutation_type = "harmful";
           let harmfulCount = 0;
           for (let m of this.document.items) {
             if (m.type === "mutation" && m.system.starting && m.system.mutation_type === "harmful") {
                harmfulCount++;
             }
           }
           if (harmfulCount >= 2) {
             ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.MaxStartingHarmfulMutations"));
             return false;
           }
        }
        
        return this.document.createEmbeddedDocuments("Item", [itemObj]);
      }
    }

    return super._onDrop(event);
  }
}
