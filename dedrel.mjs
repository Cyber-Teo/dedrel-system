import { ItemDataModels } from "./src/data/items/index.js";
import { ActorDataModels } from "./src/data/actors/index.mjs";
import DedrelCharacterSheet from "./src/sheets/character-sheet.mjs";
import { DedrelItemSheet } from "./src/sheets/item-sheet.mjs";

Hooks.once("init", function() {
  console.log("Dedrel | Initializing Dedrel System");

  // Register Custom Item Data Models
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
    "systems/dedrel/templates/actor/parts/character-experience.hbs"
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
