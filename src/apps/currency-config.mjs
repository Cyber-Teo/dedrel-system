import { DEFAULT_CURRENCIES } from "../constants.mjs";
import { DedrelCurrency } from "../utils/currency.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * World currency settings menu (game.settings.registerMenu → "currencies").
 * A table editor: currency rows with key/name/abbreviation/base
 * value/weight/color. Saves the array into the "currencies" setting.
 *
 * The working copy of the rows lives in this._rows; add/remove read the current values
 * from the DOM before mutating, so as not to lose unsaved input on re-render.
 */
export default class CurrencyConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dedrel-currency-config",
    tag: "form",
    classes: ["dedrel", "currency-config"],
    window: { title: "DEDREL.Settings.Currencies.Title", icon: "fa-solid fa-coins" },
    position: { width: 680, height: "auto" },
    form: {
      handler: CurrencyConfigApp.#onSubmit,
      closeOnSubmit: true
    },
    actions: {
      addRow: CurrencyConfigApp.#onAddRow,
      removeRow: CurrencyConfigApp.#onRemoveRow,
      resetDefaults: CurrencyConfigApp.#onReset
    }
  };

  static PARTS = {
    form: { template: "systems/dedrel/templates/apps/currency-config.hbs" }
  };

  /** @type {Array|null} working copy of the currency rows */
  _rows = null;

  async _prepareContext(options) {
    if (!this._rows) {
      const saved = game.settings.get("dedrel", "currencies");
      // The defaults store i18n keys in name/abbr; the form gets already resolved text,
      // so that literal names go into the world on save.
      this._rows = Array.isArray(saved) && saved.length
        ? DedrelCurrency.localizeDefs(saved)
        : DedrelCurrency.localizeDefs(DEFAULT_CURRENCIES);
    }
    return { rows: this._rows };
  }

  /** Reads the current row values from the DOM into an array of objects. */
  #readRowsFromDom() {
    const rows = [];
    for (const tr of this.element.querySelectorAll(".currency-row")) {
      rows.push({
        key: tr.querySelector(".c-key")?.value?.trim() || "",
        name: tr.querySelector(".c-name")?.value?.trim() || "",
        abbr: tr.querySelector(".c-abbr")?.value?.trim() || "",
        base_value: Number(tr.querySelector(".c-base")?.value) || 0,
        weight: Number(tr.querySelector(".c-weight")?.value) || 0,
        color: tr.querySelector(".c-color")?.value?.trim() || ""
      });
    }
    return rows;
  }

  static #onAddRow(event, target) {
    this._rows = this.#readRowsFromDom();
    this._rows.push({ key: "", name: "", abbr: "", base_value: 0, weight: 0.01, color: "#cccccc" });
    this.render();
  }

  static #onRemoveRow(event, target) {
    const idx = Number(target.dataset.index);
    this._rows = this.#readRowsFromDom();
    if (!Number.isNaN(idx)) this._rows.splice(idx, 1);
    this.render();
  }

  static #onReset(event, target) {
    this._rows = DedrelCurrency.localizeDefs(DEFAULT_CURRENCIES);
    this.render();
  }

  static async #onSubmit(event, form, formData) {
    const rows = this.#readRowsFromDom()
      // Empty/nameless rows are ignored
      .filter(r => r.key && r.name);

    // Key uniqueness check
    const keys = rows.map(r => r.key);
    const dup = keys.find((k, i) => keys.indexOf(k) !== i);
    if (dup) {
      ui.notifications.error(game.i18n.format("DEDREL.Settings.Currencies.DuplicateKey", { key: dup }));
      return;
    }

    await game.settings.set("dedrel", "currencies", rows);
    ui.notifications.info(game.i18n.localize("DEDREL.Settings.Currencies.Saved"));
  }
}
