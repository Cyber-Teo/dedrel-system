/**
 * Main initialization file of the Dedrel game system for Foundry VTT.
 * Loaded at system startup, it registers the Data Models,
 * Templates and the document logic (Sheets).
 */
import { ItemDataModels } from "./src/data/items/index.mjs";
import { ActorDataModels } from "./src/data/actors/index.mjs";
import DedrelCharacterSheet from "./src/sheets/character-sheet.mjs";
import { DedrelItemSheet } from "./src/sheets/item-sheet.mjs";
import DedrelLootSheet from "./src/sheets/loot-sheet.mjs";
import DedrelNpcSheet from "./src/sheets/npc-sheet.mjs";
import DedrelActor from "./src/documents/actor.mjs";
import DedrelItem from "./src/documents/item.mjs";
import { DedrelMigration } from "./src/migration.mjs";
import { showRollDialog } from "./src/dice/roll.mjs";
import { registerSystemSettings } from "./src/settings.mjs";
import ActiveEffectsHUD from "./src/apps/active-effects-hud.mjs";
import ChainManeuversHUD from "./src/apps/chain-maneuvers-hud.mjs";
import ActionPointsHUD from "./src/apps/ap-hud.mjs";
import { placeTemplatePreview } from "./src/canvas/template.mjs";
import DedrelToken from "./src/canvas/token.mjs";
import DedrelAuraRegionBehaviorType from "./src/data/region-behaviors/aura.mjs";
import { DR_KEY_LABELS } from "./src/constants.mjs";
import { DedrelBonuses, MOD_CHANGE_KEY } from "./src/utils/dedrel-bonuses.mjs";
import { DICE_LADDER, stepDice, stepFormula } from "./src/utils/dice-ladder.mjs";
import { DEDREL_MAGIC } from "./src/config/magic.mjs";
import { CREATURE_TYPES } from "./src/config/creature-types.mjs";
import { DEDREL_EFFECT_LIBRARY, buildEffectData } from "./src/config/effect-library.mjs";
import { SpellCalculator } from "./src/utils/spell-calculator.mjs";
import SpellConstructorApp from "./src/apps/spell-constructor.mjs";
import EffectKeyBrowserApp from "./src/apps/effect-key-browser.mjs";
import DedrelTokenHUD from "./src/apps/token-hud.mjs";
import TimeHUD from "./src/apps/time-hud.mjs";
import MagicSourceHUD from "./src/apps/source-hud.mjs";
import { DEDREL_CALENDAR_CONFIG } from "./src/config/calendar.mjs";
import { DedrelSocket } from "./src/socket.mjs";
import { CompendiumTranslation } from "./src/l10n/compendium-translation.mjs";

import "./src/chat.mjs";
import "./src/macros.mjs";
import DedrelCombat from "./src/combat.mjs";
import "./src/canvas/auras.mjs";
import "./src/canvas/aura-regions.mjs";
import "./src/canvas/movement.mjs";

/**
 * The "init" hook is called by Foundry once on load.
 * Used to configure the system core before the world is loaded.
 */
