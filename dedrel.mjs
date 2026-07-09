/**
 * Основной файл инициализации игровой системы Dedrel для Foundry VTT.
 * Загружается при старте системы, регистрирует модели данных (Data Models),
 * шаблоны (Templates) и логику работы с документами (Sheets).
 */
import { ItemDataModels } from "./src/data/items/index.mjs";
import { ActorDataModels } from "./src/data/actors/index.mjs";
import DedrelCharacterSheet from "./src/sheets/character-sheet.mjs";
import { DedrelItemSheet } from "./src/sheets/item-sheet.mjs";
import DedrelLootSheet from "./src/sheets/loot-sheet.mjs";
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
import { DEDREL_MAGIC } from "./src/config/magic.mjs";
import { SpellCalculator } from "./src/utils/spell-calculator.mjs";
import SpellConstructorApp from "./src/apps/spell-constructor.mjs";
import DedrelTokenHUD from "./src/apps/token-hud.mjs";
import { DedrelSocket } from "./src/socket.mjs";

import "./src/chat.mjs";
import "./src/macros.mjs";
import DedrelCombat from "./src/combat.mjs";
import "./src/canvas/auras.mjs";
import "./src/canvas/aura-regions.mjs";
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

  // Конфиг магической системы (Магический Конструктор): таблицы Техник,
  // Модификаторов, лимиты Рангов Доктрин, свойства Доктрин. См. src/config/magic.mjs
  CONFIG.DEDREL = CONFIG.DEDREL || {};
  CONFIG.DEDREL.magic = DEDREL_MAGIC;

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

  // Кастомный документ боя: тики кондиций в _onStartTurn/_onEndTurn (src/combat.mjs)
  CONFIG.Combat.documentClass = DedrelCombat;

  // Регистрация кастомного класса предмета и моделей данных для предметов (Item)
  CONFIG.Actor.documentClass = DedrelActor;
  CONFIG.Item.documentClass = DedrelItem;
  CONFIG.Item.dataModels = {
    ...CONFIG.Item.dataModels,
    ...ItemDataModels
  };

  // Кастомный класс для Токена (чтобы отрисовывать дополнительные бары)
  CONFIG.Token.objectClass = DedrelToken;

  // Кастомный HUD токена: клики по стакающимся кондициям добавляют/снимают стаки
  CONFIG.Token.hudClass = DedrelTokenHUD;

  // Поведение региона "Аура" (подтип объявлен в system.json → documentTypes.RegionBehavior)
  CONFIG.RegionBehavior.dataModels.dedrelAura = DedrelAuraRegionBehaviorType;
  CONFIG.RegionBehavior.typeIcons.dedrelAura = "fa-solid fa-circle-dot";

  // Регистрация Active Effects для системы
  CONFIG.ActiveEffect.legacyTransferral = false;

  // Истёкшие эффекты УДАЛЯЮТСЯ, а не помечаются expired (дефолт "update").
  // Иначе истёкшая кондиция остаётся на актёре подавленным «зомби»: иконка
  // пропадает, но toggleStatusEffect/addConditionStack находят её и считают,
  // что состояние всё ещё висит (например, с максимумом стаков).
  CONFIG.ActiveEffect.expiryAction = "delete";

  // Регистрация кастомной фазы "apply" для изменений системных полей (system.*).
  // ВАЖНО: ядро исполняет только фазы "initial"/"final" и те, что зарегистрированы
  // здесь И вызваны системой вручную (см. DedrelActor#prepareEmbeddedDocuments).
  // Без регистрации+вызова изменения с этой фазой молча не применяются.
  CONFIG.ActiveEffect.phases.apply = {
    label: "DEDREL.EffectPhases.Apply",
    hint: "DEDREL.EffectPhases.ApplyHint"
  };

  // Слепота — только визуальная маркировка + механические штрафы (через эффекты
  // кондиции), БЕЗ авто-отключения зрения токена. Ядро по умолчанию считает статус
  // с id "blind" (CONFIG.specialStatusEffects.BLIND) особым и гасит зрение носителя
  // в «глухую черноту» — это путает игроков. Отвязываем спец-статус, чтобы кондиция
  // "blind" была обычной. Управлять зрением при необходимости — вручную (Vision у токена).
  CONFIG.specialStatusEffects.BLIND = "";

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
    "systems/dedrel/templates/actor/loot-sheet.hbs",
    "systems/dedrel/templates/actor/parts/accessory-slot.hbs",
    "systems/dedrel/templates/actor/parts/character-creation.hbs",
    "systems/dedrel/templates/apps/roll-dialog.hbs",
    "systems/dedrel/templates/apps/spell-constructor.hbs",
    "systems/dedrel/templates/apps/currency-config.hbs",
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
    "systems/dedrel/templates/item/parts/details-craft_material.hbs",
    "systems/dedrel/templates/item/parts/details-quest_item.hbs",
    "systems/dedrel/templates/item/parts/details-currency.hbs",
    "systems/dedrel/templates/item/parts/details-service.hbs",
    "systems/dedrel/templates/item/parts/details-equip-slot.hbs"
  ]);

  // Отключаем стандартные листы и регистрируем кастомные V2 листы для актёров и предметов
  foundry.applications.apps.DocumentSheetConfig.unregisterSheet(Actor, "core", foundry.appv1.sheets.ActorSheet);
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, "dedrel", DedrelCharacterSheet, { types: ["character"], makeDefault: true, label: "DEDREL.Sheets.CharacterSheet" });
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, "dedrel", DedrelLootSheet, { types: ["loot"], makeDefault: true, label: "DEDREL.Sheets.LootSheet" });

  foundry.applications.apps.DocumentSheetConfig.unregisterSheet(Item, "core", foundry.appv1.sheets.ItemSheet);
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, "dedrel", DedrelItemSheet, {
    types: ["currency", "loot", "trade_good", "potion", "scroll", "craft_material", "quest_item", "service", "mutilation", "countryoforigin", "mutation", "talent", "maneuver", "spell", "weapon", "armor", "magic_item", "exp", "condition", "ammunition"],
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
    apHUD: new ActionPointsHUD(),
    // Движок Магического Конструктора — доступен макросам (смоук-тест "Валидация магии")
    SpellCalculator,

    /**
     * Открывает Конструктор Заклинаний.
     * @param {Actor|null} actor - заклинатель; без актора доступен только ГМу
     *   (standalone-режим для пресозданных заклинаний).
     * @param {Item|null} spellItem - существующее заклинание для префилла.
     */
    openSpellConstructor: (actor = null, spellItem = null) => {
      if (!actor && !game.user.isGM) {
        return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.SelectToken"));
      }
      return new SpellConstructorApp({ actor, spellItem }).render(true);
    }
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
      spell: "systems/dedrel/assets/icons/items/magic_item.svg",
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
  // V14: changes живут в system.changes (у ActiveEffect появилась system-модель).
  // Читаем из нового места с fallback на легаси top-level.
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

  // Валидация DSL-модификаторов (flags.dedrel.mod): ловим опечатки при авторинге.
  // Эффект не блокируем — только предупреждаем, parseMod уже залогировал причину.
  for (const c of sourceChanges) {
    if (c.key === MOD_CHANGE_KEY && DedrelBonuses.parseMod(c.value) === null) {
      ui.notifications.warn(game.i18n.format("DEDREL.Notifications.InvalidModString", {
        value: foundry.utils.escapeHTML(c.value ?? "")
      }));
    }
  }
});

