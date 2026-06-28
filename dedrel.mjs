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

/**
 * Хук "init" вызывается Foundry один раз при загрузке.
 * Используется для конфигурации ядра системы до того, как загружен мир.
 */
Hooks.once("init", function() {
  console.log("Dedrel | Initializing Dedrel System");

  // Инициатива (стандартный расчет Foundry для системы)
  CONFIG.Combat.initiative = {
    formula: "@initiative + 1d10",
    decimals: 2
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
    "systems/dedrel/templates/apps/roll-dialog.hbs"
  ]);

  // Отключаем стандартные листы и регистрируем кастомные V2 листы для актёров и предметов
  foundry.applications.apps.DocumentSheetConfig.unregisterSheet(Actor, "core", foundry.appv1.sheets.ActorSheet);
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, "dedrel", DedrelCharacterSheet, { types: ["character"], makeDefault: true, label: "Лист персонажа Dedrel" });

  foundry.applications.apps.DocumentSheetConfig.unregisterSheet(Item, "core", foundry.appv1.sheets.ItemSheet);
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, "dedrel", DedrelItemSheet, {
    types: ["currency", "loot", "trade_good", "mutilation", "countryoforigin", "mutation", "talent", "maneuver", "weapon", "armor", "magic_item", "exp"],
    makeDefault: true,
    label: "Лист предмета Dedrel"
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
      if (!actor) return ui.notifications.warn("Пожалуйста, выделите токен, чтобы использовать макрос.");
      
      const item = actor.items.find(i => i.name === itemName);
      if (!item) return ui.notifications.warn(`У выделенного персонажа нет предмета "${itemName}"`);

      if (item.use) item.use();
    },
    
    rollSkillMacro: async (skillKey) => {
      const speaker = ChatMessage.getSpeaker();
      let actor;
      if (speaker.token) actor = game.actors.tokens[speaker.token];
      if (!actor) actor = game.actors.get(speaker.actor);
      if (!actor) return ui.notifications.warn("Пожалуйста, выделите токен.");

      const skillData = actor.system.skills[skillKey];
      if (!skillData) return;

      const skillName = game.i18n.localize(`DEDREL.Skills.${skillKey}`);
      
      await showRollDialog({
        actor: actor,
        title: `Проверка: ${skillName}`,
        baseRank: skillData.rank,
        isSave: false
      });
    }
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
    if (!actor) return ui.notifications.warn("Персонаж не найден.");
    
    const item = itemId ? actor.items.get(itemId) : null;
    const weapon = weaponId ? actor.items.get(weaponId) : null;
    
    // Бросок атаки
    if (action === "rollAttack") {
      if (!item) return ui.notifications.warn("Предмет не найден.");
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
      if (!item) return ui.notifications.warn("Предмет не найден.");
      let formula = item.system.formula_damage;
      let damageType = "";
      
      // Определяем тип урона из требований манёвра
      if (item.type === "maneuver" && item.system.req_weapon_damage_type) {
        const reqDmg = item.system.req_weapon_damage_type;
        if (reqDmg.piercing) damageType = "Колющий";
        else if (reqDmg.bludgeoning) damageType = "Дробящий";
        else if (reqDmg.slashing) damageType = "Режущий";
      }
      
      // Если у манёвра нет своей формулы, берем формулу и тип урона от оружия
      if (!formula && weapon) {
        formula = weapon.system.damage_formula;
        if (!damageType) {
           const wDmg = weapon.system.damage_type;
           if (wDmg.piercing) damageType = "Колющий";
           else if (wDmg.bludgeoning) damageType = "Дробящий";
           else if (wDmg.slashing) damageType = "Режущий";
        }
      }
      
      if (!formula) return ui.notifications.warn("Формула урона не задана.");
      
      let roll = new Roll(formula);
      await roll.evaluate();
      
      const apLevel = weapon?.system?.properties?.armor_piercing_value || (weapon?.system?.properties?.armor_piercing ? 1 : 0);
      
      // Формируем HTML для отображения результатов броска кубиков в чате
      let chatContent = `
        <div class="dice-roll">
          <div class="dice-result">
            <div class="dice-formula">${roll.formula} ${damageType ? `[${damageType}]` : ''}</div>
            ${await roll.getTooltip()}
            <h4 class="dice-total">${roll.total}</h4>
          </div>
        </div>
        <div class="chat-actions" style="display: flex; justify-content: center; width: 100%; margin-top: 8px;">
           <button class="dedrel-chat-action" data-action="applyDamage" data-damage="${roll.total}" data-type="${damageType}" data-ap="${apLevel}" style="width: 100%;"><i class="fas fa-tint"></i> ${game.i18n.localize("DEDREL.Chat.ApplyDamage")}</button>
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
      if (!actor) return ui.notifications.warn("Не удалось найти персонажа, использовавшего предмет.");
      
      const item = actor.items.get(itemId);
      if (!item) return ui.notifications.warn("Не удалось найти предмет.");

      let targets = canvas.tokens.controlled;
      if (targets.length === 0) targets = Array.from(game.user.targets);
      
      if (targets.length === 0) {
        return ui.notifications.warn("Выберите токены для наложения эффекта (выделите себя или возьмите цель в таргет).");
      }

      const effectsToApply = item.effects.filter(e => !e.transfer).map(e => {
        let effData = e.toObject();
        effData.origin = item.uuid;
        return effData;
      });

      if (effectsToApply.length === 0) return ui.notifications.info("На предмете нет временных эффектов для наложения.");

      for (let token of targets) {
        const targetActor = token.actor;
        if (!targetActor) continue;
        await targetActor.createEmbeddedDocuments("ActiveEffect", effectsToApply);
      }
      ui.notifications.info(`Эффекты применены к ${targets.length} токенам.`);
    }

    // Применение урона
    if (action === "applyDamage") {
      const damage = parseInt(button.dataset.damage) || 0;
      const type = button.dataset.type || "";
      const apLevel = parseInt(button.dataset.ap) || 0;

      // Сначала берем выделенные токены (controlled), если их нет - берем таргеты (targets)
      let targets = canvas.tokens.controlled;
      if (targets.length === 0) targets = Array.from(game.user.targets);
      
      if (targets.length === 0) return ui.notifications.warn("Нет выделенных токенов для получения урона.");

      for (let token of targets) {
        const targetActor = token.actor;
        if (!targetActor) continue;

        let drKey = "";
        if (type === "Колющий") drKey = "piercing";
        else if (type === "Дробящий") drKey = "bludgeoning";
        else if (type === "Режущий") drKey = "slashing";
        else if (type === "Огонь" || type === "Огненный") drKey = "heat";
        else if (type === "Холод") drKey = "cold";
        else if (type === "Некротический") drKey = "necrotic";
        else if (type === "Светлый") drKey = "radiant";
        else if (type === "Электрический") drKey = "electric";
        else if (type === "Звуковой") drKey = "sonic";
        
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
        let totalAppliedDamage = finalDamage + tempHpDamage; 
        
        let chatMsg = `<b>${targetActor.name}</b> получает ${totalAppliedDamage} ${type ? `[${type}] ` : ''}урона.`;
        if (tempHpDamage > 0) {
          chatMsg += ` <span style="color: var(--color-text-dark-secondary); font-size: 0.9em;">(Из них по временным хитам: ${tempHpDamage})</span>`;
        }
        if (targetDr > 0) {
          chatMsg += ` <span style="color: var(--color-text-dark-secondary); font-size: 0.9em;">(Заблокировано броней: ${targetDr} DR)</span>`;
        }
        
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: actor }),
          content: `<div class="dedrel-item-chat"><p>${chatMsg}</p></div>`
        });
      }
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
