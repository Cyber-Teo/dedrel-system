/**
 * Основной файл инициализации игровой системы Dedrel для Foundry VTT.
 * Загружается при старте системы, регистрирует модели данных (Data Models),
 * шаблоны (Templates) и логику работы с документами (Sheets).
 */
import { ItemDataModels } from "./src/data/items/index.mjs";
import { ActorDataModels } from "./src/data/actors/index.mjs";
import DedrelCharacterSheet from "./src/sheets/character-sheet.mjs";
import { DedrelItemSheet } from "./src/sheets/item-sheet.mjs";
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
import { DR_KEY_LABELS } from "./src/constants.mjs";

import "./src/chat.mjs";
import "./src/macros.mjs";
import "./src/combat.mjs";
import "./src/canvas/auras.mjs";
import "./src/canvas/movement.mjs";

/**
 * Хук "init" вызывается Foundry один раз при загрузке.
 * Используется для конфигурации ядра системы до того, как загружен мир.
 */
Hooks.once("init", function() {
  console.log("Dedrel | Initializing Dedrel System");

  // Suppress V14 template deprecation warnings to keep console clean (removed because we migrated to RegionDocument)

  // Регистрация настроек системы
  registerSystemSettings();

  // Инициатива (стандартный расчет Foundry для системы)
  let initDirection = -1;
  try {
    const sortSetting = game.settings.get("dedrel", "initiativeSort");
    if (sortSetting === "ascending") initDirection = 1;
  } catch (e) {
    // Настройка может быть еще не готова, используем дефолт
  }

  CONFIG.Combat.initiative = {
    formula: "@initiative + 1d10",
    decimals: 2,
    direction: initDirection
  };

  // Регистрация кастомного класса предмета и моделей данных для предметов (Item)
  CONFIG.Actor.documentClass = DedrelActor;
  CONFIG.Item.documentClass = DedrelItem;
  CONFIG.Item.dataModels = {
    ...CONFIG.Item.dataModels,
    ...ItemDataModels
  };

  // Кастомный класс для Токена (чтобы отрисовывать дополнительные бары)
  CONFIG.Token.objectClass = DedrelToken;

  // Регистрация Active Effects для системы
  CONFIG.ActiveEffect.legacyTransferral = false;

  // Регистрация моделей данных для актёров (Actor)
  CONFIG.Actor.dataModels = {
    ...CONFIG.Actor.dataModels,
    ...ActorDataModels
  };

  // Предзагрузка частичных шаблонов Handlebars, чтобы их можно было переиспользовать через {{> "путь"}}
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
    "systems/dedrel/templates/actor/parts/character-creation.hbs",
    "systems/dedrel/templates/apps/roll-dialog.hbs",
    "systems/dedrel/templates/item/parts/item-header.hbs",
    "systems/dedrel/templates/item/parts/item-navigation.hbs",
    "systems/dedrel/templates/item/parts/item-description.hbs",
    "systems/dedrel/templates/item/parts/item-effects.hbs",
    "systems/dedrel/templates/item/parts/details-maneuver.hbs",
    "systems/dedrel/templates/item/parts/details-talent.hbs",
    "systems/dedrel/templates/item/parts/details-armor.hbs",
    "systems/dedrel/templates/item/parts/details-weapon.hbs",
    "systems/dedrel/templates/item/parts/details-exp.hbs",
    "systems/dedrel/templates/item/parts/details-condition.hbs"
  ]);

  // Отключаем стандартные листы и регистрируем кастомные V2 листы для актёров и предметов
  foundry.applications.apps.DocumentSheetConfig.unregisterSheet(Actor, "core", foundry.appv1.sheets.ActorSheet);
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, "dedrel", DedrelCharacterSheet, { types: ["character"], makeDefault: true, label: "DEDREL.Sheets.CharacterSheet" });

  foundry.applications.apps.DocumentSheetConfig.unregisterSheet(Item, "core", foundry.appv1.sheets.ItemSheet);
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, "dedrel", DedrelItemSheet, {
    types: ["currency", "loot", "trade_good", "mutilation", "countryoforigin", "mutation", "talent", "maneuver", "weapon", "armor", "magic_item", "exp", "condition", "ammunition"],
    makeDefault: true,
    label: "DEDREL.Sheets.ItemSheet"
  });

  console.log("Dedrel | Item Data Models Registered:", Object.keys(ItemDataModels));
  console.log("Dedrel | Actor Data Models Registered:", Object.keys(ActorDataModels));

  // Экспортируем глобальные методы для макросов
  game.dedrel = {
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
    apHUD: new ActionPointsHUD()
  };
  
  // Инициализация хуков для глобальных виджетов
  game.dedrel.effectsHUD.activateHooks();
  game.dedrel.apHUD.activateHooks();
});

