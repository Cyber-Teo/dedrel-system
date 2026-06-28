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
      toggleCreationLock: DedrelCharacterSheet.#onToggleCreationLock,
      toggleCreationView: DedrelCharacterSheet.#onToggleCreationView,
      increaseBloodline: DedrelCharacterSheet.#onIncreaseBloodline,
      decreaseBloodline: DedrelCharacterSheet.#onDecreaseBloodline,
      increaseAttribute: DedrelCharacterSheet.#onIncreaseAttribute,
      decreaseAttribute: DedrelCharacterSheet.#onDecreaseAttribute,
      increaseSkill: DedrelCharacterSheet.#onIncreaseSkill,
      decreaseSkill: DedrelCharacterSheet.#onDecreaseSkill,
      upgradeAttribute: DedrelCharacterSheet.#onUpgradeAttribute,
      upgradeSkill: DedrelCharacterSheet.#onUpgradeSkill
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
        { id: "main", label: "Основное" },
        { id: "inventory", label: "Инвентарь" },
        { id: "maneuvers", label: "Манёвры" },
        { id: "spells", label: "Заклинания" },
        { id: "mutations", label: "Мутации" },
        { id: "talents", label: "Таланты" },
        { id: "statuses", label: "Статусы" },
        { id: "biography", label: "Биография" },
        { id: "experience", label: "Опыт" }
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

    if (actorData.system.bloodlines) {
      for (const [k, v] of Object.entries(actorData.system.bloodlines)) {
        creationData.bloodlinesUsed += (v.rank - 1);
      }
    }
    
    for (const [k, v] of Object.entries(actorData.system.attributes)) {
      creationData.attributesUsed += (v.rank - 1);
    }
    
    if (actorData.system.skills) {
      for (const [k, v] of Object.entries(actorData.system.skills)) {
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
      skills: {}
    };
    const xpCostsList = [2, 4, 8, 16, 32];
    const bloodlineAttrMap = {
      human: "will", demon: "rea", dragon: "log", fay: "luck", elf: "dex"
    };

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
           canUpgrade: ((actorData.system.details.xp || 0) >= cost)
        };
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
      activeEffects: Array.from(actorData.effects),
      enrichedBiography,
      creationData,
      xpData,
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
    const wrapper = this.element.querySelector(".scrollable-wrapper");
    if (wrapper) {
      wrapper.scrollTop = this._savedScrollTop;
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
      if (item.type === "weapon" || item.type === "armor") {
        await item.update({"system.equipped": !item.system.equipped});
      } else {
        const isFav = item.getFlag("dedrel", "isFavorite");
        await item.setFlag("dedrel", "isFavorite", !isFav);
      }
    }
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
      ui.notifications.warn("Этот предмет нельзя использовать.");
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

  static async #onToggleCreationLock(event, target) {
    const isLocked = this.document.getFlag("dedrel", "creationLocked") ?? true;
    const currentlyLocked = !!this.document.getFlag("dedrel", "creationLocked");
    await this.document.setFlag("dedrel", "creationLocked", !currentlyLocked);
  }

  static async #onToggleCreationView(event, target) {
    const currentlyShowing = !!this.document.getFlag("dedrel", "showCreation");
    await this.document.setFlag("dedrel", "showCreation", !currentlyShowing);
  }

  static async #onIncreaseBloodline(event, target) {
    if (this.document.getFlag("dedrel", "creationLocked")) return;
    const key = target.dataset.key;
    const current = this.document.system.bloodlines[key].rank;
    if (current < 6) { // check total?
      let total = 0;
      for (const [k, v] of Object.entries(this.document.system.bloodlines)) total += (v.rank - 1);
      if (total < 10) {
        await this.document.update({ [`system.bloodlines.${key}.rank`]: current + 1 });
      } else {
        ui.notifications.warn("Достигнут лимит очков Линий Крови (10).");
      }
    }
  }

  static async #onDecreaseBloodline(event, target) {
    if (this.document.getFlag("dedrel", "creationLocked")) return;
    const key = target.dataset.key;
    const current = this.document.system.bloodlines[key].rank;
    if (current > 1) {
      await this.document.update({ [`system.bloodlines.${key}.rank`]: current - 1 });
    }
  }

  static async #onIncreaseAttribute(event, target) {
    if (this.document.getFlag("dedrel", "creationLocked")) return;
    const key = target.dataset.key;
    const current = this.document.system.attributes[key].rank;
    if (current < 4) { // Max starting rank
      let total = 0;
      for (const [k, v] of Object.entries(this.document.system.attributes)) total += (v.rank - 1);
      if (total < 10) {
        await this.document.update({ [`system.attributes.${key}.rank`]: current + 1 });
      } else {
        ui.notifications.warn("Достигнут лимит стартовых очков атрибутов (10).");
      }
    } else {
      ui.notifications.warn("Максимальное стартовое значение атрибута - 4.");
    }
  }

  static async #onDecreaseAttribute(event, target) {
    if (this.document.getFlag("dedrel", "creationLocked")) return;
    const key = target.dataset.key;
    const current = this.document.system.attributes[key].rank;
    if (current > 1) {
      await this.document.update({ [`system.attributes.${key}.rank`]: current - 1 });
    }
  }

  static async #onIncreaseSkill(event, target) {
    if (this.document.getFlag("dedrel", "creationLocked")) return;
    const key = target.dataset.key;
    const current = this.document.system.skills[key].rank;
    if (current < 3) { // Max starting rank
      let total = 0;
      for (const [k, v] of Object.entries(this.document.system.skills)) total += v.rank;
      if (total < 15) {
        await this.document.update({ [`system.skills.${key}.rank`]: current + 1 });
      } else {
        ui.notifications.warn("Достигнут лимит стартовых очков умений (15).");
      }
    } else {
      ui.notifications.warn("Максимальное стартовое значение навыка - 3.");
    }
  }

  static async #onDecreaseSkill(event, target) {
    if (this.document.getFlag("dedrel", "creationLocked")) return;
    const key = target.dataset.key;
    const current = this.document.system.skills[key].rank;
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
      ui.notifications.info(`Атрибут повышен за ${cost} XP.`);
    } else {
      ui.notifications.warn("Недостаточно опыта или достигнут максимальный ранг.");
    }
  }

  static async #onUpgradeSkill(event, target) {
    const key = target.dataset.key;
    const cost = parseInt(target.dataset.cost);
    const currentXp = this.document.system.details.xp || 0;
    const currentRank = this.document.system.skills[key].rank;

    if (currentXp >= cost) {
      await this.document.update({
        [`system.skills.${key}.rank`]: currentRank + 1,
        "system.details.xp": currentXp - cost
      });
      ui.notifications.info(`Навык повышен за ${cost} XP.`);
    } else {
      ui.notifications.warn("Недостаточно опыта.");
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
      
      ui.notifications.info(`Получено опыта: ${expValue}`);
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
    const data = TextEditor.getDragEventData(event);
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
          ui.notifications.warn("Создание персонажа заблокировано!");
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
             ui.notifications.warn("Недостаточно очков для стартовой полезной мутации!");
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
             ui.notifications.warn("Максимум 2 стартовые вредные мутации!");
             return false;
           }
        }
        
        return this.document.createEmbeddedDocuments("Item", [itemObj]);
      }
    }

    return super._onDrop(event);
  }
}