Hooks.once("init", function() {
  console.log("Dedrel | Initializing Dedrel System");

  // Suppress V14 template deprecation warnings to keep console clean (removed because we migrated to RegionDocument)

  // Registering the system settings
  registerSystemSettings();

  // Compendium translation when the system language isn't Russian: the dictionary loads together
  // with core's language files, before the packs are created (src/l10n/compendium-translation.mjs)
  CompendiumTranslation.init();

  // Magic system config (the Spell Constructor): tables of Techniques,
  // Modifiers, Doctrine Rank limits, Doctrine properties. See src/config/magic.mjs
  CONFIG.DEDREL = CONFIG.DEDREL || {};
  CONFIG.DEDREL.magic = DEDREL_MAGIC;
  CONFIG.DEDREL.creatureTypes = CREATURE_TYPES;
  // Library of reusable Active Effects (potions/scrolls/buffs). See
  // src/config/effect-library.mjs; helpers — game.dedrel.effects (ready hook below).
  CONFIG.DEDREL.effectLibrary = DEDREL_EFFECT_LIBRARY;
  // Damage Ladder (1d4→1d6→2d4→2d6→2d8→3d6) — a global tool for shifting
  // dice for buffs/nerfs (the dice_step DSL operation). See src/utils/dice-ladder.mjs.
  CONFIG.DEDREL.diceLadder = DICE_LADDER;

  // Initiative (Foundry's standard calculation for the system)
  let initDirection = -1;
  try {
    const sortSetting = game.settings.get("dedrel", "initiativeSort");
    if (sortSetting === "ascending") initDirection = 1;
  } catch (e) {
    // The setting may not be ready yet, use the default
  }

  CONFIG.Combat.initiative = {
    formula: "@initiative + 1d10",
    decimals: 2,
    direction: initDirection
  };

  // Custom combat document: condition ticks in _onStartTurn/_onEndTurn (src/combat.mjs)
  CONFIG.Combat.documentClass = DedrelCombat;

  // Registering the custom item class and the item data models (Item)
  CONFIG.Actor.documentClass = DedrelActor;
  CONFIG.Item.documentClass = DedrelItem;
  CONFIG.Item.dataModels = {
    ...CONFIG.Item.dataModels,
    ...ItemDataModels
  };

  // Custom Token class (to draw extra bars)
  CONFIG.Token.objectClass = DedrelToken;

  // Custom token HUD: clicks on stacking conditions add/remove stacks
  CONFIG.Token.hudClass = DedrelTokenHUD;

  // The "Aura" region behavior (the subtype is declared in system.json → documentTypes.RegionBehavior)
  CONFIG.RegionBehavior.dataModels.dedrelAura = DedrelAuraRegionBehaviorType;
  CONFIG.RegionBehavior.typeIcons.dedrelAura = "fa-solid fa-circle-dot";

  // Registering Active Effects for the system
  CONFIG.ActiveEffect.legacyTransferral = false;

  // The Dedrel world calendar (12 months × 30 days, year 1005 at worldTime = 0).
  // GameTime is constructed by core AFTER init (in setupGame), so a simple
  // config assignment here is picked up without a manual initializeCalendar().
  // Effect durations in units "hours"/"days" are converted through it as well.
  CONFIG.time.worldCalendarConfig = DEDREL_CALENDAR_CONFIG;

  // Expired effects are DELETED rather than marked expired (the default is "update").
  // Otherwise an expired condition stays on the actor as a suppressed "zombie": the icon
  // disappears, but toggleStatusEffect/addConditionStack find it and assume
  // the condition is still present (e.g. at max stacks).
  CONFIG.ActiveEffect.expiryAction = "delete";

  // Registering the custom "apply" phase for changes to system fields (system.*).
  // IMPORTANT: core runs only the "initial"/"final" phases and those registered
  // here AND invoked by the system manually (see DedrelActor#prepareEmbeddedDocuments).
  // Without registration+invocation, changes with this phase are silently not applied.
  CONFIG.ActiveEffect.phases.apply = {
    label: "DEDREL.EffectPhases.Apply",
    hint: "DEDREL.EffectPhases.ApplyHint"
  };

  // Blinded is only a visual marker + mechanical penalties (via the condition's
  // effects), WITHOUT automatically disabling the token's vision. By default core treats the status
  // with id "blind" (CONFIG.specialStatusEffects.BLIND) as special and turns the bearer's vision
  // into "pitch black" — this confuses players. We unbind the special status so that the
  // "blind" condition is a regular one. Vision can be managed by hand if needed (the token's Vision).
  CONFIG.specialStatusEffects.BLIND = "";

  // Registering the data models for actors (Actor)
  CONFIG.Actor.dataModels = {
    ...CONFIG.Actor.dataModels,
    ...ActorDataModels
  };

  // Preloading partial Handlebars templates so they can be reused via {{> "path"}}
  foundry.applications.handlebars.loadTemplates([
    "systems/dedrel/templates/actor/parts/character-header.hbs",
    "systems/dedrel/templates/actor/parts/character-navigation.hbs",
    "systems/dedrel/templates/actor/parts/character-main.hbs",
    "systems/dedrel/templates/actor/parts/character-inventory.hbs",
    "systems/dedrel/templates/actor/parts/character-maneuvers.hbs",
    "systems/dedrel/templates/actor/parts/character-spells.hbs",
    "systems/dedrel/templates/actor/parts/character-mutations.hbs",
    "systems/dedrel/templates/actor/parts/character-talents.hbs",
    "systems/dedrel/templates/actor/parts/character-statuses.hbs",
    "systems/dedrel/templates/actor/parts/character-biography.hbs",
    "systems/dedrel/templates/actor/parts/character-experience.hbs",
    "systems/dedrel/templates/actor/parts/main-bottom.hbs",
    "systems/dedrel/templates/actor/parts/npc-header.hbs",
    "systems/dedrel/templates/actor/parts/npc-main.hbs",
    "systems/dedrel/templates/actor/parts/npc-inventory.hbs",
    "systems/dedrel/templates/actor/parts/npc-config.hbs",
    "systems/dedrel/templates/actor/loot-sheet.hbs",
    "systems/dedrel/templates/actor/parts/accessory-slot.hbs",
    "systems/dedrel/templates/actor/parts/character-creation.hbs",
    "systems/dedrel/templates/apps/roll-dialog.hbs",
    "systems/dedrel/templates/apps/spell-constructor.hbs",
    "systems/dedrel/templates/apps/currency-config.hbs",
    "systems/dedrel/templates/apps/effect-key-browser.hbs",
    "systems/dedrel/templates/apps/source-hud.hbs",
    "systems/dedrel/templates/item/parts/item-header.hbs",
    "systems/dedrel/templates/item/parts/item-navigation.hbs",
    "systems/dedrel/templates/item/parts/item-description.hbs",
    "systems/dedrel/templates/item/parts/item-effects.hbs",
    "systems/dedrel/templates/item/parts/details-maneuver.hbs",
    "systems/dedrel/templates/item/parts/details-spell.hbs",
    "systems/dedrel/templates/item/parts/details-talent.hbs",
    "systems/dedrel/templates/item/parts/details-armor.hbs",
    "systems/dedrel/templates/item/parts/details-weapon.hbs",
    "systems/dedrel/templates/item/parts/details-exp.hbs",
    "systems/dedrel/templates/item/parts/details-condition.hbs",
    "systems/dedrel/templates/item/parts/details-physical.hbs",
    "systems/dedrel/templates/item/parts/details-potion.hbs",
    "systems/dedrel/templates/item/parts/details-scroll.hbs",
    "systems/dedrel/templates/item/parts/details-magic_item.hbs",
    "systems/dedrel/templates/item/parts/details-craft_material.hbs",
    "systems/dedrel/templates/item/parts/details-crafting.hbs",
    "systems/dedrel/templates/item/parts/details-quest_item.hbs",
    "systems/dedrel/templates/item/parts/details-currency.hbs",
    "systems/dedrel/templates/item/parts/details-service.hbs",
    "systems/dedrel/templates/item/parts/details-ammunition.hbs",
    "systems/dedrel/templates/item/parts/details-equip-slot.hbs",
    "systems/dedrel/templates/item/parts/details-creature_type.hbs"
  ]);

  // Disable the standard sheets and register the custom V2 sheets for actors and items
  foundry.applications.apps.DocumentSheetConfig.unregisterSheet(Actor, "core", foundry.appv1.sheets.ActorSheet);
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, "dedrel", DedrelCharacterSheet, { types: ["character"], makeDefault: true, label: "DEDREL.Sheets.CharacterSheet" });
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, "dedrel", DedrelLootSheet, { types: ["loot"], makeDefault: true, label: "DEDREL.Sheets.LootSheet" });
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, "dedrel", DedrelNpcSheet, { types: ["npc"], makeDefault: true, label: "DEDREL.Sheets.NpcSheet" });

  foundry.applications.apps.DocumentSheetConfig.unregisterSheet(Item, "core", foundry.appv1.sheets.ItemSheet);
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, "dedrel", DedrelItemSheet, {
    types: ["currency", "loot", "trade_good", "potion", "scroll", "craft_material", "quest_item", "service", "mutilation", "countryoforigin", "mutation", "talent", "maneuver", "spell", "weapon", "armor", "magic_item", "exp", "condition", "ammunition", "creature_type"],
    makeDefault: true,
    label: "DEDREL.Sheets.ItemSheet"
  });

  console.log("Dedrel | Item Data Models Registered:", Object.keys(ItemDataModels));
  console.log("Dedrel | Actor Data Models Registered:", Object.keys(ActorDataModels));

  // Exporting global methods for macros
  game.dedrel = {
    // Damage Ladder: dice shifting for macros/validation.
    // Example: game.dedrel.dice.stepFormula("2d6", 1) → "2d8"
    dice: { LADDER: DICE_LADDER, stepDice, stepFormula },

    rollItemMacro: async (itemName) => {
      const speaker = ChatMessage.getSpeaker();
      let actor;
      if (speaker.token) actor = game.actors.tokens[speaker.token];
      if (!actor) actor = game.actors.get(speaker.actor);
      if (!actor) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.SelectTokenForMacro"));
      
      const item = actor.items.find(i => i.name === itemName);
      if (!item) return ui.notifications.warn(game.i18n.format("DEDREL.Notifications.ItemNotFoundMacro", {name: itemName}));
      
      if (item.type === "maneuver" || item.type === "spell") {
        if (typeof item.use === "function") return item.use();
      } else {
        return item.sheet.render(true);
      }
    },
    
    rollSkillMacro: async (skillKey) => {
      const speaker = ChatMessage.getSpeaker();
      let actor;
      if (speaker.token) actor = game.actors.tokens[speaker.token];
      if (!actor) actor = game.actors.get(speaker.actor);
      if (!actor) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.SelectToken"));

      const skillData = actor.system.skills[skillKey];
      if (!skillData) return;

      const skillName = game.i18n.localize(`DEDREL.Skills.${skillKey}`);
      
      await showRollDialog({
        actor: actor,
        title: game.i18n.format("DEDREL.Notifications.SkillCheck", {name: skillName}),
        baseRank: skillData.rank,
        isSave: false
      });
    },
    effectsHUD: new ActiveEffectsHUD(),
    chainHUD: new ChainManeuversHUD(),
    apHUD: new ActionPointsHUD(),
    timeHUD: new TimeHUD(),
    sourceHUD: new MagicSourceHUD(),
    // The Spell Constructor engine — available to macros (the "Magic Validation" smoke test)
    SpellCalculator,

    /**
     * Opens the Spell Constructor.
     * @param {Actor|null} actor - the caster; without an actor it's available to the GM only
     *   (standalone mode for pre-made spells).
     * @param {Item|null} spellItem - an existing spell to prefill from.
     */
    openSpellConstructor: (actor = null, spellItem = null) => {
      if (!actor && !game.user.isGM) {
        return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.SelectToken"));
      }
      return new SpellConstructorApp({ actor, spellItem }).render(true);
    },

    /**
     * Opens the Effect Key Browser — a catalog of Active Effect keys with search
     * and a builder for flags.dedrel.mod DSL strings (see src/apps/effect-key-browser.mjs).
     */
    openEffectKeyBrowser: () => {
      game.dedrel._effectKeyBrowser ??= new EffectKeyBrowserApp();
      return game.dedrel._effectKeyBrowser.render(true);
    },

    /**
     * Active Effect presets from code (src/config/effect-library.mjs) — legacy.
     * The runtime source of truth is the active_effects compendium: authored effects
     * are copied by the "From library" picker on the item sheet and by the copy_active_effect macro,
     * and the combinatorial ones (resistances/vulnerabilities) are assembled by the same picker's generator.
     * The seed macro that build() lived for has been deleted; the API is kept for manual calls
     * from macros until the config is cleaned up (see NOTES.md).
     */
    effects: {
      /** @returns {object|null} ActiveEffect data from the preset. */
      build: (key, opts = {}) => buildEffectData(key, opts)
    }
  };
  
  // Initializing hooks for the global widgets
  game.dedrel.effectsHUD.activateHooks();
  game.dedrel.apHUD.activateHooks();
  game.dedrel.timeHUD.activateHooks();
  game.dedrel.sourceHUD.activateHooks();
});

