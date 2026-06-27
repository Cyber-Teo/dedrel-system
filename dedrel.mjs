import { ItemDataModels } from "./src/data/items/index.js";
import { ActorDataModels } from "./src/data/actors/index.mjs";
import DedrelCharacterSheet from "./src/sheets/character-sheet.mjs";
import { DedrelItemSheet } from "./src/sheets/item-sheet.mjs";
import DedrelItem from "./src/documents/item.mjs";
import { showRollDialog } from "./src/dice/roll.mjs";

Hooks.once("init", function() {
  console.log("Dedrel | Initializing Dedrel System");

  // Register Custom Item Data Models
  CONFIG.Item.documentClass = DedrelItem;
  CONFIG.Item.dataModels = {
    ...CONFIG.Item.dataModels,
    ...ItemDataModels
  };

  // Register Custom Actor Data Models
  CONFIG.Actor.dataModels = {
    ...CONFIG.Actor.dataModels,
    ...ActorDataModels
  };

  // Preload Handlebars Templates (partials)
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
    "systems/dedrel/templates/actor/parts/character-experience.hbs",
    "systems/dedrel/templates/apps/roll-dialog.hbs"
  ]);

  // Register sheets
  foundry.applications.apps.DocumentSheetConfig.unregisterSheet(Actor, "core", foundry.appv1.sheets.ActorSheet);
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, "dedrel", DedrelCharacterSheet, { types: ["character"], makeDefault: true, label: "Лист персонажа Dedrel" });

  foundry.applications.apps.DocumentSheetConfig.unregisterSheet(Item, "core", foundry.appv1.sheets.ItemSheet);
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, "dedrel", DedrelItemSheet, {
    types: ["currency", "loot", "trade_good", "mutilation", "countryoforigin", "mutation", "talent", "maneuver", "weapon", "armor", "magic_item"],
    makeDefault: true,
    label: "Лист предмета Dedrel"
  });

  console.log("Dedrel | Item Data Models Registered:", Object.keys(ItemDataModels));
  console.log("Dedrel | Actor Data Models Registered:", Object.keys(ActorDataModels));
});

// Set Default Icons for Items
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
      magic_item: "systems/dedrel/assets/icons/magic_item.svg"
    };
    if (defaultIcons[item.type]) {
      item.updateSource({ img: defaultIcons[item.type] });
    }
  }
});

// Chat Actions
Hooks.on("renderChatMessageHTML", (message, html, data) => {
  html.addEventListener("click", async (event) => {
    const button = event.target.closest(".dedrel-chat-action");
    if (!button) return;
    
    event.preventDefault();
    const action = button.dataset.action;
    const itemId = button.dataset.itemId;
    const weaponId = button.dataset.weaponId;
    
    const actor = message.speaker.actor ? game.actors.get(message.speaker.actor) : null;
    if (!actor) return ui.notifications.warn("Персонаж не найден.");
    
    const item = actor.items.get(itemId);
    if (!item) return ui.notifications.warn("Предмет не найден.");
    
    const weapon = weaponId ? actor.items.get(weaponId) : null;
    
    if (action === "rollAttack") {
      let baseRank = 0;
      let title = `Атака: ${item.name}`;
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
    
    if (action === "rollDamage") {
      let formula = item.system.formula_damage;
      let damageType = "";
      
      if (item.type === "maneuver" && item.system.req_weapon_damage_type) {
        const reqDmg = item.system.req_weapon_damage_type;
        if (reqDmg.piercing) damageType = "Колющий";
        else if (reqDmg.bludgeoning) damageType = "Дробящий";
        else if (reqDmg.slashing) damageType = "Режущий";
      }
      
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
      
      let chatContent = `
        <div class="dice-roll">
          <div class="dice-result">
            <div class="dice-formula">${roll.formula} ${damageType ? `[${damageType}]` : ''}</div>
            ${await roll.getTooltip()}
            <h4 class="dice-total">${roll.total}</h4>
          </div>
        </div>
      `;
      
      await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        flavor: `<b>Урон: ${item.name}</b>`,
        content: chatContent,
        rolls: [roll]
      });
    }
  });
});
