import { DEFAULT_CURRENCIES } from "../constants.mjs";
import { DedrelCurrency } from "../utils/currency.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Меню настройки валют мира (game.settings.registerMenu → "currencies").
 * Табличный редактор: строки валют с ключом/названием/аббревиатурой/базовой
 * ценностью/весом/цветом. Сохраняет массив в настройку "currencies".
 *
 * Рабочая копия строк живёт в this._rows; add/remove читают текущие значения
 * из DOM перед мутацией, чтобы не терять несохранённый ввод при ре-рендере.
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

  /** @type {Array|null} рабочая копия строк валют */
  _rows = null;

  async _prepareContext(options) {
    if (!this._rows) {
      const saved = game.settings.get("dedrel", "currencies");
      // Дефолты хранят i18n-ключи в name/abbr; в форму отдаём уже текст,
      // чтобы при сохранении в мир ушли литеральные названия.
      this._rows = Array.isArray(saved) && saved.length
        ? DedrelCurrency.localizeDefs(saved)
        : DedrelCurrency.localizeDefs(DEFAULT_CURRENCIES);
    }
    return { rows: this._rows };
  }

  /** Считывает текущие значения строк из DOM в массив объектов. */
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
      // Пустые/безымянные строки игнорируем
      .filter(r => r.key && r.name);

    // Проверка уникальности ключей
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