/**
 * The time control HUD button on the scene controls
 * (the Tokens group, visible to the GM only — time is advanced by core's game.settings).
 */
Hooks.on("getSceneControlButtons", controls => {
  if (!game.user?.isGM) return;
  const tokens = controls.tokens;
  if (!tokens) return;
  tokens.tools.dedrelTime = {
    name: "dedrelTime",
    order: 100,
    title: "DEDREL.Time.Title",
    icon: "fa-solid fa-hourglass-half",
    button: true,
    onChange: () => game.dedrel.timeHUD.toggle()
  };
  tokens.tools.dedrelEffectKeys = {
    name: "dedrelEffectKeys",
    order: 101,
    title: "DEDREL.KeyBrowser.Title",
    icon: "fa-solid fa-key",
    button: true,
    onChange: () => game.dedrel.openEffectKeyBrowser()
  };
});

/**
 * The "preCreateItem" hook is called before a new item is created in the database.
 * We use it to assign nice default icons instead of the standard backpack.
 */
Hooks.on("preCreateItem", (item, data, options, userId) => {
  if (item.img === "icons/svg/item-bag.svg") {
    // Default icon by item type. File: assets/icons/items/<type>.svg.
    // Images are added by hand; types without a file will show a broken icon for now.
    const defaultIcons = {
      currency: "systems/dedrel/assets/icons/items/currency.svg",
      loot: "systems/dedrel/assets/icons/items/loot.svg",
      trade_good: "systems/dedrel/assets/icons/items/trade_good.svg",
      potion: "systems/dedrel/assets/icons/items/potion.svg",
      scroll: "systems/dedrel/assets/icons/items/scroll.svg",
      craft_material: "systems/dedrel/assets/icons/items/craft_material.svg",
      quest_item: "systems/dedrel/assets/icons/items/quest_item.svg",
      service: "systems/dedrel/assets/icons/items/service.svg",
      mutilation: "systems/dedrel/assets/icons/items/mutilation.svg",
      countryoforigin: "systems/dedrel/assets/icons/items/countryoforigin.svg",
      mutation: "systems/dedrel/assets/icons/items/mutation.svg",
      talent: "systems/dedrel/assets/icons/items/talent.svg",
      maneuver: "systems/dedrel/assets/icons/items/maneuver.svg",
      weapon: "systems/dedrel/assets/icons/items/weapon.svg",
      armor: "systems/dedrel/assets/icons/items/armor.svg",
      magic_item: "systems/dedrel/assets/icons/items/magic_item.svg",
      exp: "systems/dedrel/assets/icons/items/exp.svg",
      condition: "systems/dedrel/assets/icons/items/condition.svg",
      ammunition: "systems/dedrel/assets/icons/items/ammunition.svg",
      spell: "systems/dedrel/assets/icons/items/spell.svg",
      creature_type: "systems/dedrel/assets/icons/items/creature_type.svg"
    };
    if (defaultIcons[item.type]) {
      item.updateSource({ img: defaultIcons[item.type] });
    }
  }
});

