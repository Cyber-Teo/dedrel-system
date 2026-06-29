/**
 * Основной файл инициализации игровой системы Dedrel для Foundry VTT.
 * Загружается при старте системы, регистрирует модели данных (Data Models),
 * шаблоны (Templates) и логику работы с документами (Sheets).
 */
import { ItemDataModels } from "./src/data/items/index.js";
import { ActorDataModels } from "./src/data/actors/index.mjs";
import DedrelCharacterSheet from "./src/sheets/character-sheet.mjs";
import { DedrelItemSheet } from "./src/sheets/item-sheet.mjs";
import DedrelItem from "./src/documents/item.mjs";
import { showRollDialog } from "./src/dice/roll.mjs";
import { registerSystemSettings } from "./src/settings.mjs";
import ActiveEffectsHUD from "./src/apps/active-effects-hud.mjs";
import ChainManeuversHUD from "./src/apps/chain-maneuvers-hud.mjs";
import { placeTemplatePreview } from "./src/canvas/template.mjs";

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
  CONFIG.Item.documentClass = DedrelItem;
  CONFIG.Item.dataModels = {
    ...CONFIG.Item.dataModels,
    ...ItemDataModels
  };

  // Регистрация моделей данных для актёров (Actor)
  CONFIG.Actor.dataModels = {
    ...CONFIG.Actor.dataModels,
    ...ActorDataModels
  };

  const DR_KEY_LABELS = {
    "piercing": "DEDREL.ItemSheet.Piercing",
    "bludgeoning": "DEDREL.ItemSheet.Bludgeoning",
    "slashing": "DEDREL.ItemSheet.Slashing",
    "heat": "DEDREL.ItemSheet.Fire",
    "cold": "DEDREL.ItemSheet.Cold",
    "necrotic": "DEDREL.ItemSheet.Necrotic",
    "radiant": "DEDREL.ItemSheet.Radiant",
    "electric": "DEDREL.ItemSheet.Lightning",
    "sonic": "DEDREL.ItemSheet.Thunder"
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
    types: ["currency", "loot", "trade_good", "mutilation", "countryoforigin", "mutation", "talent", "maneuver", "weapon", "armor", "magic_item", "exp", "condition"],
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
    chainHUD: new ChainManeuversHUD()
  };
});

/**
 * Хук "preCreateItem" вызывается перед созданием нового предмета в базе данных.
 * Мы используем его для назначения красивых иконок по умолчанию, вместо стандартного рюкзака.
 */
Hooks.on("preCreateItem", (item, data, options, userId) => {
  if (item.img === "icons/svg/item-bag.svg") {
    const defaultIcons = {
      maneuver: "systems/dedrel/assets/icons/maneuver.svg",
      talent: "systems/dedrel/assets/icons/talent.svg",
      mutation: "systems/dedrel/assets/icons/mutation.svg",
      currency: "systems/dedrel/assets/icons/currency.svg",
      loot: "systems/dedrel/assets/icons/loot.svg",
      trade_good: "systems/dedrel/assets/icons/trade_good.svg",
      mutilation: "systems/dedrel/assets/icons/mutilation.svg",
      weapon: "systems/dedrel/assets/icons/weapon.svg",
      armor: "systems/dedrel/assets/icons/armor.svg",
      magic_item: "systems/dedrel/assets/icons/magic_item.svg",
      exp: "icons/magic/light/orb-lightbulb-gray.webp"
    };
    if (defaultIcons[item.type]) {
      item.updateSource({ img: defaultIcons[item.type] });
    }
  }
});

/**
 * Хук "renderChatMessageHTML" вызывается при рендеринге сообщения в чат.
 * Обрабатывает клики по интерактивным кнопкам в чате (например, бросок урона или атаки).
 */