Hooks.on("preUpdateActiveEffect", (effect, changes, options, userId) => {
  // Диф может прийти в system.changes (V14) или changes (легаси). Правим то, что пришло.
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



Hooks.once("ready", async function () {
  const currentVersion = game.system.version;
  const lastMigration = game.settings.get("dedrel", "systemMigrationVersion");
  
  if (foundry.utils.isNewerVersion(currentVersion, lastMigration)) {
    if (game.user.isGM) {
      DedrelMigration.migrateWorld(currentVersion);
    }
  }

  // Socket-брокер (переводы валют между акторами; сделки с торговцами — Блок D)
  DedrelSocket.listen();

  await rebuildStatusEffects();

  // Пересобираем реестр статусов при любом изменении кондиций в компендиумах,
  // чтобы не требовать перезагрузку мира после правки ключей/эффектов/длительности.
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
 * Компендиумы, из которых собирается реестр статусов (CONFIG.statusEffects).
 * Пак additional_conditions сюда НЕ входит намеренно: это технические состояния,
 * которые добавляются талантами как предметы и не должны появляться
 * в выпадающем меню статусов токена.
 */
const CONDITION_PACKS = ["dedrel.conditions"];

/**
 * Собирает CONFIG.statusEffects из Condition-предметов компендиумов.
 * ВАЖНО (V14): CONFIG.statusEffects — это Proxy (массив с индексом по id).
 * Его НЕЛЬЗЯ заменять обычным массивом, иначе ActiveEffect.fromStatusEffect
 * (строковый доступ CONFIG.statusEffects[statusId]) перестаёт находить статусы.
 * Поэтому очищаем и наполняем его на месте.
 */
async function rebuildStatusEffects() {
  const conditionItems = [];
  for (const packId of CONDITION_PACKS) {
    const pack = game.packs.get(packId);
    if (pack) conditionItems.push(...await pack.getDocuments());
  }
  if (conditionItems.length === 0) return;

  CONFIG.statusEffects.length = 0;
  for (const c of conditionItems) {
    const entry = {
      // Приоритет — системный ключ условия (стабильный, латиницей);
      // слаг имени остаётся как fallback для условий без ключа.
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
          // Стакающиеся кондиции: HUD и DedrelActor#addConditionStack читают
          // эти флаги, чтобы повторные клики наращивали счётчик стаков.
          stackable: c.system.stackable || false,
          max_stacks: Math.max(1, c.system.max_stacks || 1),
          // Обновлять таймер длительности при добавлении стака (см. addConditionStack).
          refresh_on_stack: c.system.refresh_on_stack || false
        }
      }
    };

    // Периодический урон/лечение: тик исполняет DedrelCombat (src/combat.mjs)
    const tick = c.system.tick || {};
    if (tick.formula) {
      entry.flags.dedrel.tick = {
        formula: tick.formula,
        is_heal: tick.is_heal || false,
        damage_type: tick.damage_type || "",
        trigger: tick.trigger || "turnStart"
      };
    }

    // Переносим механику состояния: change-строки со всех его эффектов.
    // Без этого статус, наложенный через HUD, приходит на актёра «пустым».
    // ВАЖНО (V14): changes живут в effect.system.changes (у ActiveEffect
    // появилась system-модель); e.changes и e._source.changes — deprecated-шимы,
    // которые могут вернуть undefined. См. FOUNDRY V14 QUIRKS.md, раздел 11.
    const changes = [];
    for (const e of c.effects) {
      changes.push(...foundry.utils.deepClone(e.system?.changes ?? e._source.changes ?? []));
    }
    if (changes.length > 0) entry.changes = changes;

    // Длительность состояния из его системных данных
    const dur = c.system.duration || {};
    if (dur.value && dur.units && dur.units !== "permanent") {
      if (dur.units === "rounds") entry.duration = { rounds: dur.value };
      else if (dur.units === "turns") entry.duration = { turns: dur.value };
      else if (dur.units === "seconds") entry.duration = { seconds: dur.value };
      else if (dur.units === "minutes") entry.duration = { seconds: dur.value * 60 };
      else if (dur.units === "hours") entry.duration = { seconds: dur.value * 3600 };
      else if (dur.units === "days") entry.duration = { seconds: dur.value * 86400 };
    }

    CONFIG.statusEffects[entry.id] = entry;
  }

  console.log(`Dedrel | Status effects rebuilt: ${conditionItems.length} conditions [${CONFIG.statusEffects.map(s => s.id).join(", ")}]`);
}