/**
 * Item creation dialog: we replace the type dropdown with a compact
 * grid of "icon + label" cards. The original <select> stays in the form
 * (hidden) and is kept in sync — saving through FormDataExtended doesn't break.
 *
 * Attached to renderApplicationV2 (the parent in the DialogV2 chain) — it is guaranteed
 * to be called for the document creation window; the type filter below cuts off everything else.
 */
function dedrelBuildItemTypeGrid(app, element) {
  const root = element instanceof HTMLElement ? element : app?.element;
  if (!root?.querySelector) return;
  const select = root.querySelector('select[name="type"]');
  if (!select) return;

  // Only the Item creation dialog: all options must be item types.
  const itemTypes = new Set(CONFIG.Item.documentClass.TYPES);
  const options = Array.from(select.options);
  if (!options.length || !options.every(o => itemTypes.has(o.value))) return;
  if (root.querySelector(".dedrel-type-grid")) return; // already built

  console.debug("[Dedrel] Строю сетку типов предметов:", options.map(o => o.value));

  const grid = document.createElement("div");
  grid.className = "dedrel-type-grid";

  for (const opt of options) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "dedrel-type-card";
    card.dataset.type = opt.value;
    if (opt.value === select.value) card.classList.add("selected");

    const tile = document.createElement("span");
    tile.className = "dedrel-type-tile";
    const img = document.createElement("img");
    img.src = `systems/dedrel/assets/icons/items/${opt.value}.svg`;
    img.alt = "";
    // Until a type has its own image, show the standard "backpack".
    img.addEventListener("error", () => { img.src = "icons/svg/item-bag.svg"; }, { once: true });
    tile.append(img);

    const label = document.createElement("span");
    label.className = "dedrel-type-label";
    label.textContent = opt.textContent;

    card.append(tile, label);
    card.addEventListener("click", () => {
      select.value = opt.value;
      select.dispatchEvent(new Event("change", { bubbles: true })); // will update the hint and the name placeholder
      grid.querySelectorAll(".dedrel-type-card.selected").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
    });
    grid.append(card);
  }

  // Hide the original select, insert the grid into the same form group.
  const formFields = select.closest(".form-fields");
  if (formFields) formFields.style.display = "none";
  (formFields ?? select).after(grid);

  // A slightly wider window so that more cards fit in a row.
  app?.setPosition?.({ width: 460 });
}
Hooks.on("renderApplicationV2", dedrelBuildItemTypeGrid);

