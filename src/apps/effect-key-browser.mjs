import { buildEffectKeyCatalog, DSL_OPS, DSL_FILTER_TYPES, DSL_CONSUME, buildDslFilterOptions } from "../config/effect-keys.mjs";
import { DedrelBonuses, MOD_CHANGE_KEY } from "../utils/dedrel-bonuses.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * «Справочник ключей» — мастерский инструмент подбора ключей Active Effects.
 *
 * Две зоны:
 *  1. Каталог ключей system.* с живым поиском и кнопкой копирования у каждой
 *     строки (источник — buildEffectKeyCatalog, интроспекция схемы персонажа).
 *  2. Конструктор DSL-строк flags.dedrel.mod: операция + условия фильтра (OR)
 *     + момент сгорания; собранная строка валидируется настоящим парсером
 *     движка (DedrelBonuses.parseMod) и копируется в буфер.
 *
 * Открытие: game.dedrel.openEffectKeyBrowser() или кнопка на панели сцены (ГМ).
 * Поиск фильтрует строки без ре-рендера (скрытие по data-search), чтобы не
 * терять фокус в поле ввода.
 */
export default class EffectKeyBrowserApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dedrel-effect-key-browser",
    classes: ["dedrel", "effect-key-browser"],
    window: { title: "DEDREL.KeyBrowser.Title", icon: "fa-solid fa-key", resizable: true },
    position: { width: 640, height: 720 },
    actions: {
      copyKey: EffectKeyBrowserApp.#onCopyKey,
      copyDsl: EffectKeyBrowserApp.#onCopyDsl,
      addFilter: EffectKeyBrowserApp.#onAddFilter,
      removeFilter: EffectKeyBrowserApp.#onRemoveFilter
    }
  };

  static PARTS = {
    main: {
      template: "systems/dedrel/templates/apps/effect-key-browser.hbs",
      // Сохраняет позицию скролла каталога при ре-рендере (смена операции/фильтра DSL)
      scrollable: [".ekb-list"]
    }
  };

  /** Текущий поисковый запрос (переживает ре-рендер). */
  _search = "";

  /** Состояние конструктора DSL. filters — условия OR. */
  _dsl = { op: "attack", value: "", filters: [{ type: "any", value: "" }], consume: "" };

  /** Раскрытые категории каталога (переживают ре-рендер). */
  _openCategories = new Set(["attributes"]);

  async _prepareContext(options) {
    const catalog = buildEffectKeyCatalog().map(cat => ({
      ...cat,
      open: this._openCategories.has(cat.id)
    }));

    const opDefault = DSL_OPS.find(o => o.key === this._dsl.op) ?? DSL_OPS[0];
    const dslString = this.#buildDslString();

    return {
      search: this._search,
      catalog,
      modChangeKey: MOD_CHANGE_KEY,
      dsl: {
        ops: DSL_OPS.map(o => ({
          key: o.key,
          label: game.i18n.localize(`DEDREL.KeyBrowser.Op.${o.key}`),
          selected: o.key === this._dsl.op
        })),
        opHint: game.i18n.localize(`DEDREL.KeyBrowser.OpHint.${opDefault.key}`),
        value: this._dsl.value,
        valuePlaceholder: opDefault.placeholder,
        filters: this._dsl.filters.map((f, i) => this.#prepareFilterRow(f, i)),
        consumeOptions: DSL_CONSUME.map(c => ({
          key: c,
          label: c === ""
            ? game.i18n.format("DEDREL.KeyBrowser.Consume.auto", { value: game.i18n.localize(`DEDREL.KeyBrowser.Consume.${opDefault.defaultConsume}`) })
            : game.i18n.localize(`DEDREL.KeyBrowser.Consume.${c}`),
          selected: c === this._dsl.consume
        })),
        string: dslString,
        valid: this.#isDslValid(dslString)
      }
    };
  }

  /** Контекст одной строки условия фильтра (тип + значение нужного вида). */
  #prepareFilterRow(filter, index) {
    const typeDef = DSL_FILTER_TYPES.find(t => t.key === filter.type) ?? DSL_FILTER_TYPES[0];
    const row = {
      index,
      value: filter.value,
      valueKind: typeDef.valueKind,
      types: DSL_FILTER_TYPES.map(t => ({
        key: t.key,
        label: game.i18n.localize(`DEDREL.KeyBrowser.Filter.${t.key}`),
        selected: t.key === filter.type
      }))
    };
    if (typeDef.valueKind === "select") {
      row.options = Object.entries(buildDslFilterOptions(filter.type))
        .map(([key, label]) => ({ key, label, selected: key === filter.value }));
    }
    return row;
  }

  /** Собирает DSL-строку из состояния конструктора. */
  #buildDslString() {
    const { op, value, filters, consume } = this._dsl;
    const opDef = DSL_OPS.find(o => o.key === op) ?? DSL_OPS[0];
    const segments = [`${op}:${value.trim() || opDef.placeholder}`];

    const tokens = filters.map(f => {
      const typeDef = DSL_FILTER_TYPES.find(t => t.key === f.type);
      if (!typeDef || typeDef.valueKind === "none") return f.type;
      return f.value.trim() ? `${f.type}:${f.value.trim()}` : "";
    }).filter(t => t.length > 0);
    // "any" в OR-цепочке поглощает остальные условия — не засоряем строку
    const meaningful = tokens.filter(t => t !== "any");
    if (meaningful.length > 0) segments.push(`filter:${meaningful.join("|")}`);

    if (consume) segments.push(`consume:${consume}`);
    return segments.join("; ");
  }

  /** Валидация собранной строки настоящим парсером движка. */
  #isDslValid(str) {
    return DedrelBonuses.parseMod(str) !== null;
  }

  /** Считывает состояние конструктора из DOM (перед ре-рендером/копированием). */
  #readDslFromDom() {
    const el = this.element;
    if (!el) return;
    const op = el.querySelector(".ekb-dsl-op")?.value;
    if (op) this._dsl.op = op;
    this._dsl.value = el.querySelector(".ekb-dsl-value")?.value ?? "";
    this._dsl.consume = el.querySelector(".ekb-dsl-consume")?.value ?? "";
    const filters = [];
    for (const row of el.querySelectorAll(".ekb-filter-row")) {
      filters.push({
        type: row.querySelector(".ekb-f-type")?.value ?? "any",
        value: row.querySelector(".ekb-f-value")?.value ?? ""
      });
    }
    if (filters.length) this._dsl.filters = filters;
  }

  /** Обновляет строку-превью и индикатор валидности без ре-рендера. */
  #refreshPreview() {
    const preview = this.element?.querySelector(".ekb-dsl-preview");
    if (!preview) return;
    const str = this.#buildDslString();
    preview.textContent = str;
    preview.classList.toggle("invalid", !this.#isDslValid(str));
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const el = this.element;

    // Живой поиск: скрываем несовпавшие строки, категории с совпадениями раскрываем
    const searchInput = el.querySelector(".ekb-search-input");
    searchInput?.addEventListener("input", ev => {
      this._search = ev.currentTarget.value;
      this.#applySearch();
    });
    if (this._search) this.#applySearch();

    // Запоминаем раскрытые категории. Во время активного поиска раскрытие
    // программное (показ совпадений) — не записываем его в пользовательское
    // состояние; toggle у <details> асинхронный, синхронным флагом не отсечь.
    for (const details of el.querySelectorAll(".ekb-category")) {
      details.addEventListener("toggle", () => {
        if (this._search.trim()) return;
        if (details.open) this._openCategories.add(details.dataset.category);
        else this._openCategories.delete(details.dataset.category);
      });
    }

    // Конструктор DSL: смена операции/типа фильтра меняет набор контролов — ре-рендер;
    // остальные изменения обновляют только превью
    for (const control of el.querySelectorAll(".ekb-dsl-op, .ekb-f-type")) {
      control.addEventListener("change", () => {
        this.#readDslFromDom();
        // Сброс значения при смене типа условия: старое значение не из этого словаря
        if (control.classList.contains("ekb-f-type")) {
          const idx = Number(control.closest(".ekb-filter-row")?.dataset.index);
          if (!Number.isNaN(idx) && this._dsl.filters[idx]) this._dsl.filters[idx].value = "";
        }
        this.render();
      });
    }
    for (const control of el.querySelectorAll(".ekb-dsl-value, .ekb-dsl-consume, .ekb-f-value")) {
      control.addEventListener("input", () => {
        this.#readDslFromDom();
        this.#refreshPreview();
      });
      control.addEventListener("change", () => {
        this.#readDslFromDom();
        this.#refreshPreview();
      });
    }
  }

  /** Фильтрация каталога по поисковой строке (без ре-рендера). */
  #applySearch() {
    const query = this._search.trim().toLowerCase();
    for (const category of this.element.querySelectorAll(".ekb-category")) {
      let visible = 0;
      for (const row of category.querySelectorAll(".ekb-row")) {
        const match = !query || row.dataset.search.includes(query);
        row.classList.toggle("hidden", !match);
        if (match) visible++;
      }
      category.classList.toggle("hidden", visible === 0);
      // При поиске раскрываем совпавшие; при пустом запросе возвращаем
      // раскрытие, выбранное пользователем (записи в _openCategories при
      // этом идемпотентны — состояние не портится)
      category.open = query
        ? visible > 0
        : this._openCategories.has(category.dataset.category);
    }
  }

  /** Кладёт текст в буфер обмена с уведомлением. */
  static #copy(text) {
    game.clipboard.copyPlainText(text);
    ui.notifications.info(game.i18n.format("DEDREL.KeyBrowser.Copied", { text }));
  }

  static #onCopyKey(event, target) {
    EffectKeyBrowserApp.#copy(target.dataset.key);
  }

  static #onCopyDsl(event, target) {
    this.#readDslFromDom();
    const str = this.#buildDslString();
    if (!this.#isDslValid(str)) {
      return ui.notifications.warn(game.i18n.localize("DEDREL.KeyBrowser.InvalidDsl"));
    }
    EffectKeyBrowserApp.#copy(str);
  }

  static #onAddFilter(event, target) {
    this.#readDslFromDom();
    this._dsl.filters.push({ type: "any", value: "" });
    this.render();
  }

  static #onRemoveFilter(event, target) {
    this.#readDslFromDom();
    const idx = Number(target.dataset.index);
    if (!Number.isNaN(idx)) this._dsl.filters.splice(idx, 1);
    if (this._dsl.filters.length === 0) this._dsl.filters.push({ type: "any", value: "" });
    this.render();
  }
}
