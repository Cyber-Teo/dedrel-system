import { buildEffectKeyCatalog, DSL_OPS, DSL_FILTER_TYPES, DSL_CONSUME, buildDslFilterOptions } from "../config/effect-keys.mjs";
import { DedrelBonuses, MOD_CHANGE_KEY } from "../utils/dedrel-bonuses.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The Effect Key Browser — a GM tool for picking Active Effect keys.
 *
 * Two zones:
 *  1. A catalog of system.* keys with live search and a copy button on each
 *     row (source — buildEffectKeyCatalog, introspection of the character schema).
 *  2. A builder for flags.dedrel.mod DSL strings: operation + filter conditions (OR)
 *     + burn moment; the assembled string is validated by the engine's real
 *     parser (DedrelBonuses.parseMod) and copied to the clipboard.
 *
 * Opening: game.dedrel.openEffectKeyBrowser() or a button on the scene controls (GM).
 * Search filters rows without a re-render (hiding by data-search), so as not to
 * lose focus in the input field.
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
      // Keeps the catalog's scroll position on re-render (change of DSL operation/filter)
      scrollable: [".ekb-list"]
    }
  };

  /** The current search query (survives re-render). */
  _search = "";

  /** DSL builder state. filters — OR conditions. */
  _dsl = { op: "attack", value: "", filters: [{ type: "any", value: "" }], consume: "" };

  /** Expanded catalog categories (survive re-render). */
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

  /** Context of one filter condition row (type + a value of the needed kind). */
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

  /** Assembles the DSL string from the builder state. */
  #buildDslString() {
    const { op, value, filters, consume } = this._dsl;
    const opDef = DSL_OPS.find(o => o.key === op) ?? DSL_OPS[0];
    const segments = [`${op}:${value.trim() || opDef.placeholder}`];

    const tokens = filters.map(f => {
      const typeDef = DSL_FILTER_TYPES.find(t => t.key === f.type);
      if (!typeDef || typeDef.valueKind === "none") return f.type;
      return f.value.trim() ? `${f.type}:${f.value.trim()}` : "";
    }).filter(t => t.length > 0);
    // "any" in an OR chain absorbs the other conditions — don't clutter the string
    const meaningful = tokens.filter(t => t !== "any");
    if (meaningful.length > 0) segments.push(`filter:${meaningful.join("|")}`);

    if (consume) segments.push(`consume:${consume}`);
    return segments.join("; ");
  }

  /** Validating the assembled string with the engine's real parser. */
  #isDslValid(str) {
    return DedrelBonuses.parseMod(str) !== null;
  }

  /** Reads the builder state from the DOM (before re-render/copying). */
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

  /** Updates the preview string and the validity indicator without a re-render. */
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

    // Live search: hide non-matching rows, expand categories with matches
    const searchInput = el.querySelector(".ekb-search-input");
    searchInput?.addEventListener("input", ev => {
      this._search = ev.currentTarget.value;
      this.#applySearch();
    });
    if (this._search) this.#applySearch();

    // Remember the expanded categories. During an active search, expansion
    // is programmatic (showing matches) — we don't record it in the user's
    // state; the toggle on <details> is asynchronous, a synchronous flag can't filter it out.
    for (const details of el.querySelectorAll(".ekb-category")) {
      details.addEventListener("toggle", () => {
        if (this._search.trim()) return;
        if (details.open) this._openCategories.add(details.dataset.category);
        else this._openCategories.delete(details.dataset.category);
      });
    }

    // DSL builder: changing the operation/filter type changes the set of controls — a re-render;
    // other changes update only the preview
    for (const control of el.querySelectorAll(".ekb-dsl-op, .ekb-f-type")) {
      control.addEventListener("change", () => {
        this.#readDslFromDom();
        // Reset the value when the condition type changes: the old value isn't from this dictionary
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

  /** Filtering the catalog by the search string (without a re-render). */
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
      // While searching we expand the matching ones; with an empty query we restore
      // the expansion chosen by the user (writes to _openCategories here
      // are idempotent — the state isn't corrupted)
      category.open = query
        ? visible > 0
        : this._openCategories.has(category.dataset.category);
    }
  }

  /** Puts text on the clipboard with a notification. */
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