/**
 * The "preCreateActiveEffect" and "preUpdateActiveEffect" hooks
 * Automatically add phase: "apply" to all changes of system variables (system.),
 * since the Foundry V14 UI doesn't always allow setting the phase by hand, and without it TypeDataModel ignores the effects.
 */
Hooks.on("preCreateActiveEffect", (effect, data, options, userId) => {
  // V14: changes live in system.changes (ActiveEffect got a system model).
  // Read from the new location with a fallback to the legacy top level.
  const sourceChanges = effect._source.system?.changes ?? effect._source.changes;
  if (!Array.isArray(sourceChanges) || sourceChanges.length === 0) return;

  let changed = false;
  const newChanges = sourceChanges.map(c => {
    if (c.key && c.key.startsWith("system.") && !c.phase) {
      changed = true;
      return { ...c, phase: "apply" };
    }
    return c;
  });

  if (changed) {
    effect.updateSource({ "system.changes": newChanges });
  }

  // Validating DSL modifiers (flags.dedrel.mod): catching typos while authoring.
  // The effect isn't blocked — we only warn, parseMod has already logged the reason.
  for (const c of sourceChanges) {
    if (c.key === MOD_CHANGE_KEY && DedrelBonuses.parseMod(c.value) === null) {
      ui.notifications.warn(game.i18n.format("DEDREL.Notifications.InvalidModString", {
        value: foundry.utils.escapeHTML(c.value ?? "")
      }));
    }
  }
});