Hooks.on("renderChatMessageHTML", (message, html, data) => {
  html.addEventListener("click", async (event) => {
    const button = event.target.closest(".dedrel-chat-action");
    if (!button) return;
    
    event.preventDefault();
    const action = button.dataset.action;
    const itemId = button.dataset.itemId;
    const weaponId = button.dataset.weaponId;
    
    const actor = ChatMessage.getSpeakerActor(message.speaker);
    if (!actor) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ActorNotFound"));
    
    const item = itemId ? actor.items.get(itemId) : null;
    const weapon = weaponId ? actor.items.get(weaponId) : null;
    
    // Бросок атаки
    if (action === "rollAttack") {
      if (!item) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ItemNotFound"));
      let baseRank = 0;
      let title = game.i18n.format("DEDREL.Chat.AttackCardTitle", {name: item.name});
      
      // Если атака связана с оружием, ищем ранг соответствующего оружейного навыка
      if (weapon && weapon.system.skill) {
        title += ` (${weapon.name})`;
        const skillKey = weapon.system.skill;
        if (actor.system.skills && actor.system.skills[skillKey]) {
          baseRank = actor.system.skills[skillKey].rank || 0;
        }
      }
      
      await showRollDialog({
        actor: actor,
        title: title,
        baseRank: baseRank,
        isSave: false
      });
    }
    
    // Бросок урона
    if (action === "rollDamage") {
      if (!item) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ItemNotFound"));
      let formula = item.system.formula_damage;
      let drKey = "";
      
      // Определяем тип урона из требований манёвра
      if (item.type === "maneuver" && item.system.req_weapon_damage_type) {
        const reqDmg = item.system.req_weapon_damage_type;
        if (reqDmg.piercing) drKey = "piercing";
        else if (reqDmg.bludgeoning) drKey = "bludgeoning";
        else if (reqDmg.slashing) drKey = "slashing";
      }
      
      // Если у манёвра нет своей формулы, берем формулу и тип урона от оружия
      if (!formula && weapon) {
        formula = weapon.system.damage_formula;
        if (!drKey) {
           const wDmg = weapon.system.damage_type;
           if (wDmg.piercing) drKey = "piercing";
           else if (wDmg.bludgeoning) drKey = "bludgeoning";
           else if (wDmg.slashing) drKey = "slashing";
        }
      }
      
      if (!formula) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NoDamageFormula"));
      
      let roll = new Roll(formula);
      await roll.evaluate();
      
      const apLevel = weapon?.system?.properties?.armor_piercing_value || (weapon?.system?.properties?.armor_piercing ? 1 : 0);
      
      let damageTypeLabel = drKey ? game.i18n.localize(DR_KEY_LABELS[drKey]) : "";
      
      // Формируем HTML для отображения результатов броска кубиков в чате
      let chatContent = `
        <div class="dice-roll">
          <div class="dice-result">
            <div class="dice-formula">${roll.formula} ${damageTypeLabel ? `[${damageTypeLabel}]` : ''}</div>
            ${await roll.getTooltip()}
            <h4 class="dice-total">${roll.total}</h4>
          </div>
        </div>
        <div class="chat-actions" style="display: flex; justify-content: center; width: 100%; margin-top: 8px;">
           <button class="dedrel-chat-action" data-action="applyDamage" data-damage="${roll.total}" data-type="${drKey}" data-ap="${apLevel}" style="width: 100%;"><i class="fas fa-tint"></i> ${game.i18n.localize("DEDREL.Chat.ApplyDamage")}</button>
        </div>
      `;
      
      await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        flavor: game.i18n.format("DEDREL.Chat.DamageCardFlavor", {name: item.name}),
        content: chatContent,
        rolls: [roll]
      });
    }

    // Применение эффектов предмета
    if (action === "applyItemEffects") {
      const speaker = message.speaker;
      const actor = game.actors.get(speaker.actor);
      if (!actor) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ActorNotFoundForEffect"));
      
      const item = actor.items.get(itemId);
      if (!item) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ItemNotFound"));

      let targets = canvas.tokens.controlled;
      if (targets.length === 0) targets = Array.from(game.user.targets);
      
      if (targets.length === 0) {
        return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.SelectTargetForEffect"));
      }

      const effectsToApply = item.effects.filter(e => !e.transfer).map(e => {
        let effData = e.toObject();
        effData.origin = item.uuid;
        return effData;
      });

      if (effectsToApply.length === 0) return ui.notifications.info(game.i18n.localize("DEDREL.Notifications.NoEffectsOnItem"));

      for (let token of targets) {
        const targetActor = token.actor;
        if (!targetActor) continue;
        await targetActor.createEmbeddedDocuments("ActiveEffect", effectsToApply);
      }
      ui.notifications.info(game.i18n.format("DEDREL.Notifications.EffectsApplied", {count: targets.length}));
    }

    // Применение урона
    if (action === "applyDamage") {
      const damage = parseInt(button.dataset.damage) || 0;
      const drKey = button.dataset.type || "";
      const apLevel = parseInt(button.dataset.ap) || 0;

      // Сначала берем выделенные токены (controlled), если их нет - берем таргеты (targets)
      let targets = canvas.tokens.controlled;
      if (targets.length === 0) targets = Array.from(game.user.targets);
      
      if (targets.length === 0) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NoTargetForDamage"));

      for (let token of targets) {
        const targetActor = token.actor;
        if (!targetActor) continue;
        
        let targetDr = 0;
        if (drKey && targetActor.system.dr && targetActor.system.dr[drKey] !== undefined) {
          targetDr = targetActor.system.dr[drKey];
        }

        // Применяем бронебойность
        if (apLevel > 0 && targetDr > 0) {
          const ignorePercent = apLevel * 10;
          targetDr = targetDr - (targetDr * ignorePercent / 100);
        }
        
        targetDr = Math.floor(targetDr);
        if (targetDr < 0) targetDr = 0;

        let finalDamage = damage - targetDr;
        if (finalDamage < 0) finalDamage = 0;

        const currentHp = targetActor.system.resources.hp.value;
        let tempHp = targetActor.system.resources.hp.temp || 0;
        let tempHpDamage = 0;
        
        if (tempHp > 0) {
          tempHpDamage = Math.min(tempHp, finalDamage);
          tempHp -= tempHpDamage;
          finalDamage -= tempHpDamage;
        }

        const newHp = Math.max(0, currentHp - finalDamage);

        const updates = { "system.resources.hp.value": newHp };
        if (tempHpDamage > 0) {
          updates["system.resources.hp.temp"] = tempHp;
        }

        await targetActor.update(updates);
        
        // totalAppliedDamage - это суммарный урон, который прошел после брони
        const totalAppliedDamage = finalDamage + tempHpDamage;
        
        let damageTypeStr = drKey ? `[${game.i18n.localize(DR_KEY_LABELS[drKey])}] ` : "";
        let chatMsg = game.i18n.format("DEDREL.Chat.DamageTaken", {name: targetActor.name, damage: totalAppliedDamage, type: damageTypeStr});

        if (tempHpDamage > 0) {
          chatMsg += ` <span style="color: var(--color-text-dark-secondary); font-size: 0.9em;">${game.i18n.format("DEDREL.Chat.DamageTakenTemp", {tempDamage: tempHpDamage})}</span>`;
        }

        if (targetDr > 0) {
          chatMsg += ` <span style="color: var(--color-text-dark-secondary); font-size: 0.9em;">${game.i18n.format("DEDREL.Chat.DamageBlocked", {dr: targetDr})}</span>`;
        }
        
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: actor }),
          content: `<div class="dedrel-item-chat"><p>${chatMsg}</p></div>`
        });
      }
    }

    // Бросок спасброска
    if (action === "rollSave") {
      const saveAttr = button.dataset.save;
      const saveDc = button.dataset.dc;
      
      // Ищем актора: сначала выделенный токен, иначе персонаж игрока
      let targetActor = null;
      if (canvas.tokens.controlled.length > 0) {
        targetActor = canvas.tokens.controlled[0].actor;
      } else {
        targetActor = game.user.character;
      }
      
      if (!targetActor) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.SelectTokenForSave"));
      
      const attrData = targetActor.system.attributes[saveAttr];
      if (!attrData) return;
      
      const title = `${game.i18n.localize("DEDREL.Chat.Save")} (${saveAttr.toUpperCase()})`;
      await showRollDialog({
        actor: targetActor,
        title: title,
        baseRank: attrData.rank,
        isSave: true
      });
    }

    // Размещение шаблона
    if (action === "placeTemplate") {
      let shape = button.dataset.shape;
      const size = parseFloat(button.dataset.size) || 0;
      
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
  });
});

