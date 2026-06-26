import { ItemDataModels } from "../data/items/index.js";
import { ActorDataModels } from "../data/actors/index.mjs";
import { showRollDialog } from "../dice/roll.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

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
      rollCheck: DedrelCharacterSheet.#onRollCheck
    }
  };

  static PARTS = {
    sheet: {
      template: "systems/dedrel/templates/actor/character-sheet.hbs"
    }
  };

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
        { id: "experience", label: "Опыт" }
      ],
      initial: "main",
      navSelector: ".tabs[data-group='primary']",
      contentSelector: ".sheet-body"
    }
  };

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
        if (isFav || i.system.equipped) equippedWeapons.push(i);
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
      tabs: this._prepareTabs("primary"),
      editable: this.isEditable
    });

    return context;
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
      const isFav = item.getFlag("dedrel", "isFavorite");
      await item.setFlag("dedrel", "isFavorite", !isFav);
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
}