Hooks.on("preUpdateActiveEffect", (effect, changes, options, userId) => {
  // The diff can come in system.changes (V14) or changes (legacy). Fix whatever came.
  const incoming = changes.system?.changes ?? changes.changes;
  if (!Array.isArray(incoming)) return;

  const newChanges = incoming.map(c => {
    if (c.key && c.key.startsWith("system.") && !c.phase) {
      return { ...c, phase: "apply" };
    }
    return c;
  });

  if (changes.system?.changes) changes.system.changes = newChanges;
  else changes.changes = newChanges;
});



// The packs are created: translate their indexes and folders (if translation is active)
Hooks.once("setup", () => CompendiumTranslation.translatePacks());

Hooks.once("ready", async function () {
  const currentVersion = game.system.version;
  const lastMigration = game.settings.get("dedrel", "systemMigrationVersion");
  
  if (foundry.utils.isNewerVersion(currentVersion, lastMigration)) {
    if (game.user.isGM) {
      DedrelMigration.migrateWorld(currentVersion);
    }
  }

  // Socket broker (currency transfers between actors; trades with merchants — Block D)
  DedrelSocket.listen();

  // The Sources widget is visible to everyone at all times: no toggle, right after the UI is ready
  game.dedrel.sourceHUD.render({ force: true });

  await rebuildStatusEffects();

  // Rebuild the status registry on any change of conditions in the compendiums,
  // so as not to require a world reload after editing keys/effects/duration.
  const debouncedRebuild = foundry.utils.debounce(rebuildStatusEffects, 250);
  const onConditionChange = (doc) => {
    if (doc.documentName === "Item" && doc.type === "condition" && CONDITION_PACKS.includes(doc.pack)) {
      debouncedRebuild();
    }
  };
  Hooks.on("createItem", onConditionChange);
  Hooks.on("updateItem", onConditionChange);
  Hooks.on("deleteItem", onConditionChange);
});

