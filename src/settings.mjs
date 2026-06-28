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

  // В будущем сюда можно добавлять другие настройки, например:
  // - Использовать ли опциональные правила (scope: "world")
  // - Тема оформления чаршита (scope: "client")
  // и т.д.
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