/**
 * Хук "preCreateItem" вызывается перед созданием нового предмета в базе данных.
 * Мы используем его для назначения красивых иконок по умолчанию, вместо стандартного рюкзака.
 */
Hooks.on("preCreateItem", (item, data, options, userId) => {
  if (item.img === "icons/svg/item-bag.svg") {
    const defaultIcons = {
      maneuver: "systems/dedrel/assets/icons/items/maneuver.svg",
      talent: "systems/dedrel/assets/icons/items/talent.svg",
      mutation: "systems/dedrel/assets/icons/items/mutation.svg",
      currency: "systems/dedrel/assets/icons/items/currency.svg",
      loot: "systems/dedrel/assets/icons/items/loot.svg",
      trade_good: "systems/dedrel/assets/icons/items/trade_good.svg",
      mutilation: "systems/dedrel/assets/icons/items/mutilation.svg",
      weapon: "systems/dedrel/assets/icons/items/weapon.svg",
      armor: "systems/dedrel/assets/icons/items/armor.svg",
      magic_item: "systems/dedrel/assets/icons/items/magic_item.svg",
      exp: "icons/magic/light/orb-lightbulb-gray.webp"
    };
    if (defaultIcons[item.type]) {
      item.updateSource({ img: defaultIcons[item.type] });
    }
  }
});

/**
 * Хуки "preCreateActiveEffect" и "preUpdateActiveEffect"
 * Автоматически добавляют phase: "apply" ко всем изменениям системных переменных (system.),
 * так как интерфейс Foundry V14 не всегда позволяет задать фазу вручную, а без нее TypeDataModel игнорирует эффекты.
 */
Hooks.on("preCreateActiveEffect", (effect, data, options, userId) => {
  if (!effect._source.changes) return;
  
  let changed = false;
  const newChanges = effect._source.changes.map(c => {
    if (c.key && c.key.startsWith("system.") && !c.phase) {
      changed = true;
      return { ...c, phase: "apply" };
    }
    return c;
  });
  
  if (changed) {
    effect.updateSource({ changes: newChanges });
  }
});

Hooks.on("preUpdateActiveEffect", (effect, changes, options, userId) => {
  if (!changes.changes) return;
  
  const newChanges = changes.changes.map(c => {
    if (c.key && c.key.startsWith("system.") && !c.phase) {
      return { ...c, phase: "apply" };
    }
    return c;
  });
  
  changes.changes = newChanges;
});



Hooks.once("ready", async function () {
  const currentVersion = game.system.version;
  const lastMigration = game.settings.get("dedrel", "systemMigrationVersion");
  
  if (foundry.utils.isNewerVersion(currentVersion, lastMigration)) {
    if (game.user.isGM) {
      DedrelMigration.migrateWorld(currentVersion);
    }
  }

  // Загружаем кастомные состояния из компендиума и заменяем стандартные statusEffects
  const conditionsPack = game.packs.get("dedrel.conditions");
  if (conditionsPack) {
    const conditionItems = await conditionsPack.getDocuments();
    if (conditionItems.length > 0) {
      CONFIG.statusEffects = conditionItems.map(c => {
        return {
          id: c.name.toLowerCase().replace(/[^a-z0-9а-яё]/gi, '_'),
          name: c.name,
          icon: c.img,
          img: c.img,
          description: c.system.description || "",
          flags: {
            dedrel: {
              condition: true,
              is_technical: c.system.is_technical || false,
              category: c.system.category || "negative"
            }
          }
        };
      });
    }
  }
});
