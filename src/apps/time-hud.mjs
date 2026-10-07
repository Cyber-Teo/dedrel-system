import DedrelCharacterSheet from "../sheets/character-sheet.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/**
 * World time control HUD (GM only).
 * Opened by a button on the scene controls (the Tokens group).
 *
 * All shifts go through game.time.advance() → core itself clears expired
 * Active Effects (CONFIG.ActiveEffect.expiryAction = "delete", see dedrel.mjs).
 * Shift+click on a shift button moves time BACKWARD.
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

  /** Time of day by hour: [fromWhichHour, localization key, icon] */
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
      // components.year — years elapsed since worldTime 0; core NEVER applies
      // the yearZero offset itself (quirk §21), we add it on display
      year: c.year + (calendar.years.yearZero ?? 0)
    });
    context.timeLine = `${String(c.hour).padStart(2, "0")}:${String(c.minute).padStart(2, "0")}`;

    // Season: boundaries in month ordinals, winter (12–2) wraps around the new year
    const season = (calendar.seasons?.values ?? []).find(s => {
      if (s.monthStart <= s.monthEnd) return month.ordinal >= s.monthStart && month.ordinal <= s.monthEnd;
      return month.ordinal >= s.monthStart || month.ordinal <= s.monthEnd;
    });
    context.season = season ? game.i18n.localize(season.name) : "";

    // Time of day (morning/day/evening/night)
    let tod = TimeHUD.TIME_OF_DAY.at(-1);
    for (const entry of TimeHUD.TIME_OF_DAY) {
      if (c.hour >= entry[0] && c.hour < entry[0] + 6) tod = entry;
    }
    context.todLabel = game.i18n.localize(`DEDREL.Time.${tod[1]}`);
    context.todIcon = tod[2];

    return context;
  }

  /** Preset buttons: shift in seconds from the data attributes (Shift — backward). */
  static async #onAdvance(event, target) {
    const hours = Number(target.dataset.hours || 0);
    const days = Number(target.dataset.days || 0);
    let seconds = hours * 3600 + days * 86400;
    if (event.shiftKey) seconds = -seconds;
    await game.time.advance(seconds);
  }

  /** Arbitrary shift: prompt for the number of hours (negative — backward). */
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
   * Short/long rest for the group. Targets: the actors of the selected tokens,
   * with nothing selected — all player characters. Time moves ONCE,
   * so performRest is called with advanceTime: false.
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

  /** Open/close via the button on the scene controls. */
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
