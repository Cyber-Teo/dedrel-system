const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
import { SpellCalculator } from "../utils/spell-calculator.mjs";
import { SOURCE_ORDER, sceneSourceScale } from "../utils/magic-source.mjs";

/**
 * Spell Constructor.
 *
 * The player builds a spell from a Doctrine + Techniques + Modifiers with live
 * recalculation of cost and limits (engine: SpellCalculator), then
 * saves it as an Item of type "spell" (and optionally casts it right away via
 * the standard DedrelItem.use()).
 *
 * Modes:
 *  - Actor: only unlocked doctrines and learned techniques are available,
 *    limits come from the actor's doctrine rank.
 *  - GM standalone (no actor): all doctrines from the config, the rank is set
 *    by hand, technique knowledge isn't checked; the result is a world item
 *    (pre-made spells, later dragged into a compendium).
 *
 * The build state lives in this.build (NOT in the document form) — a deliberate
 * workaround for FormDataExtended (see FOUNDRY V14 QUIRKS.md, section 7).
 */
export default class SpellConstructorApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dedrel-spell-constructor-{id}",
    classes: ["dedrel", "spell-constructor"],
    tag: "div",
    window: {
      frame: true,
      title: "DEDREL.Magic.UI.Title",
      minimizable: true,
      resizable: true
    },
    position: {
      width: 760,
      height: 720
    },
    actions: {
      toggleTechnique: SpellConstructorApp.#onToggleTechnique,
      selectModifierRank: SpellConstructorApp.#onSelectModifierRank,
      selectPath: SpellConstructorApp.#onSelectPath,
      saveSpell: SpellConstructorApp.#onSaveSpell,
      saveAndCastSpell: SpellConstructorApp.#onSaveAndCastSpell,
      castEphemeral: SpellConstructorApp.#onCastEphemeral
    }
  };

  static PARTS = {
    main: {
      template: "systems/dedrel/templates/apps/spell-constructor.hbs"
    }
  };

  /**
   * @param {object} options
   * @param {Actor|null} options.actor - the caster actor; null = GM standalone
   * @param {Item|null} options.spellItem - an existing spell to prefill from
   */
  constructor(options = {}) {
    super(options);
    this.actor = options.actor || null;
    this.gmRank = 3; // doctrine rank in standalone mode (the selector in the header)

    this.build = {
      name: "",
      doctrine: "",
      path: "",
      sourceScale: "none",
      techniques: [],
      // Selected modifiers: { <key>: { rank, option } }
      modifiers: {}
    };

    if (options.spellItem) this.#prefillFrom(options.spellItem);
  }

  get isStandalone() {
    return !this.actor;
  }

  get title() {
    const base = game.i18n.localize("DEDREL.Magic.UI.Title");
    return this.actor ? `${base}: ${this.actor.name}` : `${base} ${game.i18n.localize("DEDREL.Magic.UI.GMSuffix")}`;
  }

  /** Prefilling the build from a saved spell Item (the "Open in Constructor" button). */
  #prefillFrom(item) {
    const sys = item.system;
    this.build.name = item.name;
    this.build.doctrine = sys.doctrine || "";
    this.build.path = sys.doctrine_path || "";
    this.build.sourceScale = sys.source_scale || "none";
    this.build.techniques = [...(sys.chosen_techniques || [])];
    this.build.modifiers = {};
    for (const m of sys.chosen_modifiers || []) {
      this.build.modifiers[m.key] = { rank: m.rank, option: m.option || "" };
    }
  }

  /** Doctrines available in the current mode (only those described in the Constructor config). */
  #availableDoctrines(config) {
    const keys = Object.keys(config.doctrines);
    if (this.isStandalone) return keys;
    return keys.filter(k => this.actor.system.doctrines?.[k]?.unlocked);
  }

  /**
   * The doctrine's Source level on the active scene. The resolver is shared with the
   * Scene Sources widget (utils/magic-source.mjs): a scene without the flag returns the doctrine's
   * default, not "unrestricted", otherwise the selector would allow more
   * than the widget shows.
   */
  #sceneSourceScale(doctrineKey) {
    return sceneSourceScale(doctrineKey);
  }

  /**
   * Selector options from a compendium: [{ value, label }], label = the item's name.
   * keyField is set ("system.key") — value is taken from it (the condition key,
   * entries without a key are dropped); otherwise value = the item's name.
   * The pack index is cached by core — repeated calls are cheap.
   */
  async #packOptions(packIds, keyField = "", rankField = "") {
    const ids = Array.isArray(packIds) ? packIds : [packIds];
    const fields = [keyField, rankField].filter(Boolean);
    const out = [];
    for (const packId of ids) {
      const pack = game.packs.get(packId);
      if (!pack) continue;
      const index = fields.length ? await pack.getIndex({ fields }) : await pack.getIndex();
      for (const e of index) {
        const value = keyField ? (foundry.utils.getProperty(e, keyField) || "") : e.name;
        if (!value) continue;
        out.push({ value, label: e.name, rank: rankField ? Number(foundry.utils.getProperty(e, rankField)) || 0 : 0 });
      }
    }
    return out.sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
  }

  /** build → the flat SpellCalculator format + the context of the current mode. */
  #compute(config) {
    const build = {
      doctrine: this.build.doctrine,
      path: this.build.path,
      sourceScale: this.build.sourceScale,
      techniques: this.build.techniques,
      modifiers: Object.entries(this.build.modifiers).map(([key, v]) => ({ key, rank: v.rank, option: v.option }))
    };
    const context = this.isStandalone
      ? { doctrineRank: this.gmRank, knownTechniques: {}, ignoreKnown: true }
      : SpellCalculator.contextFromActor(this.actor, this.build.doctrine);
    return { build, context, result: SpellCalculator.calculate(build, context, config) };
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const config = CONFIG.DEDREL.magic;
    const i18n = game.i18n;

    context.isStandalone = this.isStandalone;
    context.gmRank = this.gmRank;
    context.buildName = this.build.name;

    // --- Doctrines ---
    const doctrineKeys = this.#availableDoctrines(config);
    if (!this.build.doctrine && doctrineKeys.length > 0) {
      this.build.doctrine = doctrineKeys[0];
      this.build.sourceScale = this.#sceneSourceScale(this.build.doctrine);
    }
    context.hasDoctrines = doctrineKeys.length > 0;
    context.doctrines = doctrineKeys.map(k => ({
      key: k,
      label: i18n.localize(`DEDREL.Magic.Doctrines.${k}`),
      rank: this.isStandalone ? this.gmRank : (this.actor.system.doctrines[k]?.rank || 0),
      selected: k === this.build.doctrine
    }));

    const doctrineCfg = config.doctrines[this.build.doctrine];
    if (!doctrineCfg) return context; // no doctrines available — the template will show a placeholder

    const doctrineRank = this.isStandalone
      ? this.gmRank
      : (this.actor.system.doctrines[this.build.doctrine]?.rank || 0);
    context.doctrineRank = doctrineRank;
    const limits = config.rankLimits[Math.min(Math.max(doctrineRank, 1), 6)];
    context.limits = limits;

    // --- Path: a specialization purchased with a talent (guide §1); "no path" is always legal ---
    context.paths = null;
    let pathCfg = null;
    if (doctrineCfg.paths) {
      const state = this.isStandalone ? null : this.actor.system.doctrines[this.build.doctrine];
      const knownKeys = Object.keys(doctrineCfg.paths)
        .filter(pk => this.isStandalone || state?.paths?.[pk]);
      if (this.build.path && !knownKeys.includes(this.build.path)) this.build.path = "";
      pathCfg = this.build.path ? doctrineCfg.paths[this.build.path] : null;
      if (knownKeys.length) {
        context.paths = [
          { key: "", label: i18n.localize("DEDREL.Magic.UI.NoPath"), selected: !this.build.path },
          ...knownKeys.map(k => ({
            key: k,
            label: i18n.localize(doctrineCfg.paths[k].label),
            selected: k === this.build.path
          }))
        ];
      }
    } else {
      this.build.path = "";
    }

    // --- Source Scale (ignoresSource doctrines live outside this concept) ---
    context.hideSource = !!doctrineCfg.ignoresSource;
    if (context.hideSource) this.build.sourceScale = "none";
    // The scene level (the Scene Sources widget) is the ceiling for players: they can choose
    // a level BELOW the scene's (cautious magic), but not above. The GM isn't limited.
    // A scene without the flag returns the doctrine's default — see sceneSourceScale().
    const sceneScale = this.#sceneSourceScale(this.build.doctrine);
    const sceneIdx = SOURCE_ORDER.indexOf(sceneScale);
    context.sourceScales = Object.entries(config.sourceScales).map(([k, v]) => {
      const overSceneCap = !game.user.isGM && SOURCE_ORDER.indexOf(k) > sceneIdx;
      return {
        key: k,
        label: i18n.localize(v.label),
        selected: k === this.build.sourceScale,
        disabled: overSceneCap
      };
    });
    context.sceneScaleLabel = i18n.localize(config.sourceScales[sceneScale].label);
    const abundant = !!config.sourceScales[this.build.sourceScale]?.ignoresMaxModCost;
    // Abundance mode (world setting): whether an abundant source lifts maxModCost
    const bypassMaxCost = abundant && game.settings.get("dedrel", "abundantSourceMode") === "unlockAll";

    // --- Price/ban rules for highlighting (the same logic as in calculate) ---
    const { deltas, forbidden, caps } = SpellCalculator.rulesFor(doctrineCfg, pathCfg);
    const priceOf = (target, base) => Math.max(0, base + (deltas[target] || 0));
    // Doctrinal modifiers and forms (the path overrides the forms, adds modifiers)
    const ownedDoctrinal = new Set([...(doctrineCfg.modifiers || []), ...(pathCfg?.modifiers || [])]);
    const forms = pathCfg?.forms ?? doctrineCfg.forms ?? [];

    // --- Announcing the doctrine's/path's features: affinities, restrictions, bans, caps ---
    const nameOf = (target) => {
      const [kind, key] = target.split(":");
      return i18n.localize(kind === "tech" ? `DEDREL.Magic.Techniques.${key}` : `DEDREL.Magic.Modifiers.${key}`);
    };
    const rules = [];
    if (doctrineCfg.ladderShift) rules.push(i18n.format("DEDREL.Magic.UI.RuleLadderShift", { n: doctrineCfg.ladderShift }));
    if (doctrineCfg.ignoresSource) rules.push(i18n.localize("DEDREL.Magic.UI.RuleIgnoresSource"));
    for (const [target, delta] of Object.entries(deltas)) {
      if (!delta) continue;
      rules.push(i18n.format(delta < 0 ? "DEDREL.Magic.UI.RuleDiscount" : "DEDREL.Magic.UI.RuleSurcharge",
        { n: Math.abs(delta), name: nameOf(target) }));
    }
    for (const target of forbidden) {
      rules.push(i18n.format("DEDREL.Magic.UI.RuleForbidden", { name: nameOf(target) }));
    }
    for (const [target, cap] of Object.entries(caps)) {
      if (cap.maxRank !== undefined) rules.push(i18n.format("DEDREL.Magic.UI.RuleMaxRank", { name: nameOf(target), n: cap.maxRank }));
      if (Array.isArray(cap.allowedRanks)) rules.push(i18n.format("DEDREL.Magic.UI.RuleAllowedRanks", { name: nameOf(target), list: cap.allowedRanks.join(", ") }));
    }
    for (const modKey of ownedDoctrinal) {
      rules.push(i18n.format("DEDREL.Magic.UI.RuleDoctrinalMod", { name: i18n.localize(`DEDREL.Magic.Modifiers.${modKey}`) }));
    }
    rules.push(forms.length
      ? i18n.format("DEDREL.Magic.UI.RuleForms", { list: forms.map(f => i18n.localize(`DEDREL.Magic.Forms.${f}`)).join(", ") })
      : i18n.localize("DEDREL.Magic.UI.RuleNoForms"));
    context.doctrineRules = rules;

    // --- Techniques ---
    const apShort = i18n.localize("DEDREL.Magic.APShort");
    const knownTechniques = this.isStandalone ? null : (this.actor.system.magic?.techniques || {});
    context.techniques = Object.entries(config.techniques).map(([k, cfg]) => {
      const known = this.isStandalone ? true : !!knownTechniques[k];
      const needsSource = cfg.requiresSource && this.build.sourceScale === "none";
      let reason = "";
      if (!known) reason = i18n.localize("DEDREL.Magic.UI.ReasonNotKnown");
      else if (needsSource) reason = i18n.localize("DEDREL.Magic.UI.ReasonNeedsSource");
      const hint = i18n.localize(`DEDREL.Magic.TechHints.${k}`);
      const price = priceOf(`tech:${k}`, cfg.ap);
      return {
        key: k,
        label: i18n.localize(cfg.label),
        price,
        selected: this.build.techniques.includes(k),
        disabled: !known || needsSource,
        tooltip: [hint, `${price} ${apShort}`, reason].filter(Boolean).join(" · ")
      };
    });

    // --- Modifiers by category ---
    // Doctrinal modifiers are rendered only for their owner (the doctrine/path from
    // the config), Form — only with a non-empty forms list: other rows are hidden.
    const categories = { scale: [], intensity: [], complexity: [] };
    for (const [k, cfg] of Object.entries(config.modifiers)) {
      if (cfg.doctrinal && !ownedDoctrinal.has(k)) continue;
      if (cfg.requiresForms && forms.length === 0) continue;
      const target = `mod:${k}`;
      const isForbidden = forbidden.has(target);
      const cap = caps[target];
      const chosen = this.build.modifiers[k];

      const ranks = [];
      for (let r = 1; r <= 5; r++) {
        const rankCfg = cfg.ranks[r];
        if (!rankCfg) { ranks.push({ rank: r, missing: true }); continue; }
        let reason = "";
        if (isForbidden) reason = i18n.localize("DEDREL.Magic.UI.ReasonForbidden");
        else if (cap?.maxRank !== undefined && r > cap.maxRank) reason = i18n.localize("DEDREL.Magic.UI.ReasonOverCap");
        else if (Array.isArray(cap?.allowedRanks) && !cap.allowedRanks.includes(r)) reason = i18n.localize("DEDREL.Magic.UI.ReasonOverCap");
        else if (!abundant && !doctrineCfg.ignoresSource && r === 5) reason = i18n.localize("DEDREL.Magic.UI.ReasonNeedsAbundant");
        else if (!bypassMaxCost && r > limits.maxModCost) reason = i18n.localize("DEDREL.Magic.UI.ReasonOverMaxCost");

        // Hint "what this rank gives": for damage — dynamically along the Ladder
        // (doctrine shift + Abundant Source bonus), for the rest — RankHints
        const hint = k === "damage"
          ? SpellCalculator.damageFormulaFor(config, doctrineCfg, r, this.build.sourceScale)
          : (i18n.has(`DEDREL.Magic.RankHints.${k}.${r}`) ? i18n.localize(`DEDREL.Magic.RankHints.${k}.${r}`) : "");

        // priceDelta — the modifier's own surcharge (Areas: +1 AP)
        const price = Math.max(0, r + (deltas[target] || 0) + (cfg.priceDelta || 0));
        ranks.push({
          rank: r,
          price,
          // Form/Action Type show text in the cell, the rest show the price
          cellLabel: cfg.textRanks ? (hint || String(r)) : String(price),
          isText: !!cfg.textRanks,
          selected: chosen?.rank === r,
          disabled: !!reason,
          tooltip: [hint, `${price} ${apShort}`, reason].filter(Boolean).join(" · ")
        });
      }

      const row = {
        key: k,
        label: i18n.localize(cfg.label),
        forbidden: isForbidden,
        selected: !!chosen,
        ranks
      };

      // The Power modifier: a choice of "table penalty OR condition" (there are no bonus
      // branches — the system has no universal "to everything" buff). The list contents
      // are always set by the config canon (rankCfg.conditions); the curated compendium
      // magic_conditions (conditionsFromPack) only substitutes the names/versions of those
      // conditions that are already in this list.
      if (k === "power" && chosen) {
        const rankCfg = cfg.ranks[chosen.rank];
        const options = [];
        if (rankCfg?.penalty) {
          options.push({ value: "penalty", label: i18n.format("DEDREL.Magic.UI.PowerPenalty", { n: rankCfg.penalty }) });
        }
        if (rankCfg?.conditions?.length) {
          // The pack is the source of NAMES and curated versions of conditions, but NOT of the list:
          // which conditions are available at a rank is decided only by the config canon.
          // So the pack options are intersected with rankCfg.conditions, otherwise
          // a non-empty pack would remove the Power rank gate entirely.
          const packOpts = cfg.conditionsFromPack ? await this.#packOptions(cfg.conditionsFromPack, "system.key") : [];
          const byKey = new Map(packOpts.map(o => [o.value, o]));
          for (const condKey of rankCfg.conditions) {
            options.push(byKey.get(condKey)
              ?? { value: condKey, label: CONFIG.statusEffects[condKey]?.name || condKey });
          }
        }
        if (options.length > 0) {
          if (!options.some(o => o.value === chosen.option)) chosen.option = options[0].value;
          row.powerOptions = options.map(o => ({ ...o, selected: o.value === chosen.option }));
        }
      }

      // Modifiers with a choice from a pack (Adaptation ← biomancy_adaptations + mutilations).
      // The option value is the item's system.key, NOT its name: renaming an adaptation
      // must not orphan saved spells (the identify-by-key rule).
      // The item's rank lies in flags.dedrel.rank and must match the Modifier's
      // rank: otherwise Adaptation 1 would offer rank 4 wings.
      // The pack is empty or has nothing at this rank — the rank hint remains.
      if (cfg.optionsFromPack && chosen) {
        const packOpts = (await this.#packOptions(cfg.optionsFromPack, "system.key", "flags.dedrel.rank"))
          .filter(o => o.rank === chosen.rank);
        if (packOpts.length > 0) {
          if (!packOpts.some(o => o.value === chosen.option)) chosen.option = packOpts[0].value;
          row.powerOptions = packOpts.map(o => ({ ...o, selected: o.value === chosen.option }));
        }
      }

      // Form: choosing a specific physical type from the doctrine's/path's forms list
      if (k === "form" && chosen) {
        if (!forms.includes(chosen.option)) chosen.option = forms[0];
        row.powerOptions = forms.map(f => ({
          value: f,
          label: i18n.localize(`DEDREL.Magic.Forms.${f}`),
          selected: f === chosen.option
        }));
      }

      // Imbuement (ranks 1–3): choosing the property — skill/defense, weapon damage or DR
      if (k === "imbuement" && chosen) {
        const rankCfg = cfg.ranks[chosen.rank];
        const choices = rankCfg?.imbueChoice || [];
        if (choices.length > 0) {
          if (!choices.includes(chosen.option)) chosen.option = choices[0];
          row.powerOptions = choices.map(v => ({
            value: v,
            label: i18n.format(`DEDREL.Magic.UI.Imbue_${v}`, { n: rankCfg.imbueValue }),
            selected: v === chosen.option
          }));
        }
      }

      // Forbid Defense: choosing "block or dodge" with the same options selector
      if (k === "forbidDefense" && chosen) {
        const choices = cfg.ranks[chosen.rank]?.forbidDefenseChoice || [];
        if (choices.length > 0) {
          if (!choices.includes(chosen.option)) chosen.option = choices[0];
          row.powerOptions = choices.map(v => ({
            value: v,
            label: i18n.localize(`DEDREL.Magic.UI.Forbid_${v}`),
            selected: v === chosen.option
          }));
        }
      }

      categories[cfg.category]?.push(row);
    }
    context.categories = [
      { key: "scale", label: i18n.localize("DEDREL.Magic.Categories.scale"), modifiers: categories.scale },
      { key: "intensity", label: i18n.localize("DEDREL.Magic.Categories.intensity"), modifiers: categories.intensity },
      { key: "complexity", label: i18n.localize("DEDREL.Magic.Categories.complexity"), modifiers: categories.complexity }
    ];

    // --- Total ---
    const { result } = this.#compute(config);
    context.result = result;
    context.errors = SpellCalculator.localizeErrors(result.errors);
    context.breakdownText = SpellCalculator.buildBreakdownText(result.breakdown, result.totalAp);
    context.canSave = result.valid;
    if (this.actor) {
      const res = this.actor.system.resources;
      context.apAvailable = (res?.ap_magic?.value || 0) + (res?.ap_universal?.value || 0);
      context.notEnoughAp = result.totalAp > context.apAvailable;
    }

    return context;
  }

  /* ------------------------------------------------------------------ */
  /*  Input listeners (selects/text aren't covered by the actions clicks)    */
  /* ------------------------------------------------------------------ */

  async _preRender(context, options) {
    await super._preRender(context, options);
    this._savedScrollTop = this.element?.querySelector(".spell-constructor-body")?.scrollTop || 0;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;

    const body = html.querySelector(".spell-constructor-body");
    if (body) body.scrollTop = this._savedScrollTop || 0;

    html.querySelector('[name="spellName"]')?.addEventListener("change", ev => {
      this.build.name = ev.currentTarget.value;
    });
    html.querySelector('[name="doctrine"]')?.addEventListener("change", ev => {
      this.build.doctrine = ev.currentTarget.value;
      this.build.path = "";
      this.build.sourceScale = this.#sceneSourceScale(this.build.doctrine);
      this.render();
    });
    html.querySelector('[name="sourceScale"]')?.addEventListener("change", ev => {
      this.build.sourceScale = ev.currentTarget.value;
      this.render();
    });
    html.querySelector('[name="gmRank"]')?.addEventListener("change", ev => {
      this.gmRank = Math.min(Math.max(parseInt(ev.currentTarget.value) || 1, 1), 6);
      this.render();
    });
    // Modifier option selectors (Power, Forbid Defense): which modifier
    // a selector belongs to is determined by the row's data-mod-key
    html.querySelectorAll('[name="powerOption"]').forEach(el => el.addEventListener("change", ev => {
      const key = ev.currentTarget.dataset.modKey || "power";
      const chosen = this.build.modifiers[key];
      if (chosen) chosen.option = ev.currentTarget.value;
      this.render();
    }));
  }

  /* ------------------------------------------------------------------ */
  /*  Actions                                                            */
  /* ------------------------------------------------------------------ */

  static #onToggleTechnique(event, target) {
    if (target.classList.contains("disabled")) return;
    const key = target.dataset.key;
    const idx = this.build.techniques.indexOf(key);
    if (idx >= 0) this.build.techniques.splice(idx, 1);
    else this.build.techniques.push(key);
    this.render();
  }

  static #onSelectModifierRank(event, target) {
    if (target.classList.contains("disabled")) return;
    const key = target.dataset.key;
    const rank = parseInt(target.dataset.rank);
    const current = this.build.modifiers[key];
    if (current?.rank === rank) delete this.build.modifiers[key]; // a repeated click clears the selection
    else this.build.modifiers[key] = { rank, option: "" };
    this.render();
  }

  static #onSelectPath(event, target) {
    this.build.path = target.dataset.key;
    this.render();
  }

  static async #onSaveSpell() {
    await this.#save({ cast: false });
  }

  static async #onSaveAndCastSpell() {
    await this.#save({ cast: true });
  }

  static async #onCastEphemeral() {
    await this.#save({ cast: true, ephemeral: true });
  }

  /* ------------------------------------------------------------------ */
  /*  Saving                                                         */
  /* ------------------------------------------------------------------ */

  async #save({ cast, ephemeral = false }) {
    const config = CONFIG.DEDREL.magic;
    const { result } = this.#compute(config);
    if (!result.valid) {
      return ui.notifications.warn(SpellCalculator.localizeErrors(result.errors).join(" "));
    }

    const itemData = {
      name: this.build.name || game.i18n.localize("DEDREL.Magic.UI.UnnamedSpell"),
      type: "spell",
      img: "systems/dedrel/assets/icons/items/spell.svg",
      system: {
        ...result.compiled.system,
        description: this.#buildDescription(result)
      },
      effects: this.#buildEffects(result)
    };
    // An "on the fly" cast: a real embedded Item (the chat card buttons look up the item
    // by id on the actor), marked with a flag; deleted at the end of combat (deleteCombat)
    // or by hand. The "pin" button on the character sheet clears the flag.
    if (ephemeral) {
      foundry.utils.setProperty(itemData, "flags.dedrel.ephemeral", true);
    }

    if (this.actor) {
      const [item] = await this.actor.createEmbeddedDocuments("Item", [itemData]);
      if (!ephemeral) {
        ui.notifications.info(game.i18n.format("DEDREL.Magic.UI.SavedToActor", { name: item.name }));
      }
      if (cast) await item.use();
    } else {
      const item = await Item.create(itemData);
      ui.notifications.info(game.i18n.format("DEDREL.Magic.UI.SavedToWorld", { name: item.name }));
    }
  }

  /**
   * Auto-description of the spell for the chat card: the cost breakdown and
   * human-readable consequences (duration, condition, durability).
   */
  #buildDescription(result) {
    const i18n = game.i18n;
    const extras = result.compiled.extras;
    const lines = [`<p><em>${result.compiled.system.total_cost_breakdown}</em></p>`];

    const facts = [];
    const doctrineCfg = CONFIG.DEDREL.magic.doctrines[this.build.doctrine];
    if (!doctrineCfg?.ignoresSource) {
      facts.push(`${i18n.localize("DEDREL.Magic.UI.SourceScale")}: ${i18n.localize(CONFIG.DEDREL.magic.sourceScales[this.build.sourceScale].label)}`);
    }
    if (this.build.path) facts.push(i18n.localize(`DEDREL.Magic.Paths.${this.build.path}`));
    if (extras.durationRounds) facts.push(i18n.format("DEDREL.Magic.UI.DurationRounds", { n: extras.durationRounds }));
    if (extras.durationSpecial) facts.push(i18n.localize(`DEDREL.Magic.UI.Duration_${extras.durationSpecial}`));
    if (extras.durabilityHp) facts.push(i18n.format("DEDREL.Magic.UI.DurabilityHp", { n: extras.durabilityHp }));
    for (const condKey of extras.appliedConditions) {
      const condName = CONFIG.statusEffects[condKey]?.name || condKey;
      facts.push(i18n.format("DEDREL.Magic.UI.AppliesCondition", { name: condName, dc: result.compiled.system.save_dc_formula }));
    }
    if (extras.powerBonus) {
      facts.push(i18n.format("DEDREL.Magic.UI.AppliesBonus", { n: extras.powerBonus, dc: result.compiled.system.save_dc_formula }));
    }
    // Text effects of doctrinal modifiers (Constraint's slow, Dust
    // Veil, Compulsion's forced move, Adaptation...) — a table row from RankHints
    for (const note of extras.factNotes || []) {
      const label = i18n.localize(`DEDREL.Magic.Modifiers.${note.key}`);
      const hintKey = `DEDREL.Magic.RankHints.${note.key}.${note.rank}`;
      const hint = i18n.has(hintKey) ? i18n.localize(hintKey) : "";
      const dc = note.saveDc ? ` (${i18n.format("DEDREL.Magic.UI.SaveDcShort", { dc: note.saveDc })})` : "";
      // A choice from a pack (Adaptation: the adaptation item's name) — appended to the line
      const opt = note.option ? ` — ${note.option}` : "";
      facts.push(`${label} ${note.rank}: ${hint}${opt}${dc}`);
    }
    if (facts.length) lines.push(`<p>${facts.join(" · ")}</p>`);
    return lines.join("");
  }

  /**
   * Item effects: applied with the "Apply Effects" button of the chat card.
   *  - the Power penalty → a transfer:false effect on rolls (duration — by
   *    the rank's durationMode; the build's Duration doesn't extend the condition);
   *  - Imbuement → a transfer:false marker effect (v1: the amount and property in
   *    the description, the specific skill/DR key is edited by the GM; without Duration — 1 round).
   * Conditions (appliedConditions) are applied through the status registry on cast.
   */
  #buildEffects(result) {
    const extras = result.compiled.extras;
    const effects = [];
    if (extras.powerBonus) {
      effects.push({
        // powerBonus is always negative: Power has no positive branches
        name: game.i18n.format("DEDREL.Magic.UI.PowerEffectName", { n: extras.powerBonus }),
        img: "systems/dedrel/assets/icons/items/magic_item.svg",
        transfer: false,
        duration: { rounds: extras.powerEffectRounds || extras.durationRounds || 1 },
        system: {
          changes: [{
            key: "system.bonuses.global_roll",
            type: "add",
            value: String(extras.powerBonus)
          }]
        }
      });
    }
    if (extras.imbue) {
      const optKey = extras.imbue.option ? `DEDREL.Magic.UI.Imbue_${extras.imbue.option}` : "DEDREL.Magic.RankHints.imbuement.4";
      effects.push({
        name: game.i18n.format("DEDREL.Magic.UI.ImbueEffectName", {
          detail: game.i18n.format(optKey, { n: extras.imbue.value })
        }),
        img: "systems/dedrel/assets/icons/items/magic_item.svg",
        transfer: false,
        duration: { rounds: extras.durationRounds || 1 },
        description: game.i18n.localize("DEDREL.Magic.UI.ImbueEffectHint")
      });
    }
    return effects;
  }
}