/**
 * Compendiums the status registry (CONFIG.statusEffects) is assembled from.
 * The additional_conditions pack is deliberately NOT included: these are technical conditions
 * that talents add as items and that mustn't appear
 * in the token's status dropdown menu.
 * magic_conditions is the curated pool of conditions for doctrinal Modifiers
 * (Power, etc.): its items go both into the registry (so that applying by key
 * works) and into the Spell Constructor's selector. It comes AFTER conditions:
 * when keys match, the version from magic_conditions wins.
 */
// biomancy_adaptations and mutilations are the condition items of Biomancy's
// Adaptation Modifier (beneficial traits and mutilations). They're needed in the registry
// so that applying by key works via the card button and the token HUD.
const CONDITION_PACKS = ["dedrel.conditions", "dedrel.magic_conditions",
  "dedrel.biomancy_adaptations", "dedrel.mutilations"];

/**
 * Packs whose conditions are NOT shown in the token's status dropdown menu
 * (decision 2026-09-11). They stay in the registry — otherwise the application
 * buttons on spell cards and applying by key in general would stop working;
 * only the HUD palette, where space is limited, is hidden.
 *
 * The criterion is simple: the token menu is for the basic conditions the GM applies
 * by hand (`conditions`: prone, blinded, bleeding). Anything applied by
 * magic or the future rare conditions panel (roadmap, block E) isn't needed in the menu.
 *
 * The mechanism is the `hud: false` field, which V14 core understands natively:
 * TokenHUD#_getStatusEffectChoices skips such entries
 * (client/applications/hud/token-hud.mjs).
 */
const HUD_HIDDEN_PACKS = new Set(["dedrel.magic_conditions",
  "dedrel.biomancy_adaptations", "dedrel.mutilations"]);