/**
 * Хук "hotbarDrop" перехватывает перетаскивание предметов и навыков на панель макросов.
 */
Hooks.on("hotbarDrop", (bar, data, slot) => {
  if (data.type === "Item") {
    createItemMacro(data, slot);
    return false;
  }
  if (data.type === "Skill") {
    createSkillMacro(data, slot);
    return false;
  }
});

async function createItemMacro(data, slot) {
  const item = await Item.implementation.fromDropData(data);
  if (!item) return;
  const command = `game.dedrel.rollItemMacro("${item.name}");`;
  let macro = game.macros.find(m => (m.name === item.name) && (m.command === command));
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: "script",
      img: item.img,
      command: command,
      flags: { "dedrel.itemMacro": true }
    });
  }
  game.user.assignHotbarMacro(macro, slot);
}

async function createSkillMacro(data, slot) {
  const skillName = game.i18n.localize(`DEDREL.Skills.${data.skillId}`);
  const command = `game.dedrel.rollSkillMacro("${data.skillId}");`;
  let macro = game.macros.find(m => (m.name === skillName) && (m.command === command));
  if (!macro) {
    macro = await Macro.create({
      name: skillName,
      type: "script",
      img: "icons/svg/d20.svg",
      command: command,
      flags: { "dedrel.skillMacro": true }
    });
  }
  game.user.assignHotbarMacro(macro, slot);
}

