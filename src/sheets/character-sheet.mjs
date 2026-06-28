import { ItemDataModels } from "../data/items/index.js";
import { ActorDataModels } from "../data/actors/index.mjs";
import { showRollDialog } from "../dice/roll.mjs";

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
      toggleEffect: DedrelCharacterSheet.#onToggleEffect,
      editEffect: DedrelCharacterSheet.#onEditEffect,
      deleteEffect: DedrelCharacterSheet.#onDeleteEffect,
      spendLuck: DedrelCharacterSheet.#onSpendLuck,
      resetLuck: DedrelCharacterSheet.#onResetLuck,
      equipArmor: DedrelCharacterSheet.#onEquipArmor,
      unequipArmor: DedrelCharacterSheet.#onUnequipArmor
    }
  };

  static PARTS = {
    sheet: {
      template: "systems/dedrel/templates/actor/character-sheet.hbs"
    }
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
    const spells = [];
    const mutations = [];
    const talents = [];
    const mutilations = [];
    const inventory = [];
    
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
      
      if (i.type === 'maneuver') {
        maneuvers.push(i);
        if (isFav) favoriteManeuversSpells.push(i);
      }
      else if (i.type === 'spell') {
        spells.push(i);
        if (isFav) favoriteManeuversSpells.push(i);
      }
      else if (i.type === 'mutation') mutations.push(i);
      else if (i.type === 'talent') talents.push(i);
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
      else {
        inventory.push(i);
        if (isFav) quickSlots.push(i);
      }
    }

    const equipment_slots = {
      armor_upper: actorData.system.equipment_slots?.armor_upper?.item_id ? actorData.items.get(actorData.system.equipment_slots.armor_upper.item_id) : null,
      armor_middle: actorData.system.equipment_slots?.armor_middle?.item_id ? actorData.items.get(actorData.system.equipment_slots.armor_middle.item_id) : null,
      armor_lower: actorData.system.equipment_slots?.armor_lower?.item_id ? actorData.items.get(actorData.system.equipment_slots.armor_lower.item_id) : null,
    };

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

    // Check for attributes over cap during creation
    let hasOverCapAttributes = false;
    let hasOverCapSkills = false;
    if (actorData.flags?.dedrel?.showCreation) {
      for (const [key, attr] of Object.entries(actorData.system.attributes)) {
        if (attr.rank > 4) {
          attr.isOverCap = true;
          hasOverCapAttributes = true;
        } else {
          attr.isOverCap = false;
        }
      }
      for (const [key, skill] of Object.entries(actorData.system.skills)) {
        if (skill.rank > 3) {
          skill.isOverCap = true;
          hasOverCapSkills = true;
        } else {
          skill.isOverCap = false;
        }
      }
    }
    creationData.hasOverCapAttributes = hasOverCapAttributes;
    creationData.hasOverCapSkills = hasOverCapSkills;

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

    Object.assign(context, {
      actor: actorData,
      system: actorData.system,
      maneuvers,
      spells,
      mutations,
      talents,
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
      skillGroups,
      favoriteSkillsData,
      equipment_slots,
      tabs: this._prepareTabs("primary"),
      editable: this.isEditable
    });

    return context;
  }

  async _preRender(context, options) {
    await super._preRender(context, options);
    this._savedScrollTop = this.element?.querySelector(".scrollable-wrapper")?.scrollTop || 0;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;
    const wrapper = this.element.querySelector(".scrollable-wrapper");
    if (wrapper) {
      wrapper.scrollTop = this._savedScrollTop;
    }

    const dragTargets = this.element.querySelectorAll(".item-row, .skill-item");
    for (let el of dragTargets) {
      el.setAttribute("draggable", "true");
      el.addEventListener("dragstart", this.#onDragStart.bind(this));
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
    console.log("Dedrel | changeTab called for Actor. tab:", tab, "group:", group, "options:", options);
    return super.changeTab(tab, group, options);
  }

  _onClickTab(event) {
    console.log("Dedrel | _onClickTab called for Actor. event:", event, "target:", event.target, "currentTarget:", event.currentTarget);
    return super._onClickTab(event);
  }

  _onClickAction(event, target) {
    console.log("Dedrel | _onClickAction called for Actor. event:", event, "target:", target, "action:", target.dataset.action);
    return super._onClickAction(event, target);
  }

  static async #onEditItem(event, target) {
    console.log("Dedrel | #onEditItem action triggered. target:", target);
    const itemId = target.closest(".item-row").dataset.itemId;
    const item = this.document.items.get(itemId);
    console.log("Dedrel | Item retrieved:", item);
    if (item) {
      console.log("Dedrel | item.sheet instance:", item.sheet);
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
        await item.update({"system.equipped": !item.system.equipped});
      } else if (item.type === "armor") {
        // Старая логика экипировки заменена на слоты (убрана отсюда)
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
      name: `Новый ${type}`,
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
    
    await showRollDialog({
      actor: actor,
      title: label,
      baseRank: rank,
      isSave: isSave
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
    const fp = new FilePicker({
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
    const confirm = await Dialog.confirm({
      title: "Короткий Отдых",
      content: "<p>Вы уверены, что хотите совершить короткий отдых (1 час)? Это восстановит ОД и способности на короткий отдых.</p>",
      yes: () => true,
      no: () => false,
      defaultYes: true
    });
    if (!confirm) return;
    await DedrelCharacterSheet.performRest(this.document, "short");
  }

  static async #onLongRest(event, target) {
    const confirm = await Dialog.confirm({
      title: "Длинный Отдых",
      content: "<p>Вы уверены, что хотите совершить длинный отдых (8 часов)? Это восстановит ОД и все способности на день/короткий/длинный отдых.</p>",
      yes: () => true,
      no: () => false,
      defaultYes: true
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

    const confirm = await Dialog.confirm({
      title: game.i18n.localize("DEDREL.Chat.SpendLuckTitle"),
      content: game.i18n.localize("DEDREL.Chat.SpendLuckContent"),
      yes: () => true,
      no: () => false,
      defaultYes: true
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
             maxVal = r.evaluate({async: false}).total;
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
    if (data.type !== "Item") return super._onDrop(event);

    const item = await Item.implementation.fromDropData(data);
    if (!item) return super._onDrop(event);

    if (item.type === "exp") {
      return this._onDropItemCreate(item.toObject());
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
        
        // Prerequisites check logic goes here
        // E.g. itemObj.system.prerequisites_bloodlines

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
