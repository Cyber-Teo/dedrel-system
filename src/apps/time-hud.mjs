import DedrelCharacterSheet from "../sheets/character-sheet.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/**
 * HUD управления мировым временем (только для ГМа).
 * Открывается кнопкой на панели инструментов сцены (группа «Токены»).
 *
 * Все сдвиги идут через game.time.advance() → ядро само гасит истёкшие
 * Active Effects (CONFIG.ActiveEffect.expiryAction = "delete", см. dedrel.mjs).
 * Shift+клик по кнопке сдвига двигает время НАЗАД.
 */
export default class TimeHUD extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dedrel-time-hud",
    classes: ["dedrel", "dedrel-time-hud"],
    tag: "div",
    window: {
      frame: true,
      title: "DEDREL.Time.Title",
      positioned: true,
      minimizable: true
    },
    position: {
      width: 320,
      height: "auto",
      top: 120,
      left: 110
    },
    actions: {
      advance: TimeHUD.#onAdvance,
      advanceCustom: TimeHUD.#onAdvanceCustom,
      rest: TimeHUD.#onRest
    }
  };

  static PARTS = {
    main: {
      template: "systems/dedrel/templates/apps/time-hud.hbs"
    }
  };

  /** Время суток по часу: [отКоторогоЧаса, ключ локализации, иконка] */
  static TIME_OF_DAY = [
    [5, "Morning", "fa-solid fa-cloud-sun"],
    [11, "Day", "fa-solid fa-sun"],
    [17, "Evening", "fa-solid fa-cloud-moon"],
    [23, "Night", "fa-solid fa-moon"]
  ];

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const calendar = game.time.calendar;
    const c = game.time.components;

    const month = calendar.months.values[c.month];
    const weekday = calendar.days.values[c.dayOfWeek];
    context.dateLine = game.i18n.format("DEDREL.Time.DateLine", {
      weekday: game.i18n.localize(weekday.name),
      day: c.dayOfMonth + 1,
      month: game.i18n.localize(month.name),
      // components.year — прошедшие годы от worldTime 0; смещение yearZero ядро
      // само НИГДЕ не применяет (квирк §21), добавляем при отображении
      year: c.year + (calendar.years.yearZero ?? 0)
    });
    context.timeLine = `${String(c.hour).padStart(2, "0")}:${String(c.minute).padStart(2, "0")}`;

    // Сезон: границы в ordinal месяцев, зима (12–2) заворачивается через новый год
    const season = (calendar.seasons?.values ?? []).find(s => {
      if (s.monthStart <= s.monthEnd) return month.ordinal >= s.monthStart && month.ordinal <= s.monthEnd;
      return month.ordinal >= s.monthStart || month.ordinal <= s.monthEnd;
    });
    context.season = season ? game.i18n.localize(season.name) : "";

    // Время суток (утро/день/вечер/ночь)
    let tod = TimeHUD.TIME_OF_DAY.at(-1);
    for (const entry of TimeHUD.TIME_OF_DAY) {
      if (c.hour >= entry[0] && c.hour < entry[0] + 6) tod = entry;
    }
    context.todLabel = game.i18n.localize(`DEDREL.Time.${tod[1]}`);
    context.todIcon = tod[2];

    return context;
  }

  /** Кнопки-пресеты: сдвиг в секундах из data-атрибутов (Shift — назад). */
  static async #onAdvance(event, target) {
    const hours = Number(target.dataset.hours || 0);
    const days = Number(target.dataset.days || 0);
    let seconds = hours * 3600 + days * 86400;
    if (event.shiftKey) seconds = -seconds;
    await game.time.advance(seconds);
  }

  /** Произвольный сдвиг: запрос числа часов (отрицательное — назад). */
  static async #onAdvanceCustom(event, target) {
    const result = await DialogV2.prompt({
      window: { title: game.i18n.localize("DEDREL.Time.CustomTitle") },
      content: `<p>${game.i18n.localize("DEDREL.Time.CustomPrompt")}</p>
        <input type="number" name="hours" value="1" step="1" autofocus>`,
      ok: {
        label: game.i18n.localize("DEDREL.Time.CustomConfirm"),
        callback: (event, button) => Number(button.form.elements.hours.value)
      },
      rejectClose: false
    });
    if (!result || isNaN(result)) return;
    await game.time.advance(result * 3600);
  }

  /**
   * Короткий/долгий отдых для группы. Цели: актёры выделенных токенов,
   * без выделения — все персонажи игроков. Время двигается ОДИН раз,
   * поэтому performRest вызывается с advanceTime: false.
   */
  static async #onRest(event, target) {
    const restType = target.dataset.restType;
    let actors = canvas.tokens.controlled
      .map(t => t.actor)
      .filter(a => a && ["character", "npc"].includes(a.type));
    if (actors.length === 0) {
      actors = game.actors.filter(a => a.type === "character" && a.hasPlayerOwner);
    }
    if (actors.length === 0) {
      return ui.notifications.warn(game.i18n.localize("DEDREL.Time.NoRestTargets"));
    }

    const names = actors.map(a => a.name).join(", ");
    const titleKey = restType === "long" ? "DEDREL.ActorSheet.LongRest" : "DEDREL.ActorSheet.ShortRest";
    const confirm = await DialogV2.confirm({
      window: { title: game.i18n.localize(titleKey) },
      content: `<p>${game.i18n.format("DEDREL.Time.RestConfirm", { names })}</p>`
    });
    if (!confirm) return;

    await game.time.advance(restType === "long" ? 28800 : 3600);
    for (const actor of actors) {
      await DedrelCharacterSheet.performRest(actor, restType, { advanceTime: false, notify: false });
    }

    ChatMessage.create({
      speaker: { alias: game.i18n.localize("DEDREL.Time.Title") },
      content: `<div class="dedrel-item-chat"><h3><i class="fa-solid fa-campground"></i> ${game.i18n.localize(titleKey)}</h3><p>${game.i18n.format("DEDREL.Time.RestChatMessage", { names })}</p></div>`
    });
  }

  /** Открыть/закрыть по кнопке на панели сцены. */
  toggle() {
    if (this.rendered) return this.close();
    return this.render({ force: true });
  }

  activateHooks() {
    Hooks.on("updateWorldTime", () => {
      if (this.rendered) this.render();
    });
  }
}