Hooks.on("updateCombat", async (combat, changed, options, userId) => {
  if (!game.user.isGM) return;
  if (!combat.started) return;

  const restoreTiming = game.settings.get("dedrel", "apRestoreTiming") || "startOfTurn";

  // Логика восстановления в начале раунда для ВСЕХ
  if (restoreTiming === "startOfRound" && changed.round !== undefined && combat.round > 0) {
    if (options.direction === 1 || options.direction === undefined) {
      let updatedAny = false;
      for (const combatant of combat.combatants) {
        const actor = combatant.actor;
        if (!actor || actor.type !== "character") continue;
        const res = actor.system.resources;
        if (!res) continue;
        
        const updateData = {};
        if (res.ap_universal && res.ap_universal.value !== res.ap_universal.max) {
          updateData["system.resources.ap_universal.value"] = res.ap_universal.max;
        }
        if (res.ap_magic && res.ap_magic.value !== res.ap_magic.max) {
          updateData["system.resources.ap_magic.value"] = res.ap_magic.max;
        }
        if (res.ap_maneuver && res.ap_maneuver.value !== res.ap_maneuver.max) {
          updateData["system.resources.ap_maneuver.value"] = res.ap_maneuver.max;
        }
        if (res.movement && res.movement.value !== res.movement.max) {
          updateData["system.resources.movement.value"] = res.movement.max;
        }
        
        if (Object.keys(updateData).length > 0) {
          await actor.update(updateData);
          updatedAny = true;
        }
      }

      if (updatedAny) {
        ui.notifications.info(game.i18n.localize("DEDREL.Notifications.RoundAPRestored"));
      }
    }
  }

  // Логика восстановления в начале хода для ТЕКУЩЕГО персонажа
  if (restoreTiming === "startOfTurn" && (changed.turn !== undefined || changed.round !== undefined)) {
    if (options.direction === 1 || options.direction === undefined) {
      const combatant = combat.combatant;
      if (combatant && combatant.actor && combatant.actor.type === "character") {
        const actor = combatant.actor;
        const res = actor.system.resources;
        if (res) {
          const updateData = {};
          if (res.ap_universal && res.ap_universal.value !== res.ap_universal.max) {
            updateData["system.resources.ap_universal.value"] = res.ap_universal.max;
          }
          if (res.ap_magic && res.ap_magic.value !== res.ap_magic.max) {
            updateData["system.resources.ap_magic.value"] = res.ap_magic.max;
          }
          if (res.ap_maneuver && res.ap_maneuver.value !== res.ap_maneuver.max) {
            updateData["system.resources.ap_maneuver.value"] = res.ap_maneuver.max;
          }
          if (res.movement && res.movement.value !== res.movement.max) {
            updateData["system.resources.movement.value"] = res.movement.max;
          }
          
          if (Object.keys(updateData).length > 0) {
            await actor.update(updateData);
          }
        }
      }
    }
  }

  // Закрытие окна цепных манёвров при смене хода (чтобы не загромождать интерфейс)
  if (changed.turn !== undefined || changed.round !== undefined) {
    if (game.dedrel.chainHUD && game.dedrel.chainHUD.actor) {
      game.dedrel.chainHUD.closeHUD();
    }
  }
});

