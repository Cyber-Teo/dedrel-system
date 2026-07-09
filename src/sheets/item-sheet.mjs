const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
import { placeTemplatePreview } from "../canvas/template.mjs";
import { DR_KEY_LABELS, ITEM_RARITY_ENUM } from "../constants.mjs";

// Типы предметов с общими «физическими» полями (редкость/вес/цена/количество).
// Для них рендерится общий блок details-physical.hbs.
const PHYSICAL_ITEM_TYPES = ["weapon", "armor", "ammunition", "magic_item", "loot", "trade_good", "potion", "scroll", "craft_material", "quest_item"];
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
      openInConstructor: DedrelItemSheet.#onOpenInConstructor,
      addEffect: DedrelItemSheet.#onAddEffect,
      editEffect: DedrelItemSheet.#onEditEffect,
      deleteEffect: DedrelItemSheet.#onDeleteEffect,
      toggleEffectSelf: DedrelItemSheet.#onToggleEffectSelf,
      toggleEffectAuraPayload: DedrelItemSheet.#onToggleEffectAuraPayload,
      configureEffectAura: DedrelItemSheet.#onConfigureEffectAura,
      placeTemplate: DedrelItemSheet.#onPlaceTemplate
    }
  };

  /** Кнопка заголовка "Открыть в конструкторе" — только для собранных заклинаний. */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    if (this.document.type === "spell" && this.document.system.doctrine) {
      controls.unshift({
        icon: "fa-solid fa-wand-sparkles",
        label: "DEDREL.Magic.UI.OpenConstructor",
        action: "openInConstructor"
      });
    }
    return controls;
  }

  static #onOpenInConstructor() {
    // Актор-владелец (embedded) или standalone для мировых предметов (ГМ)
    game.dedrel.openSpellConstructor(this.document.actor || null, this.document);
  }

  static PARTS = {
    header: { template: "systems/dedrel/templates/item/parts/item-header.hbs" },
    navigation: { template: "systems/dedrel/templates/item/parts/item-navigation.hbs" },
    details: { template: "systems/dedrel/templates/item/parts/item-details.hbs" },
    description: { template: "systems/dedrel/templates/item/parts/item-description.hbs" },
    effects: { template: "systems/dedrel/templates/item/parts/item-effects.hbs" }
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
    
    if (itemData.type === "weapon" || itemData.type === "maneuver" || itemData.type === "spell") {
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
      context.allSkills = {
        "crossbows": game.i18n.localize("DEDREL.Skills.crossbows"),
        "unarmed_combat": game.i18n.localize("DEDREL.Skills.unarmed_combat"),
        "pole_weapons": game.i18n.localize("DEDREL.Skills.pole_weapons"),
        "blunt_weapons": game.i18n.localize("DEDREL.Skills.blunt_weapons"),
        "artillery": game.i18n.localize("DEDREL.Skills.artillery"),
        "firearms": game.i18n.localize("DEDREL.Skills.firearms"),
        "throwing": game.i18n.localize("DEDREL.Skills.throwing"),
        "exotic_weapons": game.i18n.localize("DEDREL.Skills.exotic_weapons"),
        "magical_attacks": game.i18n.localize("DEDREL.Skills.magical_attacks"),
        "bows": game.i18n.localize("DEDREL.Skills.bows"),
        "bladed_weapons": game.i18n.localize("DEDREL.Skills.bladed_weapons"),
        "armor_use": game.i18n.localize("DEDREL.Skills.armor_use"),
        "cultural_awareness": game.i18n.localize("DEDREL.Skills.cultural_awareness"),
        "knowledge": game.i18n.localize("DEDREL.Skills.knowledge"),
        "logic_reasoning": game.i18n.localize("DEDREL.Skills.logic_reasoning"),
        "interpretation": game.i18n.localize("DEDREL.Skills.interpretation"),
        "research": game.i18n.localize("DEDREL.Skills.research"),
        "craftsmanship": game.i18n.localize("DEDREL.Skills.craftsmanship"),
        "stealth": game.i18n.localize("DEDREL.Skills.stealth"),
        "healing": game.i18n.localize("DEDREL.Skills.healing"),
        "survival": game.i18n.localize("DEDREL.Skills.survival"),
        "engineering": game.i18n.localize("DEDREL.Skills.engineering"),
        "atletism": game.i18n.localize("DEDREL.Skills.atletism"),
        "persuasion": game.i18n.localize("DEDREL.Skills.persuasion"),
        "insight": game.i18n.localize("DEDREL.Skills.insight"),
        "deception": game.i18n.localize("DEDREL.Skills.deception"),
        "intimidation": game.i18n.localize("DEDREL.Skills.intimidation"),
        "performance": game.i18n.localize("DEDREL.Skills.performance")
      };
      context.damageTypes = {
        "slashing": game.i18n.localize("DEDREL.ItemSheet.Slashing"),
        "bludgeoning": game.i18n.localize("DEDREL.ItemSheet.Bludgeoning"),
        "piercing": game.i18n.localize("DEDREL.ItemSheet.Piercing")
      };
      context.zeroToThree = { 0: "0", 1: "1", 2: "2", 3: "3" };
      context.zeroToSix = { 0: "0", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6" };
      
      context.ammoOptions = { "": "None" };
      if (this.document.actor) {
        this.document.actor.items.forEach(i => {
          if (i.type === "ammunition" || i.type === "weapon") {
            if (i.id !== this.document.id) {
              context.ammoOptions[i.id] = `${i.name} (${i.system.quantity || 0})`;
            }
          }
        });
      }
    }
    
    context.hasQuantity = itemData.system.quantity !== undefined;

    // Общий блок физических полей (редкость/вес/цена/стакаемость)
    context.isPhysical = PHYSICAL_ITEM_TYPES.includes(itemData.type);
    if (context.isPhysical || itemData.type === "service") {
      context.rarityOptions = {};
      for (const r of ITEM_RARITY_ENUM) context.rarityOptions[r] = game.i18n.localize(`DEDREL.Rarity.${r}`);
    }
    if (context.isPhysical) {
      context.hasStackable = itemData.system.stackable !== undefined;
    }

    // Аксессуарный слот (для типов, поддерживающих system.equip_slot)
    context.hasEquipSlot = ["armor", "magic_item", "loot"].includes(itemData.type);
    if (context.hasEquipSlot) {
      context.equipSlotOptions = {
        "": game.i18n.localize("DEDREL.EquipSlot.none"),
        head: game.i18n.localize("DEDREL.EquipSlot.head"),
        neck: game.i18n.localize("DEDREL.EquipSlot.neck"),
        torso: game.i18n.localize("DEDREL.EquipSlot.torso"),
        hand: game.i18n.localize("DEDREL.EquipSlot.hand")
      };
    }

    // Валюта: деноминация выбирается из списка валют мира
    if (itemData.type === "currency") {
      context.currencyOptions = { "": "—" };
      try {
        const defs = game.settings.get("dedrel", "currencies") || [];
        for (const def of defs) context.currencyOptions[def.key] = `${def.name} (${def.key})`;
      } catch (e) {}
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
    
    if (["talent", "mutation", "maneuver", "weapon", "spell"].includes(itemData.type)) {
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
    
    if (itemData.type === "maneuver" || itemData.type === "spell") {
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
      
      const aType = itemData.system.action_type || {};
      context.actionTypeChecked = {
        action: !!aType.action,
        reaction: !!aType.reaction,
        free: !!aType.free,
        chain: !!aType.chain
      };

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
      context.tickTriggers = {
        "turnStart": game.i18n.localize("DEDREL.Condition.TickTriggers.turnStart"),
        "turnEnd": game.i18n.localize("DEDREL.Condition.TickTriggers.turnEnd")
      };
      context.tickDamageTypes = {
        "": game.i18n.localize("DEDREL.Condition.TickNoDR")
      };
      for (const [key, label] of Object.entries(DR_KEY_LABELS)) {
        context.tickDamageTypes[key] = game.i18n.localize(label);
      }
    }

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

  /**
   * Обработчик перед сохранением формы.
   * Конвертирует строковые значения с запятыми (введённые пользователем) обратно в массивы для DataModel.
   */
  _prepareSubmitData(event, form, formData) {
    const data = super._prepareSubmitData(event, form, formData);
    
    if (["talent", "mutation", "maneuver", "weapon", "spell"].includes(this.document.type)) {
      const arrayFields = [
        "system.prerequisites_attributes",
        "system.prerequisites_skills",
        "system.prerequisites_talents",
        "system.prerequisites_mutations",
        "system.prerequisites_bloodlines",
        "system.adds_items",
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
    if (!effect) return;
    // Подтверждение против мискликов: удаление эффекта с предмета необратимо
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("DEDREL.Notifications.DeleteEffectTitle") },
      content: `<p>${game.i18n.format("DEDREL.Notifications.DeleteItemEffectConfirm", { name: effect.name, item: this.document.name })}</p>`,
      modal: true
    });
    if (confirmed) return effect.delete();
  }

  /**
   * Переключает режим self-эффекта (flags.dedrel.applyTo = "self").
   * Такой эффект применяется к владельцу в момент использования предмета,
   * с подстановкой @spentAp / @apCost / @overspent (см. Item#_applySelfEffects).
   */
  static async #onToggleEffectSelf(event, target) {
    const effectId = target.closest(".effect-item").dataset.effectId;
    const effect = this.document.effects.get(effectId);
    if (!effect) return;
    if (effect.getFlag("dedrel", "applyTo") === "self") {
      // V14: удаление ключа — через ForcedDeletion (_del), легаси "-=key" deprecated
      await effect.update({ "flags.dedrel.applyTo": _del, transfer: true });
    } else {
      // transfer: false обязателен: иначе шаблон с сырыми плейсхолдерами (@spentAp)
      // пассивно применялся бы к владельцу постоянно, давая NaN в параметрах.
      await effect.update({ "flags.dedrel.applyTo": "self", transfer: false });
    }
  }

  /**
   * Переключает режим payload-эффекта ауры (flags.dedrel.applyTo = "aura").
   * Такой эффект не применяется к владельцу и не попадает в кнопку чата:
   * его вешает регион-аура на токены в зоне (см. src/canvas/aura-regions.mjs).
   */
  static async #onToggleEffectAuraPayload(event, target) {
    const effectId = target.closest(".effect-item").dataset.effectId;
    const effect = this.document.effects.get(effectId);
    if (!effect) return;
    if (effect.getFlag("dedrel", "applyTo") === "aura") {
      await effect.update({ "flags.dedrel.applyTo": _del, transfer: true });
    } else {
      // transfer: false обязателен: payload не должен пассивно висеть на владельце
      await effect.update({ "flags.dedrel.applyTo": "aura", transfer: false });
    }
  }

  /**
   * Диалог настройки эффекта-маркера ауры (flags.dedrel.aura).
   * Радиус > 0 включает ауру: вокруг токена владельца появится регион-эманация,
   * который вешает payload-эффекты этого предмета на токены в зоне.
   */
  static async #onConfigureEffectAura(event, target) {
    const effectId = target.closest(".effect-item").dataset.effectId;
    const effect = this.document.effects.get(effectId);
    if (!effect) return;

    const aura = effect.getFlag("dedrel", "aura") ?? {};
    const dispositions = {
      all: game.i18n.localize("DEDREL.Aura.Dispositions.all"),
      friendly: game.i18n.localize("DEDREL.Aura.Dispositions.friendly"),
      hostile: game.i18n.localize("DEDREL.Aura.Dispositions.hostile")
    };
    const dispositionOptions = Object.entries(dispositions).map(([key, label]) =>
      `<option value="${key}" ${key === (aura.disposition ?? "all") ? "selected" : ""}>${label}</option>`
    ).join("");

    // Для свежей ауры (флага ещё нет) чекбокс включён независимо от disabled:
    // иначе ранее выключенный эффект молча сохранит disabled и аура "не заработает"
    const enabledChecked = !(Number(aura.radius) > 0) || !effect.disabled;
    const content = `
      <div class="form-group">
        <label>${game.i18n.localize("DEDREL.ItemSheet.AuraEnabled")}</label>
        <input type="checkbox" name="enabled" ${enabledChecked ? "checked" : ""}/>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("DEDREL.ItemSheet.AuraRadius")}</label>
        <input type="number" name="radius" min="0" step="0.5" value="${Number(aura.radius) || 0}"/>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("DEDREL.ItemSheet.AuraDisposition")}</label>
        <select name="disposition">${dispositionOptions}</select>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("DEDREL.ItemSheet.AuraIncludeSelf")}</label>
        <input type="checkbox" name="includeSelf" ${aura.includeSelf ? "checked" : ""}/>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("DEDREL.ItemSheet.AuraColor")}</label>
        <color-picker name="color" value="${aura.color ?? ""}"></color-picker>
      </div>
      <p class="hint">${game.i18n.localize("DEDREL.ItemSheet.AuraConfigHint")}</p>
    `;

    const { DialogV2 } = foundry.applications.api;
    await DialogV2.wait({
      window: { title: game.i18n.format("DEDREL.ItemSheet.AuraConfigTitle", { name: effect.name }) },
      position: { width: 420 },
      content,
      buttons: [
        {
          action: "save",
          icon: "fa-solid fa-check",
          label: game.i18n.localize("DEDREL.Chat.Confirm"),
          default: true,
          callback: async (event, button, dialog) => {
            const html = dialog.element;
            const radius = parseFloat(html.querySelector('[name="radius"]')?.value) || 0;
            if (radius <= 0) {
              await effect.update({ "flags.dedrel.aura": _del });
              return;
            }
            const color = html.querySelector('[name="color"]')?.value || null;
            await effect.update({
              "flags.dedrel.aura": {
                radius,
                disposition: html.querySelector('[name="disposition"]')?.value ?? "all",
                includeSelf: html.querySelector('[name="includeSelf"]')?.checked ?? false,
                color
              },
              // Маркер "чистый": transfer: false — сам он ни на кого не действует
              // (носитель получает payload через includeSelf тем же путём, что и
              // остальные), поэтому не оставляет статус-иконку на актёре.
              "flags.dedrel.applyTo": _del,
              transfer: false,
              disabled: !(html.querySelector('[name="enabled"]')?.checked ?? true)
            });
          }
        }
      ]
    });
  }

  static async #onPlaceTemplate(event, target) {
    let shape = this.document.system.template_shape;
    const size = parseFloat(this.document.system.template_size) || 0;
    
    if (!shape || size <= 0) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.InvalidTemplateData"));
    
    if (shape === "square") shape = "rect";
    if (shape === "line") shape = "ray";

    const templateData = {
      t: shape,
      distance: size,
      user: game.user.id,
      fillColor: game.user.color
    };

    if (shape === "ray") {
      templateData.width = canvas.scene.grid.distance;
    } else if (shape === "rect") {
      templateData.direction = 45;
      templateData.distance = Math.hypot(size, size);
    }

    placeTemplatePreview(templateData);
  }
}
