export function registerSystemSettings() {
  // Регистрация локализации (как пример настройки системы)
  game.settings.register("dedrel", "systemLanguage", {
    name: "DEDREL.Settings.Language.Name",
    hint: "DEDREL.Settings.Language.Hint",
    scope: "client",       // Настройка индивидуальна для каждого игрока
    config: true,          // Показывать в меню настроек
    type: String,
    choices: {
      "auto": "DEDREL.Settings.Language.Auto",
      "ru": "Русский",
      "en": "English"
    },
    default: "auto",
    requiresReload: true   // Foundry V11+ автоматически предложит перезагрузку
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

  game.settings.register("dedrel", "showChainsOutsideCombat", {
    name: "DEDREL.Settings.ShowChainsOutsideCombat.Name",
    hint: "DEDREL.Settings.ShowChainsOutsideCombat.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: false
  });

  // В будущем сюда можно добавлять другие настройки, например:
  // - Использовать ли опциональные правила (scope: "world")
  // - Тема оформления чаршита (scope: "client")
  // и т.д.

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
    // Вместо глобального game.i18n.setLanguage (который ломает ключи ядра, если нет модуля перевода),
    // мы точечно загружаем нужный словарь нашей системы и вливаем его поверх текущего языка.
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