Hooks.once("ready", async () => {
  console.log("Dedrel | System Ready. Initializing Conditions...");
  const pack = game.packs.get("dedrel.conditions");
  if (pack) {
    const conditions = await pack.getDocuments();
    const statusEffects = [];
    
    for (const item of conditions) {
      if (item.type !== "condition") continue;
      
      let durationData = {};
      if (item.system.duration.units === "rounds") durationData.rounds = item.system.duration.value;
      else if (item.system.duration.units === "turns") durationData.turns = item.system.duration.value;
      else if (item.system.duration.units === "seconds") durationData.seconds = item.system.duration.value;
      // Note: minutes/hours/days can be converted to seconds if needed, but for combat rounds/turns are main.
      
      const effectData = {
        id: item.id,
        name: item.name,
        img: item.img,
        description: item.system.description,
        duration: durationData,
        flags: {
          dedrel: {
            condition: true,
            is_technical: item.system.is_technical,
            category: item.system.category
          }
        },
        changes: item.effects.map(e => e.toObject())
      };
      statusEffects.push(effectData);
    }
    
    if (statusEffects.length > 0) {
      CONFIG.statusEffects = statusEffects;
      console.log(`Dedrel | Loaded ${statusEffects.length} conditions into CONFIG.statusEffects.`);
    }
  }

  // Инициализация HUD активных эффектов
  game.dedrel.effectsHUD = new ActiveEffectsHUD();
  game.dedrel.effectsHUD.activateHooks();
  game.dedrel.effectsHUD.render(true);
});

Hooks.on("preUpdateToken", (tokenDocument, changes, options, userId) => {
  if (userId !== game.user.id) return;
  if (!game.combat?.started) return;
  if (changes.x === undefined && changes.y === undefined) return;
  if (!canvas.ready) return;

  const actor = tokenDocument.actor;
  if (!actor || actor.type !== "character") return;
  
  const res = actor.system.resources;
  if (!res || !res.movement) return;

  const currentX = tokenDocument.x;
  const currentY = tokenDocument.y;
  const targetX = changes.x !== undefined ? changes.x : currentX;
  const targetY = changes.y !== undefined ? changes.y : currentY;

  // Рассчитываем пройденную дистанцию в единицах измерения сцены (например, метры)
  const waypoints = [{x: currentX, y: currentY}, {x: targetX, y: targetY}];
  let distance = 0;
  
  // В Foundry V12+ метод измерения пути
  if (canvas.grid.measurePath) {
    const path = canvas.grid.measurePath(waypoints);
    distance = path.distance;
  } else if (canvas.grid.measureDistance) {
    // Fallback для более старых версий (хотя в V14 должен быть measurePath)
    distance = canvas.grid.measureDistance(waypoints[0], waypoints[1]);
  }

  // Расчет расхода скорости. 
  // Настройки сцены (grid distance) используются напрямую, но 1 единица скорости = 2 метра.
  // Так как мы договорились опираться на настройки сцены, то:
  // Если сцена в метрах, и 1 клетка = 2 метра, то distance = 2. Следовательно, это 1 скорость.
  // То есть SpeedCost = distance / canvas.scene.grid.distance (что дает количество клеток)
  // И 1 клетка = 1 скорость. Значит расход равен количеству клеток.
  const gridDistance = canvas.scene.grid.distance;
  const speedCost = distance / gridDistance;

  if (speedCost > 0) {
    const currentSpeed = res.movement.value;
    
    // Если это отмена (Undo / Ctrl+Z), возвращаем скорость
    if (options.undo) {
      const newSpeed = Math.min(res.movement.max, currentSpeed + Math.ceil(speedCost));
      actor.update({ "system.resources.movement.value": newSpeed });
      return;
    }

    if (speedCost > currentSpeed) {
      ui.notifications.warn(game.i18n.format("DEDREL.Notifications.NotEnoughSpeed", {cost: Math.ceil(speedCost), current: currentSpeed}));
      // Мы не блокируем движение (чтобы игроки могли ошибаться или договариваться с ГМом), но предупреждаем
    }
    
    // Вычитаем скорость, не опуская ниже 0
    const newSpeed = Math.max(0, currentSpeed - Math.ceil(speedCost));
    
    // Добавляем обновление актора в очередь
    actor.update({ "system.resources.movement.value": newSpeed });
  }
});