/**
 * Assembles CONFIG.statusEffects from the compendiums' Condition items.
 * IMPORTANT (V14): CONFIG.statusEffects is a Proxy (an array indexed by id).
 * It MUST NOT be replaced with a plain array, otherwise ActiveEffect.fromStatusEffect
 * (string access CONFIG.statusEffects[statusId]) stops finding statuses.
 * So we clear and refill it in place.
 */
async function rebuildStatusEffects() {
  const conditionItems = [];
  // The pack is remembered together with the document: it determines whether the condition
  // gets into the HUD palette (see HUD_HIDDEN_PACKS).
  for (const packId of CONDITION_PACKS) {
    const pack = game.packs.get(packId);
    if (pack) for (const doc of await pack.getDocuments()) conditionItems.push({ doc, packId });
  }
  if (conditionItems.length === 0) return;

  let hidden = 0;
  CONFIG.statusEffects.length = 0;
  for (const { doc: c, packId } of conditionItems) {
    const entry = {
      // The condition's system key takes priority (stable, Latin characters);
      // the name slug remains as a fallback for conditions without a key.
      id: c.system.key || c.name.toLowerCase().replace(/[^a-z0-9а-яё]/gi, '_'),
      name: c.name,
      icon: c.img,
      img: c.img,
      description: c.system.description || "",
      flags: {
        dedrel: {
          condition: true,
          is_technical: c.system.is_technical || false,
          category: c.system.category || "negative",
          // Stacking conditions: the HUD and DedrelActor#addConditionStack read
          // these flags so that repeated clicks increment the stack counter.
          stackable: c.system.stackable || false,
          max_stacks: Math.max(1, c.system.max_stacks || 1),
          // Refresh the duration timer when a stack is added (see addConditionStack).
          refresh_on_stack: c.system.refresh_on_stack || false
        }
      }
    };

    // Periodic damage/healing: the tick is executed by DedrelCombat (src/combat.mjs)
    const tick = c.system.tick || {};
    if (tick.formula) {
      entry.flags.dedrel.tick = {
        formula: tick.formula,
        is_heal: tick.is_heal || false,
        damage_type: tick.damage_type || "",
        trigger: tick.trigger || "turnStart"
      };
    }

    // Carry over the condition's mechanics: the change rows from all of its effects.
    // Without this, a status applied through the HUD arrives on the actor "empty".
    // IMPORTANT (V14): changes live in effect.system.changes (ActiveEffect
    // got a system model); e.changes and e._source.changes are deprecated shims
    // that may return undefined. See FOUNDRY V14 QUIRKS.md, section 11.
    const changes = [];
    for (const e of c.effects) {
      changes.push(...foundry.utils.deepClone(e.system?.changes ?? e._source.changes ?? []));
    }
    if (changes.length > 0) entry.changes = changes;

    // The condition's duration from its system data
    const dur = c.system.duration || {};
    if (dur.value && dur.units && dur.units !== "permanent") {
      if (dur.units === "rounds") entry.duration = { rounds: dur.value };
      else if (dur.units === "turns") entry.duration = { turns: dur.value };
      else if (dur.units === "seconds") entry.duration = { seconds: dur.value };
      else if (dur.units === "minutes") entry.duration = { seconds: dur.value * 60 };
      else if (dur.units === "hours") entry.duration = { seconds: dur.value * 3600 };
      else if (dur.units === "days") entry.duration = { seconds: dur.value * 86400 };
    }

    // Hiding from the HUD palette: the condition stays in the registry and is applied
    // by key, but doesn't take up space in the token's status dropdown menu.
    if (HUD_HIDDEN_PACKS.has(packId)) {
      entry.hud = false;
      hidden++;
    }

    CONFIG.statusEffects[entry.id] = entry;
  }

  console.log(`Dedrel | Status effects rebuilt: ${conditionItems.length} conditions (${hidden} скрыто из меню токена) [${CONFIG.statusEffects.map(s => s.id).join(", ")}]`);
}
