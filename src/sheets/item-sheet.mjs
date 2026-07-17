const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
import { placeTemplatePreview } from "../canvas/template.mjs";
import { DR_KEY_LABELS, ITEM_RARITY_ENUM, CRAFT_DISCIPLINE_ENUM, MATERIAL_CLASS_ENUM, SLOT_TIER_ENUM, AMMO_TYPE_ENUM, AMMO_TYPE_LABELS } from "../constants.mjs";
import { buildEffectData, buildTokenLightChanges, hasTokenLightChanges, readTokenLightChanges, stripTokenLightChanges } from "../config/effect-library.mjs";
import { getRangedClass, ammoMatchesWeapon } from "../utils/ranged.mjs";

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
      addEffectFromLibrary: DedrelItemSheet.#onAddEffectFromLibrary,
      editEffect: DedrelItemSheet.#onEditEffect,
      deleteEffect: DedrelItemSheet.#onDeleteEffect,
      toggleEffectSelf: DedrelItemSheet.#onToggleEffectSelf,
      toggleEffectAuraPayload: DedrelItemSheet.#onToggleEffectAuraPayload,
      configureEffectAura: DedrelItemSheet.#onConfigureEffectAura,
      configureEffectLight: DedrelItemSheet.#onConfigureEffectLight,
      placeTemplate: DedrelItemSheet.#onPlaceTemplate,
      deleteCraftIngredient: DedrelItemSheet.#onDeleteCraftIngredient,
      recomputeCraftPrice: DedrelItemSheet.#onRecomputeCraftPrice,
      useAmmo: DedrelItemSheet.#onUseAmmo
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

  /**
   * Кнопка «Использовать» на вкладке боеприпасов оружия: назначает боеприпас
   * активным (system.consume_target). Повторный клик по активному — снимает выбор.
   */
  static async #onUseAmmo(event, target) {
    const ammoId = target.dataset.ammoId;
    if (!ammoId) return;
    const current = this.document.system.consume_target;
    await this.document.update({ "system.consume_target": current === ammoId ? "" : ammoId });
  }

  static PARTS = {
    header: { template: "systems/dedrel/templates/item/parts/item-header.hbs" },
    navigation: { template: "systems/dedrel/templates/item/parts/item-navigation.hbs" },
    details: { template: "systems/dedrel/templates/item/parts/item-details.hbs" },
    ammunition: { template: "systems/dedrel/templates/item/parts/item-ammunition.hbs" },
    description: { template: "systems/dedrel/templates/item/parts/item-description.hbs" },
    effects: { template: "systems/dedrel/templates/item/parts/item-effects.hbs" },
    crafting: { template: "systems/dedrel/templates/item/parts/item-crafting.hbs" }
  };

  get title() {
    return this.document.name;
  }

  static TABS = {
    primary: {
      tabs: [
        { id: "details", label: "DEDREL.ItemSheet.Tabs.Details" },
        { id: "ammunition", label: "DEDREL.ItemSheet.Tabs.Ammunition" },
        { id: "description", label: "DEDREL.ItemSheet.Tabs.Description" },
        { id: "effects", label: "DEDREL.ItemSheet.Tabs.Effects" },
        { id: "crafting", label: "DEDREL.ItemSheet.Tabs.Crafting" }
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

    // Вкладка «Эффекты»: строки с вычисленными признаками для подсветки кнопок
    // (свет хранится change-строками token.light.*, из шаблона его не увидеть)
    context.effectRows = itemData.effects.map(e => ({
      effect: e,
      hasLight: hasTokenLightChanges(e)
    }));

    // Тип существа: пресеты ключей для дружелюбного выбора (список расширяемый).
    if (itemData.type === "creature_type") {
      const keys = CONFIG.DEDREL?.creatureTypes || [];
      context.creatureTypeOptions = keys.map(k => ({ key: k, label: `DEDREL.CreatureTypes.${k}` }));
      context.creatureTypeIsPreset = keys.includes(itemData.system.key);
    }

    // Оружие и боеприпас: строки «бонус против типа существа» (сила 0-10 на тип).
    if (itemData.type === "weapon" || itemData.type === "ammunition") {
      const keys = CONFIG.DEDREL?.creatureTypes || [];
      const vs = itemData.system.vs_creature || {};
      context.vsCreatureRows = keys.map(k => ({ key: k, label: `DEDREL.CreatureTypes.${k}`, value: Number(vs[k]) || 0 }));
    }

    // Боеприпас: селекты типа боеприпаса и типа доп. урона (любой ключ Лестницы).
    if (itemData.type === "ammunition") {
      context.ammoTypeOptions = {};
      for (const t of AMMO_TYPE_ENUM) context.ammoTypeOptions[t] = game.i18n.localize(AMMO_TYPE_LABELS[t]);
      context.damageTypeOptions = { "": "—" };
      for (const [k, labelKey] of Object.entries(DR_KEY_LABELS)) context.damageTypeOptions[k] = game.i18n.localize(labelKey);
    }
    
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
        "crossbows": game.i18n.localize("DEDREL.Skills.crossbows"),
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
        "perception": game.i18n.localize("DEDREL.Skills.perception"),
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
      context.oneToThree = { 1: "1", 2: "2", 3: "3" };
      context.zeroToSix = { 0: "0", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6" };
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

    // Вкладка встроенного чертежа (system.crafting): только для ГМа, чтобы
    // игрок не видел рецепт предмета из своего инвентаря
    context.showCrafting = context.isPhysical && game.user.isGM && itemData.system.crafting !== undefined;
    if (context.showCrafting) {
      context.craftDisciplineOptions = { "": "—" };
      for (const d of CRAFT_DISCIPLINE_ENUM) {
        context.craftDisciplineOptions[d] = game.i18n.localize(`DEDREL.CraftDisciplines.${d}`);
      }
    } else {
      delete context.tabs.crafting;
    }

    // Вкладка «Боеприпасы»: только на оружии, распознанном как лук/арбалет/огнестрел
    // (getRangedClass отсекает метательное и ближнее). Список — совместимые боеприпасы
    // с актёра-владельца; активный отмечен (== consume_target).
    const rangedClass = itemData.type === "weapon" ? getRangedClass(itemData) : null;
    context.showAmmoTab = !!rangedClass;
    if (context.showAmmoTab) {
      context.rangedClassLabel = game.i18n.localize(`DEDREL.Ammo.Class.${rangedClass.class}`);
      context.ammoTypeLabel = game.i18n.localize(AMMO_TYPE_LABELS[rangedClass.ammo]);
      const activeId = itemData.system.consume_target;
      const list = [];
      if (itemData.actor) {
        for (const i of itemData.actor.items) {
          if (ammoMatchesWeapon(i, itemData)) {
            list.push({ id: i.id, name: i.name, img: i.img, quantity: i.system.quantity || 0, active: i.id === activeId });
          }
        }
      }
      context.ammoList = list;
    } else {
      delete context.tabs.ammunition;
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

    // Ремесленный материал: класс, применимость, магоёмкость (слоты)
    if (itemData.type === "craft_material") {
      context.materialClassOptions = {};
      for (const c of MATERIAL_CLASS_ENUM) {
        context.materialClassOptions[c] = game.i18n.localize(`DEDREL.MaterialClass.${c}`);
      }
      // Магоёмкость: материал даёт 0 или 1 слот (колонка Slots в materials.csv —
      // всегда «no» либо «<цвет> 1»), поэтому редактор — простой выбор тира.
      context.materialSlotOptions = { "": game.i18n.localize("DEDREL.SlotTiers.none") };
      for (const t of SLOT_TIER_ENUM) {
        context.materialSlotOptions[t] = game.i18n.localize(`DEDREL.SlotTiers.${t}`);
      }
      context.materialSlot = (itemData.system.slots || [])[0] ?? "";
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
      context.joinedReqWeaponKeys = (itemData.system.req_weapon_keys || []).join("; ");
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
    this.#bindCraftingListeners();
  }

  /**
   * Слушатели блока «Крафт»: дроп предмета-ингредиента и правка количества.
   * Инпуты количеств и слотов материала НАМЕРЕННО без name: массивы нельзя
   * доверять FormDataExtended (см. FOUNDRY V14 QUIRKS §7) — обновляем массив
   * целиком через document.update.
   */
  #bindCraftingListeners() {
    const root = this.element;
    if (!root) return;

    const zone = root.querySelector("[data-drop='craft-ingredient']");
    if (zone) {
      zone.addEventListener("dragover", ev => ev.preventDefault());
      zone.addEventListener("drop", ev => this.#onDropCraftIngredient(ev));
    }

    for (const input of root.querySelectorAll(".craft-ingredient-amount")) {
      input.addEventListener("change", ev => {
        ev.stopPropagation();
        const idx = Number(ev.currentTarget.dataset.ingredientIndex);
        const ingredients = this.document.system.crafting.ingredients.map(i => ({ ...i }));
        if (!ingredients[idx]) return;
        ingredients[idx].amount = Math.max(0, parseFloat(ev.currentTarget.value) || 0);
        this.document.update({ "system.crafting.ingredients": ingredients });
      });
    }

    // Магоёмкость материала: выбор тира. Поле в схеме — массив (счётчик слотов
    // выражается повтором тира), поэтому пишем [] или [тир].
    const slotsInput = root.querySelector(".material-slots-field");
    if (slotsInput) {
      slotsInput.addEventListener("change", ev => {
        ev.stopPropagation();
        const tier = ev.currentTarget.value;
        this.document.update({ "system.slots": SLOT_TIER_ENUM.includes(tier) ? [tier] : [] });
      });
    }
  }

  /** Дроп предмета в состав чертежа: добавляет ингредиент (или +1 меру). */
  async #onDropCraftIngredient(event) {
    event.preventDefault();
    if (!game.user.isGM || !this.isEditable) return;
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch (err) {
      return;
    }
    if (data.type !== "Item") return;
    const dropped = await Item.implementation.fromDropData(data);
    if (!dropped) return;
    if (dropped.uuid === this.document.uuid) {
      return ui.notifications.warn(game.i18n.localize("DEDREL.Crafting.SelfIngredient"));
    }
    if (dropped.system?.base_price === undefined) {
      return ui.notifications.warn(game.i18n.localize("DEDREL.Crafting.NotPhysicalIngredient"));
    }
    const ingredients = this.document.system.crafting.ingredients.map(i => ({ ...i }));
    const existing = ingredients.find(i => i.uuid === dropped.uuid);
    if (existing) existing.amount += 1;
    else ingredients.push({ uuid: dropped.uuid, name: dropped.name, amount: 1 });
    await this.document.update({ "system.crafting.ingredients": ingredients });
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
        "system.chain_trigger_maneuvers",
        "system.req_weapon_keys"
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
      name: game.i18n.localize("DEDREL.ItemSheet.NewEffect"),
      icon: "icons/svg/aura.svg",
      origin: this.document.uuid
    }, { parent: this.document });
  }

  /**
   * Пикер библиотеки эффектов: выбор готового пресета (CONFIG.DEDREL.effectLibrary)
   * и штамповка его как Active Effect на предмете. Избавляет от ручной сборки
   * баффов/ядов/сопротивлений с нуля. См. src/config/effect-library.mjs.
   */
  static async #onAddEffectFromLibrary(event, target) {
    const item = this.document;
    const lib = CONFIG.DEDREL?.effectLibrary || {};
    const keys = Object.keys(lib);
    if (keys.length === 0) return ui.notifications.warn(game.i18n.localize("DEDREL.EffectLib.Empty"));

    // Группируем пресеты по категории (buff/debuff/...) для читаемого списка
    const byCat = {};
    for (const key of keys) {
      const cat = lib[key].category || "other";
      (byCat[cat] ??= []).push(key);
    }
    const optgroups = Object.entries(byCat).map(([cat, catKeys]) => {
      const catLabel = game.i18n.localize(`DEDREL.EffectLib.Cat.${cat}`);
      const options = catKeys.map(k =>
        `<option value="${k}">${foundry.utils.escapeHTML(game.i18n.localize(lib[k].label))}</option>`
      ).join("");
      return `<optgroup label="${foundry.utils.escapeHTML(catLabel)}">${options}</optgroup>`;
    }).join("");

    const content = `
      <div class="form-group" style="margin-bottom: 10px;">
        <label style="font-weight: bold; display: block; margin-bottom: 4px;">${game.i18n.localize("DEDREL.EffectLib.PickLabel")}</label>
        <select name="preset" style="width: 100%; padding: 4px;">${optgroups}</select>
      </div>`;

    await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("DEDREL.EffectLib.PickTitle") },
      content,
      buttons: [
        {
          action: "add",
          icon: "fa-solid fa-plus",
          label: game.i18n.localize("DEDREL.ItemSheet.AddEffect"),
          default: true,
          callback: async (event, button, dialog) => {
            const key = dialog.element.querySelector("[name=preset]")?.value;
            if (!key) return;
            const data = buildEffectData(key, { origin: item.uuid });
            if (data) await item.createEmbeddedDocuments("ActiveEffect", [data]);
          }
        },
        {
          action: "cancel",
          icon: "fa-solid fa-times",
          label: game.i18n.localize("DEDREL.Chat.Cancel")
        }
      ]
    });
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

  /**
   * Пресеты для быстрого заполнения диалога света (радиусы — в метрах сцены).
   * Ключи анимации — из CONFIG.Canvas.lightAnimations ядра.
   */
  static #LIGHT_PRESETS = {
    torch:   { dim: 8,  bright: 4,   color: "#ff9329", alpha: 0.5,  animation: { type: "torch", speed: 3, intensity: 4 } },
    lantern: { dim: 12, bright: 6,   color: "#ffd28a", alpha: 0.4,  animation: { type: "torch", speed: 1, intensity: 2 } },
    candle:  { dim: 3,  bright: 1.5, color: "#ff9329", alpha: 0.35, animation: { type: "torch", speed: 2, intensity: 2 } },
    magic:   { dim: 6,  bright: 3,   color: "#7fd4ff", alpha: 0.45, animation: { type: "pulse", speed: 2, intensity: 3 } }
  };

  /**
   * Диалог настройки света токена. Свет хранится стандартными change-строками
   * эффекта с ключами `token.light.*` — ядро V14 применяет их к токену носителя
   * эфемерно (TokenDocument#applyActiveEffects), поэтому снятие/подавление
   * эффекта гасит свет само, без записи в документ токена и без участия ГМа.
   * Галка «Включён» служит тумблером: снятие ставит disabled.
   */
  static async #onConfigureEffectLight(event, target) {
    const effectId = target.closest(".effect-item").dataset.effectId;
    const effect = this.document.effects.get(effectId);
    if (!effect) return;

    const light = readTokenLightChanges(effect) ?? {};
    const anim = light.animation ?? {};

    // Типы анимации света берём из ядра Foundry (те же, что в стандартном меню света)
    const animOptions = [`<option value="" ${!anim.type ? "selected" : ""}>${game.i18n.localize("DEDREL.ItemSheet.LightAnimNone")}</option>`];
    for (const [key, cfg] of Object.entries(CONFIG.Canvas.lightAnimations ?? {})) {
      const label = game.i18n.localize(cfg.label);
      animOptions.push(`<option value="${key}" ${key === anim.type ? "selected" : ""}>${foundry.utils.escapeHTML(label)}</option>`);
    }

    // Кнопки-пресеты: заполняют поля формы, сохранение — по общей кнопке
    const presetButtons = Object.keys(DedrelItemSheet.#LIGHT_PRESETS).map(key =>
      `<button type="button" data-light-preset="${key}">${game.i18n.localize(`DEDREL.ItemSheet.LightPreset${key.capitalize()}`)}</button>`
    ).join("");

    const content = `
      <div class="form-group">
        <label>${game.i18n.localize("DEDREL.ItemSheet.LightPresets")}</label>
        <div class="form-fields">${presetButtons}</div>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("DEDREL.ItemSheet.LightEnabled")}</label>
        <input type="checkbox" name="enabled" ${effect.disabled ? "" : "checked"}/>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("DEDREL.ItemSheet.LightDim")}</label>
        <input type="number" name="dim" min="0" step="0.5" value="${Number(light.dim) || 0}"/>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("DEDREL.ItemSheet.LightBright")}</label>
        <input type="number" name="bright" min="0" step="0.5" value="${Number(light.bright) || 0}"/>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("DEDREL.ItemSheet.LightColor")}</label>
        <color-picker name="color" value="${light.color ?? ""}"></color-picker>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("DEDREL.ItemSheet.LightAlpha")}</label>
        <input type="number" name="alpha" min="0" max="1" step="0.05" value="${light.alpha ?? 0.5}"/>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("DEDREL.ItemSheet.LightAnimType")}</label>
        <select name="animType">${animOptions.join("")}</select>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("DEDREL.ItemSheet.LightAnimSpeed")}</label>
        <input type="number" name="animSpeed" min="0" max="10" step="1" value="${anim.speed ?? 5}"/>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("DEDREL.ItemSheet.LightAnimIntensity")}</label>
        <input type="number" name="animIntensity" min="0" max="10" step="1" value="${anim.intensity ?? 5}"/>
      </div>
      <p class="hint">${game.i18n.localize("DEDREL.ItemSheet.LightConfigHint")}</p>
    `;

    const { DialogV2 } = foundry.applications.api;
    await DialogV2.wait({
      window: { title: game.i18n.format("DEDREL.ItemSheet.LightConfigTitle", { name: effect.name }) },
      position: { width: 420 },
      content,
      render: (event, dialog) => {
        const html = dialog.element;
        for (const btn of html.querySelectorAll("[data-light-preset]")) {
          btn.addEventListener("click", () => {
            const p = DedrelItemSheet.#LIGHT_PRESETS[btn.dataset.lightPreset];
            if (!p) return;
            html.querySelector('[name="dim"]').value = p.dim;
            html.querySelector('[name="bright"]').value = p.bright;
            html.querySelector('[name="color"]').value = p.color;
            html.querySelector('[name="alpha"]').value = p.alpha;
            html.querySelector('[name="animType"]').value = p.animation.type;
            html.querySelector('[name="animSpeed"]').value = p.animation.speed;
            html.querySelector('[name="animIntensity"]').value = p.animation.intensity;
          });
        }
      },
      buttons: [
        {
          action: "save",
          icon: "fa-solid fa-check",
          label: game.i18n.localize("DEDREL.Chat.Confirm"),
          default: true,
          callback: async (event, button, dialog) => {
            const html = dialog.element;
            const dim = parseFloat(html.querySelector('[name="dim"]')?.value) || 0;
            const bright = parseFloat(html.querySelector('[name="bright"]')?.value) || 0;
            const otherChanges = stripTokenLightChanges(effect);
            // Оба радиуса 0 — убираем световые changes (эффект перестаёт светиться)
            if (dim <= 0 && bright <= 0) {
              await effect.update({ "system.changes": otherChanges });
              return;
            }
            const animType = html.querySelector('[name="animType"]')?.value || "";
            const alphaRaw = parseFloat(html.querySelector('[name="alpha"]')?.value);
            const lightChanges = buildTokenLightChanges({
              dim,
              bright,
              color: html.querySelector('[name="color"]')?.value || null,
              alpha: Number.isFinite(alphaRaw) ? alphaRaw : 0.5,
              animation: {
                type: animType || null,
                speed: parseInt(html.querySelector('[name="animSpeed"]')?.value) || 0,
                intensity: parseInt(html.querySelector('[name="animIntensity"]')?.value) || 0
              }
            });
            await effect.update({
              "system.changes": [...otherChanges, ...lightChanges],
              // Источник света светит носителю, пока эффект перенесён на владельца
              transfer: true,
              disabled: !(html.querySelector('[name="enabled"]')?.checked ?? true)
            });
          }
        }
      ]
    });
  }

  static async #onDeleteCraftIngredient(event, target) {
    const idx = Number(target.dataset.ingredientIndex);
    const ingredients = this.document.system.crafting.ingredients
      .filter((_, i) => i !== idx)
      .map(i => ({ ...i }));
    await this.document.update({ "system.crafting.ingredients": ingredients });
  }

  /**
   * Пересчёт цены предмета из состава (план крафта §1):
   *   cost_price = Σ(base_price ингредиента × amount) / output_quantity
   *   base_price = cost_price × (1 + markup_pct/100)
   * Деление на output_quantity: состав задаётся на ОДИН цикл крафта, а цена —
   * за единицу продукта (цикл может давать несколько склянок).
   * Одноуровневый: берёт ТЕКУЩИЕ base_price ингредиентов. Каскадный пересчёт
   * всей экономики (продукт-в-продукте) — макрос «Пересчёт экономики» (итерация 3).
   */
  static async #onRecomputeCraftPrice(event, target) {
    const crafting = this.document.system.crafting;
    let cost = 0;
    const missing = [];
    for (const ing of crafting.ingredients) {
      const doc = ing.uuid ? await fromUuid(ing.uuid) : null;
      const price = doc?.system?.base_price;
      if (typeof price !== "number") {
        missing.push(ing.name || ing.uuid || "?");
        continue;
      }
      cost += price * (ing.amount || 0);
    }
    cost = cost / Math.max(1, crafting.output_quantity || 1);
    cost = Math.round(cost * 100) / 100;
    // base_price округляем до целого: у части типов (armor) поле integer
    const price = Math.round(cost * (1 + (crafting.markup_pct || 0) / 100));
    await this.document.update({
      "system.crafting.cost_price": cost,
      "system.base_price": price
    });
    if (missing.length) {
      ui.notifications.warn(game.i18n.format("DEDREL.Crafting.RecomputeMissing", { list: missing.join(", ") }));
    } else {
      ui.notifications.info(game.i18n.format("DEDREL.Crafting.RecomputeDone", { cost, price }));
    }
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
