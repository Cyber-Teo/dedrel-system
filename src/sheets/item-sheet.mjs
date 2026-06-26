const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class DedrelItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  
  static DEFAULT_OPTIONS = {
    classes: ["dedrel", "sheet", "item"],
    tag: "form",
    window: {
      resizable: true,
      controls: []
    },
    position: {
      width: 520,
      height: 480
    },
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      changeTab: DedrelItemSheet.#onChangeTab
    }
  };

  static PARTS = {
    sheet: {
      template: "systems/dedrel/templates/item/item-sheet.hbs"
    }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "details", label: "Детали" },
        { id: "description", label: "Описание" }
      ],
      initial: "description",
      navSelector: ".tabs[data-group='primary']",
      contentSelector: ".sheet-body"
    }
  };

  async _prepareContext(options) {
    console.log("Dedrel | DedrelItemSheet _prepareContext start for item:", this.document.name, this.document.id);
    const context = await super._prepareContext(options);
    const itemData = this.document;
    
    // Enrich HTML description using namespaced TextEditor
    context.enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(itemData.system.description || "", {
      async: true,
      secrets: this.document.isOwner,
      rollData: this.document.getRollData()
    });

    context.item = itemData;
    context.system = itemData.system;
    context.tabs = this._prepareTabs("primary");
    context.editable = this.isEditable;
    
    if (itemData.type === "weapon") {
      context.weaponTypes = {
        "bladed": "Лезвийное",
        "polearm": "Древковое",
        "blunt": "Дробящее",
        "ranged": "Стрелковое"
      };
      context.damageTypes = {
        "slashing": "Режущий",
        "bludgeoning": "Дробящий",
        "piercing": "Колющий"
      };
      context.reqAttributes = {
        "none": "Нет",
        "str": "Сила",
        "dex": "Ловкость",
        "con": "Телосложение",
        "int": "Интеллект",
        "wis": "Мудрость",
        "cha": "Харизма"
      };
      context.zeroToThree = { 0: "0", 1: "1", 2: "2", 3: "3" };
      context.zeroToSix = { 0: "0", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6" };
    }

    console.log("Dedrel | DedrelItemSheet context prepared successfully:", context);
    return context;
  }

  changeTab(tab, group, options={}) {
    console.log("Dedrel | changeTab called for Item. tab:", tab, "group:", group, "options:", options);
    return super.changeTab(tab, group, options);
  }

  _onClickTab(event) {
    console.log("Dedrel | _onClickTab called for Item. event:", event, "target:", event.target, "currentTarget:", event.currentTarget);
    return super._onClickTab(event);
  }

  _onClickAction(event, target) {
    console.log("Dedrel | _onClickAction called for Item. event:", event, "target:", target, "action:", target.dataset.action);
    return super._onClickAction(event, target);
  }

  static #onChangeTab(event, target) {
    const tab = target.dataset.tab;
    const group = target.dataset.group || "primary";
    this.changeTab(tab, group, { event });
  }
}
