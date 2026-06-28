const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
/**
 * Основной класс Листа Предмета для системы Dedrel.
 * Наследуется от нового Foundry V2 Application Framework (ItemSheetV2).
 * Обрабатывает логику отображения и сохранения данных предмета.
 */
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
      editImage: DedrelItemSheet.#onEditImage,
      addEffect: DedrelItemSheet.#onAddEffect,
      editEffect: DedrelItemSheet.#onEditEffect,
      deleteEffect: DedrelItemSheet.#onDeleteEffect
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
        { id: "details", label: "DEDREL.ItemSheet.Tabs.Details" },
        { id: "description", label: "DEDREL.ItemSheet.Tabs.Description" },
        { id: "effects", label: "DEDREL.ItemSheet.Tabs.Effects" }
      ],
      initial: "description",
      navSelector: ".tabs[data-group='primary']",
      contentSelector: ".sheet-body"
    }
  };
  /**
   * Подготовка данных для передачи в Handlebars шаблоны.
   * Формирует списки выбора (select) и подготавливает массивы в строки для инпутов.
   */
  async _prepareContext(options) {
    console.log("Dedrel | DedrelItemSheet _prepareContext start for item:", this.document.name, this.document.id);
    const context = await super._prepareContext(options);
    const itemData = this.document;
    
    // Обогащаем HTML описание, чтобы работали секретные блоки и броски кубиков в тексте
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
        "unarmed_combat": game.i18n.localize("DEDREL.Skills.unarmed_combat"),
        "pole_weapons": game.i18n.localize("DEDREL.Skills.pole_weapons"),
        "blunt_weapons": game.i18n.localize("DEDREL.Skills.blunt_weapons"),
        "artillery": game.i18n.localize("DEDREL.Skills.artillery"),
        "firearms": game.i18n.localize("DEDREL.Skills.firearms"),
        "throwing": game.i18n.localize("DEDREL.Skills.throwing"),
        "exotic_weapons": game.i18n.localize("DEDREL.Skills.exotic_weapons"),
        "magical_attacks": game.i18n.localize("DEDREL.Skills.magical_attacks"),
        "bows": game.i18n.localize("DEDREL.Skills.bows"),
        "bladed_weapons": game.i18n.localize("DEDREL.Skills.bladed_weapons")
      };
      context.damageTypes = {
        "slashing": game.i18n.localize("DEDREL.ItemSheet.Slashing"),
        "bludgeoning": game.i18n.localize("DEDREL.ItemSheet.Bludgeoning"),
        "piercing": game.i18n.localize("DEDREL.ItemSheet.Piercing")
      };
      context.zeroToThree = { 0: "0", 1: "1", 2: "2", 3: "3" };
      context.zeroToSix = { 0: "0", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6" };
    }
    
    if (itemData.type === "armor") {
      context.armorSlots = {
        "lower": game.i18n.localize("DEDREL.ArmorSlots.lower"),
        "middle": game.i18n.localize("DEDREL.ArmorSlots.middle"),
        "upper": game.i18n.localize("DEDREL.ArmorSlots.upper"),
        "universal": game.i18n.localize("DEDREL.ArmorSlots.universal")
      };
      context.weightClasses = {
        "light": game.i18n.localize("DEDREL.WeightClasses.light"),
        "medium": game.i18n.localize("DEDREL.WeightClasses.medium"),
        "heavy": game.i18n.localize("DEDREL.WeightClasses.heavy")
      };
    }
    
    if (["talent", "mutation", "maneuver", "weapon"].includes(itemData.type)) {
      context.bloodlines = {
        "Human": game.i18n.localize("DEDREL.Bloodline.human"),
        "Demon": game.i18n.localize("DEDREL.Bloodline.demon"),
        "Elf": game.i18n.localize("DEDREL.Bloodline.elf"),
        "Fay": game.i18n.localize("DEDREL.Bloodline.fay"),
        "Dragon": game.i18n.localize("DEDREL.Bloodline.dragon")
      };

      context.joinedPrereqAttributes = (itemData.system.prerequisites_attributes || []).join("; ");
      context.joinedPrereqSkills = (itemData.system.prerequisites_skills || []).join("; ");
      context.joinedPrereqTalents = (itemData.system.prerequisites_talents || []).join("; ");
      context.joinedPrereqMutations = (itemData.system.prerequisites_mutations || []).join("; ");
      context.joinedPrereqBloodlines = (itemData.system.prerequisites_bloodlines || []).join("; ");
      context.joinedAddsItems = (itemData.system.adds_items || []).join("; ");
    }
    
    if (itemData.type === "talent" || itemData.type === "mutation") {
      context.talentSubtypes = {
        "passive": game.i18n.localize("DEDREL.TalentSubtypes.passive"),
        "narrative": game.i18n.localize("DEDREL.TalentSubtypes.narrative"),
        "active": game.i18n.localize("DEDREL.TalentSubtypes.active")
      };
      
      if (itemData.type === "mutation") {
        context.mutationTypes = {
          "useful": game.i18n.localize("DEDREL.MutationTypes.useful"),
          "neutral": game.i18n.localize("DEDREL.MutationTypes.neutral"),
          "harmful": game.i18n.localize("DEDREL.MutationTypes.harmful")
        };
      }
    }
    
    if (itemData.type === "maneuver") {
      context.maneuverSources = {
        "basic": game.i18n.localize("DEDREL.ManeuverSources.basic"),
        "talent": game.i18n.localize("DEDREL.ManeuverSources.talent"),
        "mutation": game.i18n.localize("DEDREL.ManeuverSources.mutation")
      };
      context.actionTypes = {
        "action": game.i18n.localize("DEDREL.ActionTypes.action"),
        "reaction": game.i18n.localize("DEDREL.ActionTypes.reaction"),
        "free": game.i18n.localize("DEDREL.ActionTypes.free"),
        "chain": game.i18n.localize("DEDREL.ActionTypes.chain")
      };
      context.joinedActionType = (itemData.system.action_type || [])[0];
      context.joinedChainTriggers = (itemData.system.chain_trigger_maneuvers || []).join("; ");
      
      context.targetTypes = {
        "self": game.i18n.localize("DEDREL.TargetTypes.self"),
        "creature": game.i18n.localize("DEDREL.TargetTypes.creature"),
        "point": game.i18n.localize("DEDREL.TargetTypes.point"),
        "area": game.i18n.localize("DEDREL.TargetTypes.area")
      };
      context.templateShapes = {
        "": game.i18n.localize("DEDREL.TemplateShapes.none"),
        "square": game.i18n.localize("DEDREL.TemplateShapes.square"),
        "circle": game.i18n.localize("DEDREL.TemplateShapes.circle"),
        "cone": game.i18n.localize("DEDREL.TemplateShapes.cone"),
        "line": game.i18n.localize("DEDREL.TemplateShapes.line")
      };
    }
    
    if (itemData.type === "condition") {
      context.conditionCategories = {
        "negative": game.i18n.localize("DEDREL.ConditionCategories.negative"),
        "neutral": game.i18n.localize("DEDREL.ConditionCategories.neutral"),
        "positive": game.i18n.localize("DEDREL.ConditionCategories.positive"),
        "technical": game.i18n.localize("DEDREL.ConditionCategories.technical")
      };
      context.durationUnits = {
        "rounds": game.i18n.localize("DEDREL.DurationUnits.rounds"),
        "turns": game.i18n.localize("DEDREL.DurationUnits.turns"),
        "seconds": game.i18n.localize("DEDREL.DurationUnits.seconds"),
        "minutes": game.i18n.localize("DEDREL.DurationUnits.minutes"),
        "hours": game.i18n.localize("DEDREL.DurationUnits.hours"),
        "days": game.i18n.localize("DEDREL.DurationUnits.days"),
        "permanent": game.i18n.localize("DEDREL.DurationUnits.permanent")
      };
      context.joinedExpiryEvents = (itemData.system.expiry_events || []).join("; ");
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

  /**
   * Обработчик перед сохранением формы.
   * Конвертирует строковые значения с запятыми (введённые пользователем) обратно в массивы для DataModel.
   */
  _prepareSubmitData(event, form, formData) {
    const data = super._prepareSubmitData(event, form, formData);
    
    if (["talent", "mutation", "maneuver", "weapon"].includes(this.document.type)) {
      const arrayFields = [
        "system.prerequisites_attributes",
        "system.prerequisites_skills",
        "system.prerequisites_talents",
        "system.prerequisites_mutations",
        "system.prerequisites_bloodlines",
        "system.adds_items",
        "system.action_type",
        "system.chain_trigger_maneuvers"
      ];
      for (const field of arrayFields) {
        let val = data[field];
        if (Array.isArray(val) && val.length === 1 && typeof val[0] === "string") {
          val = val[0];
        }
        if (typeof val === "string") {
          data[field] = val.split(";").map(s => s.trim()).filter(s => s.length > 0);
        }
      }
    }
    
    if (this.document.type === "condition") {
      let events = data["system.expiry_events"];
      if (Array.isArray(events) && events.length === 1 && typeof events[0] === "string") {
        events = events[0];
      }
      if (typeof events === "string") {
        data["system.expiry_events"] = events.split(";").map(s => s.trim()).filter(s => s.length > 0);
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

  static async #onAddEffect(event, target) {
    return ActiveEffect.implementation.create({
      name: "Новый Эффект",
      icon: "icons/svg/aura.svg",
      origin: this.document.uuid
    }, { parent: this.document });
  }

  static async #onEditEffect(event, target) {
    const effectId = target.closest(".effect-item").dataset.effectId;
    const effect = this.document.effects.get(effectId);
    if (effect) return effect.sheet.render(true);
  }

  static async #onDeleteEffect(event, target) {
    const effectId = target.closest(".effect-item").dataset.effectId;
    const effect = this.document.effects.get(effectId);
    if (effect) return effect.delete();
  }
}
