import CurrencyConfigApp from "./apps/currency-config.mjs";
import { DEFAULT_CURRENCIES } from "./constants.mjs";

export function registerSystemSettings() {
  // World currencies (multi-currency). The denomination list is edited through a menu
  // (CurrencyConfigApp); the actor's wallet stores counters by the keys of these currencies.
  game.settings.register("dedrel", "currencies", {
    scope: "world",
    config: false,
    type: Array,
    default: DEFAULT_CURRENCIES
  });

  game.settings.registerMenu("dedrel", "currenciesMenu", {
    name: "DEDREL.Settings.Currencies.Name",
    label: "DEDREL.Settings.Currencies.Label",
    hint: "DEDREL.Settings.Currencies.Hint",
    icon: "fa-solid fa-coins",
    type: CurrencyConfigApp,
    restricted: true
  });

  // Registering the localization (as an example of a system setting)
  game.settings.register("dedrel", "systemLanguage", {
    name: "DEDREL.Settings.Language.Name",
    hint: "DEDREL.Settings.Language.Hint",
    scope: "client",       // The setting is individual for each player
    config: true,          // Show in the settings menu
    type: String,
    choices: {
      "auto": "DEDREL.Settings.Language.Auto",
      "ru": "Русский",
      "en": "English"
    },
    default: "auto",
    requiresReload: true   // Foundry V11+ will offer a reload automatically
  });

  game.settings.register("dedrel", "apRestoreTiming", {
    name: "DEDREL.Settings.APRestoreTiming.Name",
    hint: "DEDREL.Settings.APRestoreTiming.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      "startOfRound": "DEDREL.Settings.APRestoreTiming.StartOfRound",
      "startOfTurn": "DEDREL.Settings.APRestoreTiming.StartOfTurn"
    },
    default: "startOfTurn",
    requiresReload: false
  });

  game.settings.register("dedrel", "initiativeSort", {
    name: "DEDREL.Settings.InitiativeSort.Name",
    hint: "DEDREL.Settings.InitiativeSort.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      "descending": "DEDREL.Settings.InitiativeSort.Descending",
      "ascending": "DEDREL.Settings.InitiativeSort.Ascending"
    },
    default: "descending",
    requiresReload: true,
    onChange: (value) => {
      CONFIG.Combat.initiative.direction = value === "descending" ? -1 : 1;
    }
  });

  // Optional Spell Constructor rule: what an Abundant Source gives.
  // unlockAll — lifts the maxModCost limit entirely (a weak caster at sea becomes
  //   powerful); requireRank — only opens rank 5 to those whose Doctrine
  //   Rank already allows paying 5 AP for a modifier (maxModCost >= 5).
  game.settings.register("dedrel", "abundantSourceMode", {
    name: "DEDREL.Settings.AbundantSourceMode.Name",
    hint: "DEDREL.Settings.AbundantSourceMode.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      "unlockAll": "DEDREL.Settings.AbundantSourceMode.UnlockAll",
      "requireRank": "DEDREL.Settings.AbundantSourceMode.RequireRank"
    },
    default: "unlockAll",
    requiresReload: false
  });

  game.settings.register("dedrel", "showChainsOutsideCombat", {
    name: "DEDREL.Settings.ShowChainsOutsideCombat.Name",
    hint: "DEDREL.Settings.ShowChainsOutsideCombat.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: false
  });

  // In the future other settings can be added here, e.g.:
  // - Whether to use optional rules (scope: "world")
  // - The character sheet theme (scope: "client")
  // etc.

  game.settings.register("dedrel", "systemMigrationVersion", {
    name: "System Migration Version",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });
}

Hooks.once("setup", async function() {
  const sysLang = game.settings.get("dedrel", "systemLanguage");
  if (sysLang !== "auto" && sysLang !== game.i18n.lang) {
    // Instead of the global game.i18n.setLanguage (which breaks core keys if there's no translation module),
    // we load the specific dictionary of our system and merge it on top of the current language.
    try {
      const response = await fetch(`systems/dedrel/lang/${sysLang}.json`);
      if (response.ok) {
        const dict = await response.json();
        foundry.utils.mergeObject(game.i18n.translations, dict);
      }
    } catch (e) {
      console.error("Dedrel | Failed to load system language override:", e);
    }
  }
});
