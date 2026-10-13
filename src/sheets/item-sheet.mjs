const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
import { placeTemplatePreview } from "../canvas/template.mjs";
import { DR_KEY_LABELS, DR_TIERS, ITEM_RARITY_ENUM, CRAFT_DISCIPLINE_ENUM, MATERIAL_CLASS_ENUM, SLOT_TIER_ENUM, AMMO_TYPE_ENUM, AMMO_TYPE_LABELS } from "../constants.mjs";
import { buildTokenLightChanges, hasTokenLightChanges, readTokenLightChanges, stripTokenLightChanges } from "../config/effect-library.mjs";
import { getRangedClass, ammoMatchesWeapon } from "../utils/ranged.mjs";
import { DedrelCurrency } from "../utils/currency.mjs";

// Item types with the shared "physical" fields (rarity/weight/price/quantity).
// The shared details-physical.hbs block is rendered for them.
const PHYSICAL_ITEM_TYPES = ["weapon", "armor", "ammunition", "magic_item", "loot", "trade_good", "potion", "scroll", "craft_material", "quest_item"];
/**
 * Main Item Sheet class for the Dedrel system.
 * Inherits from the new Foundry V2 Application Framework (ItemSheetV2).
 * Handles the display and saving logic for item data.
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

  /** The "Open in Constructor" header button — only for built spells. */
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
    // Owner actor (embedded) or standalone for world items (GM)
    game.dedrel.openSpellConstructor(this.document.actor || null, this.document);
  }

  /**
   * The "Use" button on the weapon's ammunition tab: makes the ammunition
   * active (system.consume_target). Clicking the active one again clears the selection.
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
   * Preparing data to pass into the Handlebars templates.
   * Builds the select option lists and turns arrays into strings for the inputs.
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const itemData = this.document;
    
    // Enrich the description HTML so that secret blocks and dice rolls in the text work
    context.enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(itemData.system.description || "", {
      async: true,
      secrets: this.document.isOwner,
      rollData: this.document.getRollData()
    });

    context.item = itemData;
    context.system = itemData.system;
    context.tabs = this._prepareTabs("primary");
    context.editable = this.isEditable;

    // Effects tab: rows with computed flags for highlighting buttons
    // (light is stored as token.light.* change rows, the template can't see it)
    context.effectRows = itemData.effects.map(e => ({
      effect: e,
      hasLight: hasTokenLightChanges(e)
    }));

    // Creature type: key presets for friendly selection (the list is extensible).
    if (itemData.type === "creature_type") {
      const keys = CONFIG.DEDREL?.creatureTypes || [];
      context.creatureTypeOptions = keys.map(k => ({ key: k, label: `DEDREL.CreatureTypes.${k}` }));
      context.creatureTypeIsPreset = keys.includes(itemData.system.key);
    }

    // Weapon and ammunition: "bonus vs creature type" rows (potency 0-10 per type).
    if (itemData.type === "weapon" || itemData.type === "ammunition") {
      const keys = CONFIG.DEDREL?.creatureTypes || [];
      const vs = itemData.system.vs_creature || {};
      context.vsCreatureRows = keys.map(k => ({ key: k, label: `DEDREL.CreatureTypes.${k}`, value: Number(vs[k]) || 0 }));
    }

    // Weapon: "type breaker" rows (a checkbox per type) — ignores that type's DR.
    if (itemData.type === "weapon") {
      const keys = CONFIG.DEDREL?.creatureTypes || [];
      const bypass = itemData.system.bypass_creature || {};
      context.bypassCreatureRows = keys.map(k => ({ key: k, label: `DEDREL.CreatureTypes.${k}`, value: !!bypass[k] }));
    }

    // Ammunition: selects for the ammunition type and the extra damage type (any Ladder key).
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
        "thievery": game.i18n.localize("DEDREL.Skills.thievery"),
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

    // Shared block of physical fields (rarity/weight/price/stackable)
    context.isPhysical = PHYSICAL_ITEM_TYPES.includes(itemData.type);
    if (context.isPhysical || itemData.type === "service") {
      context.rarityOptions = {};
      for (const r of ITEM_RARITY_ENUM) context.rarityOptions[r] = game.i18n.localize(`DEDREL.Rarity.${r}`);
    }
    if (context.isPhysical) {
      context.hasStackable = itemData.system.stackable !== undefined;
    }

    // The embedded blueprint tab (system.crafting): GM only, so that
    // a player doesn't see the recipe of an item from their inventory
    context.showCrafting = context.isPhysical && game.user.isGM && itemData.system.crafting !== undefined;
    if (context.showCrafting) {
      context.craftDisciplineOptions = { "": "—" };
      for (const d of CRAFT_DISCIPLINE_ENUM) {
        context.craftDisciplineOptions[d] = game.i18n.localize(`DEDREL.CraftDisciplines.${d}`);
      }
    } else {
      delete context.tabs.crafting;
    }

    // The Ammunition tab: only on a weapon recognized as a bow/crossbow/firearm
    // (getRangedClass filters out thrown and melee). The list is the compatible ammunition
    // from the owner actor; the active one is marked (== consume_target).
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

    // Accessory slot (for types that support system.equip_slot)
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

    // Crafting material: class, applicability, magical capacity (slots)
    if (itemData.type === "craft_material") {
      context.materialClassOptions = {};
      for (const c of MATERIAL_CLASS_ENUM) {
        context.materialClassOptions[c] = game.i18n.localize(`DEDREL.MaterialClass.${c}`);
      }
      // Magical capacity: a material gives 0 or 1 slot (the Slots column in materials.csv
      // is always "no" or "<color> 1"), so the editor is a simple tier choice.
      context.materialSlotOptions = { "": game.i18n.localize("DEDREL.SlotTiers.none") };
      for (const t of SLOT_TIER_ENUM) {
        context.materialSlotOptions[t] = game.i18n.localize(`DEDREL.SlotTiers.${t}`);
      }
      context.materialSlot = (itemData.system.slots || [])[0] ?? "";
      // Processed materials (ink, paper, vials, ingots) are crafting
      // products, not a product's base: they don't have the four-axis grammar.
      // Hide applicability/weight/slots/signatures so that junk doesn't accumulate in them.
      context.isProcessedMaterial = itemData.system.material_class === "processed";
    }

    // Currency: the denomination is chosen from the world's currency list
    if (itemData.type === "currency") {
      context.currencyOptions = { "": "—" };
      try {
        const defs = DedrelCurrency.defs();
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
   * Listeners for the Crafting block: dropping an ingredient item and editing quantities.
   * The quantity and material slot inputs DELIBERATELY have no name: arrays can't
   * be trusted to FormDataExtended (see docs/foundry-v14-quirks.md §7) — we update the array
   * as a whole via document.update.
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

    // Material magical capacity: tier selection. The schema field is an array (the slot count
    // is expressed by repeating the tier), so we write [] or [tier].
    const slotsInput = root.querySelector(".material-slots-field");
    if (slotsInput) {
      slotsInput.addEventListener("change", ev => {
        ev.stopPropagation();
        const tier = ev.currentTarget.value;
        this.document.update({ "system.slots": SLOT_TIER_ENUM.includes(tier) ? [tier] : [] });
      });
    }
  }

  /** Dropping an item into the blueprint's ingredients: adds an ingredient (or +1 measure). */
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
   * Handler before the form is saved.
   * Converts comma-separated string values (entered by the user) back into arrays for the DataModel.
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
   * Effect library picker. Two modes:
   *  - "Library" — picking an entry from the `active_effects` compendium (the source of truth)
   *    and copying its embedded Active Effect(s). For an effect to appear in the list,
   *    it's enough to add it to the compendium, no code change needed.
   *  - "Resistance / vulnerability" — a generator: the DR effect is assembled on the fly from the damage
   *    type and the tier (DR_TIERS). The combinatorics (6 × 10) are kept as a generator, otherwise
   *    they clog the compendium list and it becomes impossible to pick anything there.
   */
  static async #onAddEffectFromLibrary(event, target) {
    const item = this.document;
    const pack = game.packs.get(`${game.system.id}.active_effects`);

    // Full documents are needed for the embedded effects (the index doesn't contain them).
    // Only entries that actually carry Active Effect(s) go into the list.
    const docs = pack ? await pack.getDocuments() : [];
    const entries = docs
      .filter(d => d.effects.size > 0)
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));

    // The pack may be missing or empty — the generator works without it.
    const hasLibrary = entries.length > 0;
    if (!pack) ui.notifications.warn(game.i18n.localize("DEDREL.EffectLib.PackMissing"));
    else if (!hasLibrary) ui.notifications.warn(game.i18n.localize("DEDREL.EffectLib.Empty"));

    const opts = (pairs) => pairs
      .map(([value, label]) => `<option value="${value}">${foundry.utils.escapeHTML(label)}</option>`)
      .join("");

    const entryOptions = opts(entries.map(d => [d.id, d.name]));
    const typeOptions = opts(Object.entries(DR_KEY_LABELS).map(([k, l]) => [k, game.i18n.localize(l)]));
    const tierOptions = opts(Object.entries(DR_TIERS).map(([k, t]) => [
      k, `${game.i18n.localize(t.label)} (DR ${t.value > 0 ? "+" : ""}${t.value})`
    ]));

    const content = `
      <div class="form-group" style="margin-bottom: 10px;">
        <label style="font-weight: bold; display: block; margin-bottom: 4px;">${game.i18n.localize("DEDREL.EffectLib.ModeLabel")}</label>
        <select name="mode" style="width: 100%; padding: 4px;">
          <option value="library" ${hasLibrary ? "" : "disabled"}>${game.i18n.localize("DEDREL.EffectLib.ModeLibrary")}</option>
          <option value="dr" ${hasLibrary ? "" : "selected"}>${game.i18n.localize("DEDREL.EffectLib.ModeDr")}</option>
        </select>
      </div>
      <div data-mode-block="library" style="${hasLibrary ? "" : "display: none;"}">
        <div class="form-group" style="margin-bottom: 10px;">
          <label style="font-weight: bold; display: block; margin-bottom: 4px;">${game.i18n.localize("DEDREL.EffectLib.PickLabel")}</label>
          <select name="entry" style="width: 100%; padding: 4px;">${entryOptions}</select>
        </div>
      </div>
      <div data-mode-block="dr" style="${hasLibrary ? "display: none;" : ""}">
        <div class="form-group" style="margin-bottom: 10px;">
          <label style="font-weight: bold; display: block; margin-bottom: 4px;">${game.i18n.localize("DEDREL.EffectLib.DrTypeLabel")}</label>
          <select name="drType" style="width: 100%; padding: 4px;">${typeOptions}</select>
        </div>
        <div class="form-group" style="margin-bottom: 10px;">
          <label style="font-weight: bold; display: block; margin-bottom: 4px;">${game.i18n.localize("DEDREL.EffectLib.DrTierLabel")}</label>
          <select name="drTier" style="width: 100%; padding: 4px;">${tierOptions}</select>
        </div>
        <p class="hint">${game.i18n.localize("DEDREL.EffectLib.DrHint")}</p>
      </div>`;

    await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("DEDREL.EffectLib.PickTitle") },
      content,
      render: (event, dialog) => {
        const html = dialog.element;
        html.querySelector('[name="mode"]')?.addEventListener("change", (ev) => {
          const mode = ev.target.value;
          for (const block of html.querySelectorAll("[data-mode-block]")) {
            block.style.display = block.dataset.modeBlock === mode ? "" : "none";
          }
        });
      },
      buttons: [
        {
          action: "add",
          icon: "fa-solid fa-plus",
          label: game.i18n.localize("DEDREL.ItemSheet.AddEffect"),
          default: true,
          callback: async (event, button, dialog) => {
            const html = dialog.element;
            const mode = html.querySelector('[name="mode"]')?.value;
            const data = mode === "dr"
              ? DedrelItemSheet.#buildDrEffectData(html.querySelector('[name="drType"]')?.value, html.querySelector('[name="drTier"]')?.value)
              : (entries.find(d => d.id === html.querySelector('[name="entry"]')?.value)?.effects ?? []).map(e => {
                // Copy the entry's embedded effects as a template: reset the _id.
                const o = e.toObject();
                delete o._id;
                // A light source works ONLY via a transfer effect: the light lives on
                // the bearer's token (token.light.*), and isn't applied as a one-off.
                // The compendium entry might have been saved with transfer: false —
                // such an effect would silently not shine and wouldn't get into the use() toggle.
                // The "self"/"aura" modes are left alone: there transfer is cleared on purpose.
                const mode = o.flags?.dedrel?.applyTo;
                if (hasTokenLightChanges(o) && !mode) o.transfer = true;
                return o;
              });
            // origin is bound to the current item. The phase of system.* changes
            // will be set by the preCreateActiveEffect hook (docs/foundry-v14-quirks.md §12).
            for (const d of data) d.origin = item.uuid;
            if (data.length) await item.createEmbeddedDocuments("ActiveEffect", data);
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

  /**
   * Assembles Active Effect data for a resistance/vulnerability tier.
   * @param {string} drKey - damage type (system.dr key)
   * @param {string} tierKey - tier from DR_TIERS
   * @returns {object[]} array of effect data (empty if the arguments are unknown)
   */
  static #buildDrEffectData(drKey, tierKey) {
    const tier = DR_TIERS[tierKey];
    const typeLabel = DR_KEY_LABELS[drKey];
    if (!tier || !typeLabel) return [];
    const name = game.i18n.format("DEDREL.EffectLib.DrEffectName", {
      tier: game.i18n.localize(tier.label),
      type: game.i18n.localize(typeLabel)
    });
    return [{
      name,
      img: tier.img,
      transfer: true,
      system: { changes: [{ key: `system.dr.${drKey}`, type: "add", value: tier.value }] }
    }];
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
    // Confirmation against misclicks: deleting an effect from an item is irreversible
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("DEDREL.Notifications.DeleteEffectTitle") },
      content: `<p>${game.i18n.format("DEDREL.Notifications.DeleteItemEffectConfirm", { name: effect.name, item: this.document.name })}</p>`,
      modal: true
    });
    if (confirmed) return effect.delete();
  }

  /**
   * Toggles the self-effect mode (flags.dedrel.applyTo = "self").
   * Such an effect is applied to the owner at the moment the item is used,
   * with @spentAp / @apCost / @overspent substituted (see Item#_applySelfEffects).
   */
  static async #onToggleEffectSelf(event, target) {
    const effectId = target.closest(".effect-item").dataset.effectId;
    const effect = this.document.effects.get(effectId);
    if (!effect) return;
    if (effect.getFlag("dedrel", "applyTo") === "self") {
      // V14: removing a key — via ForcedDeletion (_del), the legacy "-=key" is deprecated
      await effect.update({ "flags.dedrel.applyTo": _del, transfer: true });
    } else {
      // transfer: false is mandatory: otherwise the template with raw placeholders (@spentAp)
      // would passively apply to the owner all the time, giving NaN in the parameters.
      await effect.update({ "flags.dedrel.applyTo": "self", transfer: false });
    }
  }

  /**
   * Toggles the aura payload effect mode (flags.dedrel.applyTo = "aura").
   * Such an effect isn't applied to the owner and doesn't go into the chat button:
   * the aura region puts it on the tokens in the zone (see src/canvas/aura-regions.mjs).
   */
  static async #onToggleEffectAuraPayload(event, target) {
    const effectId = target.closest(".effect-item").dataset.effectId;
    const effect = this.document.effects.get(effectId);
    if (!effect) return;
    if (effect.getFlag("dedrel", "applyTo") === "aura") {
      await effect.update({ "flags.dedrel.applyTo": _del, transfer: true });
    } else {
      // transfer: false is mandatory: the payload mustn't passively hang on the owner
      await effect.update({ "flags.dedrel.applyTo": "aura", transfer: false });
    }
  }

  /**
   * Configuration dialog for the aura marker effect (flags.dedrel.aura).
   * A radius > 0 turns the aura on: an emanation region appears around the owner's token,
   * which puts this item's payload effects on the tokens in the zone.
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

    // For a fresh aura (no flag yet) the checkbox is on regardless of disabled:
    // otherwise a previously disabled effect would silently keep disabled and the aura "wouldn't work"
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
              // The marker is "clean": transfer: false — it affects no one itself
              // (the bearer gets the payload via includeSelf the same way as
              // everyone else), so it doesn't leave a status icon on the actor.
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
   * Presets for quickly filling in the light dialog (radii in scene meters).
   * Animation keys come from core's CONFIG.Canvas.lightAnimations.
   */
  static #LIGHT_PRESETS = {
    torch:   { dim: 8,  bright: 4,   color: "#ff9329", alpha: 0.5,  animation: { type: "torch", speed: 3, intensity: 4 } },
    lantern: { dim: 12, bright: 6,   color: "#ffd28a", alpha: 0.4,  animation: { type: "torch", speed: 1, intensity: 2 } },
    candle:  { dim: 3,  bright: 1.5, color: "#ff9329", alpha: 0.35, animation: { type: "torch", speed: 2, intensity: 2 } },
    magic:   { dim: 6,  bright: 3,   color: "#7fd4ff", alpha: 0.45, animation: { type: "pulse", speed: 2, intensity: 3 } }
  };

  /**
   * Token light configuration dialog. Light is stored as standard change rows
   * of the effect with `token.light.*` keys — V14 core applies them to the bearer's token
   * ephemerally (TokenDocument#applyActiveEffects), so removing/suppressing the
   * effect turns off the light by itself, without writing to the token document and without the GM.
   * The Enabled checkbox serves as a toggle: unchecking sets disabled.
   */
  static async #onConfigureEffectLight(event, target) {
    const effectId = target.closest(".effect-item").dataset.effectId;
    const effect = this.document.effects.get(effectId);
    if (!effect) return;

    const light = readTokenLightChanges(effect) ?? {};
    const anim = light.animation ?? {};

    // Light animation types are taken from Foundry core (the same as in the standard light menu)
    const animOptions = [`<option value="" ${!anim.type ? "selected" : ""}>${game.i18n.localize("DEDREL.ItemSheet.LightAnimNone")}</option>`];
    for (const [key, cfg] of Object.entries(CONFIG.Canvas.lightAnimations ?? {})) {
      const label = game.i18n.localize(cfg.label);
      animOptions.push(`<option value="${key}" ${key === anim.type ? "selected" : ""}>${foundry.utils.escapeHTML(label)}</option>`);
    }

    // Preset buttons: they fill in the form fields, saving happens via the shared button
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
            // Both radii 0 — remove the light changes (the effect stops shining)
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
              // A light source shines for the bearer while the effect is transferred to the owner
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
   * Recalculating the item's price from its ingredients (crafting plan §1):
   *   cost_price = Σ(ingredient base_price × amount) / output_quantity
   *   base_price = cost_price × (1 + markup_pct/100)
   * Division by output_quantity: the ingredients are set per ONE crafting cycle, while the price
   * is per unit of product (a cycle can yield several vials).
   * Single-level: takes the CURRENT base_price of the ingredients. A cascading recalculation
   * of the whole economy (product within product) — the economy recalculation macro (iteration 3).
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
    // base_price is rounded to an integer: for some types (armor) the field is integer
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
