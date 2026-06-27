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
      changeTab: DedrelItemSheet.#onChangeTab,
      editImage: DedrelItemSheet.#onEditImage
    }
  };

  static PARTS = {
    sheet: {
      template: "systems/dedrel/templates/item/item-sheet.hbs"
    }
  };

  get title() {
    return this.document.name;
  }

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
      context.weaponSkills = {
        "unarmed_combat": "Безоружный бой",
        "pole_weapons": "Древковое оружие",
        "blunt_weapons": "Дробящее оружие",
        "artillery": "Артиллерия",
        "firearms": "Огнестрельное оружие",
        "throwing": "Метательное оружие",
        "exotic_weapons": "Экзотическое оружие",
        "magical_attacks": "Магические атаки",
        "bows": "Луки",
        "bladed_weapons": "Лезвийное оружие"
      };
      context.damageTypes = {
        "slashing": "Режущий",
        "bludgeoning": "Дробящий",
        "piercing": "Колющий"
      };
      context.zeroToThree = { 0: "0", 1: "1", 2: "2", 3: "3" };
      context.zeroToSix = { 0: "0", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6" };
    }
    
    if (["talent", "mutation", "maneuver", "weapon"].includes(itemData.type)) {
      context.bloodlines = {
        "Human": "Human",
        "Demon": "Demon",
        "Elf": "Elf",
        "Fay": "Fay",
        "Dragon": "Dragon"
      };

      context.joinedPrereqAttributes = (itemData.system.prerequisites_attributes || []).join(", ");
      context.joinedPrereqSkills = (itemData.system.prerequisites_skills || []).join(", ");
      context.joinedPrereqTalents = (itemData.system.prerequisites_talents || []).join(", ");
      context.joinedPrereqMutations = (itemData.system.prerequisites_mutations || []).join(", ");
      context.joinedPrereqBloodlines = (itemData.system.prerequisites_bloodlines || []).join(", ");
      context.joinedAddsManeuvers = (itemData.system.adds_maneuvers || []).join(", ");
    }
    
    if (itemData.type === "talent" || itemData.type === "mutation") {
      context.talentSubtypes = {
        "passive": "Пассивный",
        "narrative": "Нарративный",
        "active": "Активный"
      };
      
      if (itemData.type === "mutation") {
        context.mutationTypes = {
          "useful": "Полезная",
          "neutral": "Нейтральная",
          "harmful": "Вредная"
        };
      }
    }
    
    if (itemData.type === "maneuver") {
      context.maneuverSources = {
        "basic": "Базовый",
        "talent": "Талант",
        "mutation": "Мутация"
      };
      context.actionTypes = {
        "action": "Действие",
        "reaction": "Реакция",
        "free": "Свободное",
        "chain": "Цепное"
      };
      context.joinedActionType = (itemData.system.action_type || [])[0];
      context.joinedChainTriggers = (itemData.system.chain_trigger_maneuvers || []).join(", ");
      
      context.targetTypes = {
        "self": "На себя",
        "creature": "Существо",
        "point": "Точка",
        "area": "Область"
      };
      context.templateShapes = {
        "": "Нет",
        "square": "Квадрат",
        "circle": "Круг",
        "cone": "Конус",
        "line": "Линия"
      };
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

  _prepareSubmitData(event, form, formData) {
    const data = super._prepareSubmitData(event, form, formData);
    
    if (["talent", "mutation", "maneuver", "weapon"].includes(this.document.type)) {
      const arrayFields = [
        "system.prerequisites_attributes",
        "system.prerequisites_skills",
        "system.prerequisites_talents",
        "system.prerequisites_mutations",
        "system.prerequisites_bloodlines",
        "system.adds_maneuvers",
        "system.action_type",
        "system.chain_trigger_maneuvers"
      ];
      for (const field of arrayFields) {
        if (typeof data[field] === "string") {
          data[field] = data[field].split(",").map(s => s.trim()).filter(s => s.length > 0);
        }
      }
    }
    
    return data;
  }

  static #onChangeTab(event, target) {
    const tab = target.dataset.tab;
    const group = target.dataset.group || "primary";
    this.changeTab(tab, group, { event });
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
}
