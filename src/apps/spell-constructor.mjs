const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
import { SpellCalculator } from "../utils/spell-calculator.mjs";

/**
 * Конструктор Заклинаний (Магический Конструктор).
 *
 * Игрок собирает заклинание из Доктрины + Техник + Модификаторов с живым
 * пересчётом стоимости и лимитов (движок: SpellCalculator), после чего
 * сохраняет его как Item типа "spell" (и опционально сразу кастует через
 * штатный DedrelItem.use()).
 *
 * Режимы:
 *  - Актор: доступны только разблокированные доктрины и изученные техники,
 *    лимиты от ранга доктрины актора.
 *  - ГМ-standalone (без актора): все доктрины из конфига, ранг задаётся
 *    вручную, изученность техник не проверяется; результат — мировой предмет
 *    (пресозданные заклинания, затем перетаскиваются в компендиум).
 *
 * Состояние сборки живёт в this.build (НЕ в форме документа) — это сознательный
 * обход FormDataExtended (см. FOUNDRY V14 QUIRKS.md, раздел 7).
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
   * @param {Actor|null} options.actor - актор-заклинатель; null = ГМ-standalone
   * @param {Item|null} options.spellItem - существующее заклинание для префилла
   */
  constructor(options = {}) {
    super(options);
    this.actor = options.actor || null;
    this.gmRank = 3; // ранг доктрины в standalone-режиме (селект в шапке)

    this.build = {
      name: "",
      doctrine: "",
      path: "",
      sourceScale: "none",
      techniques: [],
      // Выбранные модификаторы: { <key>: { rank, option } }
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

  /** Префилл сборки из сохранённого spell-Item (кнопка "Открыть в конструкторе"). */
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

  /** Доктрины, доступные в текущем режиме (только описанные в конфиге Конструктора). */
  #availableDoctrines(config) {
    const keys = Object.keys(config.doctrines);
    if (this.isStandalone) return keys;
    return keys.filter(k => this.actor.system.doctrines?.[k]?.unlocked);
  }

  /** Порядок уровней источника для сравнения "не выше сценового". */
  static SOURCE_ORDER = ["none", "any", "abundant"];

  /**
   * Уровень источника доктрины на активной сцене (флаг ГМа, макрос "Источники сцены").
   * null = флаг не задан → без ограничений (ГМ рулит словами).
   */
  #sceneSourceScale(doctrineKey) {
    const flag = canvas?.scene?.getFlag("dedrel", "sourceScale");
    return flag?.[doctrineKey] ?? null;
  }

  /** Дефолт источника при выборе доктрины: сценовый уровень либо "none". */
  #defaultSourceScale(doctrineKey) {
    return this.#sceneSourceScale(doctrineKey) ?? "none";
  }

  /** build → плоский формат SpellCalculator + context текущего режима. */
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

    // --- Доктрины ---
    const doctrineKeys = this.#availableDoctrines(config);
    if (!this.build.doctrine && doctrineKeys.length > 0) {
      this.build.doctrine = doctrineKeys[0];
      this.build.sourceScale = this.#defaultSourceScale(this.build.doctrine);
    }
    context.hasDoctrines = doctrineKeys.length > 0;
    context.doctrines = doctrineKeys.map(k => ({
      key: k,
      label: i18n.localize(`DEDREL.Magic.Doctrines.${k}`),
      rank: this.isStandalone ? this.gmRank : (this.actor.system.doctrines[k]?.rank || 0),
      selected: k === this.build.doctrine
    }));

    const doctrineCfg = config.doctrines[this.build.doctrine];
    if (!doctrineCfg) return context; // нет доступных доктрин — шаблон покажет заглушку

    const doctrineRank = this.isStandalone
      ? this.gmRank
      : (this.actor.system.doctrines[this.build.doctrine]?.rank || 0);
    context.doctrineRank = doctrineRank;
    const limits = config.rankLimits[Math.min(Math.max(doctrineRank, 1), 6)];
    context.limits = limits;

    // --- Путь двухпутёвой доктрины ---
    context.paths = null;
    let pathCfg = null;
    if (doctrineCfg.paths) {
      const pathKeys = Object.keys(doctrineCfg.paths);
      if (!pathKeys.includes(this.build.path)) this.build.path = pathKeys[0];
      pathCfg = doctrineCfg.paths[this.build.path];
      context.paths = pathKeys.map(k => ({
        key: k,
        label: i18n.localize(`DEDREL.Magic.Paths.${k}`),
        selected: k === this.build.path
      }));
    } else {
      this.build.path = "";
    }

    // --- Масштаб Источника ---
    // Флаг сцены (ГМ-макрос "Источники сцены") — потолок для игроков: можно выбрать
    // уровень НИЖЕ сценового (осторожная магия), но не выше. ГМ не ограничен;
    // отсутствие флага = без ограничений (уровень источника судит ГМ устно).
    const sceneScale = this.#sceneSourceScale(this.build.doctrine);
    const sceneIdx = sceneScale === null ? Infinity : SpellConstructorApp.SOURCE_ORDER.indexOf(sceneScale);
    context.sourceScales = Object.entries(config.sourceScales).map(([k, v]) => {
      const overSceneCap = !game.user.isGM && SpellConstructorApp.SOURCE_ORDER.indexOf(k) > sceneIdx;
      return {
        key: k,
        label: i18n.localize(v.label),
        selected: k === this.build.sourceScale,
        disabled: overSceneCap
      };
    });
    context.sceneScaleLabel = sceneScale !== null
      ? i18n.localize(config.sourceScales[sceneScale].label)
      : null;
    const abundant = !!config.sourceScales[this.build.sourceScale]?.ignoresMaxModCost;
    // Режим изобилия (настройка мира): снимает ли изобильный источник maxModCost
    const bypassMaxCost = abundant && game.settings.get("dedrel", "abundantSourceMode") === "unlockAll";

    // --- Правила цен/запретов для подсветки (та же логика, что в calculate) ---
    const { deltas, forbidden, caps } = SpellCalculator.rulesFor(doctrineCfg, pathCfg);
    const priceOf = (target, base) => Math.max(0, base + (deltas[target] || 0));

    // --- Техники ---
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

    // --- Модификаторы по категориям ---
    const categories = { scale: [], intensity: [], complexity: [] };
    for (const [k, cfg] of Object.entries(config.modifiers)) {
      const target = `mod:${k}`;
      const isForbidden = forbidden.has(target);
      const cap = caps[target];
      const chosen = this.build.modifiers[k];

      // Дайс урона зависит от активного пути (Эхо: d4) — подсказка считается динамически
      const damageDie = pathCfg?.special?.damageDie || config.modifiers.damage.die;

      const ranks = [];
      for (let r = 1; r <= 5; r++) {
        const rankCfg = cfg.ranks[r];
        if (!rankCfg) { ranks.push({ rank: r, missing: true }); continue; }
        let reason = "";
        if (isForbidden) reason = i18n.localize("DEDREL.Magic.UI.ReasonForbidden");
        else if (cap?.maxRank !== undefined && r > cap.maxRank) reason = i18n.localize("DEDREL.Magic.UI.ReasonOverCap");
        else if (Array.isArray(cap?.allowedRanks) && !cap.allowedRanks.includes(r)) reason = i18n.localize("DEDREL.Magic.UI.ReasonOverCap");
        else if (!abundant && r === 5) reason = i18n.localize("DEDREL.Magic.UI.ReasonNeedsAbundant");
        else if (!bypassMaxCost && r > limits.maxModCost) reason = i18n.localize("DEDREL.Magic.UI.ReasonOverMaxCost");

        // Подсказка "что даёт этот ранг": для урона — динамически (дайс пути),
        // для остальных — из локали RankHints
        const hint = k === "damage"
          ? `${rankCfg.diceCount}${damageDie}`
          : (i18n.has(`DEDREL.Magic.RankHints.${k}.${r}`) ? i18n.localize(`DEDREL.Magic.RankHints.${k}.${r}`) : "");

        const price = priceOf(target, r);
        ranks.push({
          rank: r,
          price,
          // Форма/Тип действия показывают в ячейке текст, остальные — цену
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

      // Модификатор "Сила" рангов 3-5: выбор "табличный бонус/штраф ИЛИ состояние".
      // Названия состояний берём из реестра статусов (собран из компендиума Conditions).
      if (k === "power" && chosen) {
        const rankCfg = cfg.ranks[chosen.rank];
        const options = [];
        if (rankCfg?.bonus) {
          options.push({ value: "bonus", label: i18n.format("DEDREL.Magic.UI.PowerBonus", { n: rankCfg.bonus }) });
          options.push({ value: "penalty", label: i18n.format("DEDREL.Magic.UI.PowerPenalty", { n: rankCfg.bonus }) });
        }
        for (const condKey of rankCfg?.conditions || []) {
          options.push({ value: condKey, label: CONFIG.statusEffects[condKey]?.name || condKey });
        }
        if (options.length > 0) {
          if (!chosen.option) chosen.option = options[0].value;
          row.powerOptions = options.map(o => ({ ...o, selected: o.value === chosen.option }));
        }
      }

      categories[cfg.category]?.push(row);
    }
    context.categories = [
      { key: "scale", label: i18n.localize("DEDREL.Magic.Categories.scale"), modifiers: categories.scale },
      { key: "intensity", label: i18n.localize("DEDREL.Magic.Categories.intensity"), modifiers: categories.intensity },
      { key: "complexity", label: i18n.localize("DEDREL.Magic.Categories.complexity"), modifiers: categories.complexity }
    ];

    // --- Итог ---
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
  /*  Слушатели инпутов (селекты/текст не покрываются actions-кликами)    */
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
      this.build.sourceScale = this.#defaultSourceScale(this.build.doctrine);
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
    html.querySelector('[name="powerOption"]')?.addEventListener("change", ev => {
      const chosen = this.build.modifiers.power;
      if (chosen) chosen.option = ev.currentTarget.value;
      this.render();
    });
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
    if (current?.rank === rank) delete this.build.modifiers[key]; // повторный клик снимает выбор
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
  /*  Сохранение                                                         */
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
      img: "systems/dedrel/assets/icons/items/magic_item.svg",
      system: {
        ...result.compiled.system,
        description: this.#buildDescription(result)
      },
      effects: this.#buildEffects(result)
    };
    // Каст "на лету": реальный embedded Item (кнопки карточки чата ищут предмет
    // по id на акторе), помеченный флагом; удаляется в конце боя (deleteCombat)
    // или вручную. Кнопка "закрепить" на чаршите снимает флаг.
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
   * Автоописание заклинания для карточки чата: расшифровка стоимости и
   * человекочитаемые следствия (длительность, состояние, прочность).
   */
  #buildDescription(result) {
    const i18n = game.i18n;
    const extras = result.compiled.extras;
    const lines = [`<p><em>${result.compiled.system.total_cost_breakdown}</em></p>`];

    const facts = [];
    facts.push(`${i18n.localize("DEDREL.Magic.UI.SourceScale")}: ${i18n.localize(CONFIG.DEDREL.magic.sourceScales[this.build.sourceScale].label)}`);
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
    if (facts.length) lines.push(`<p>${facts.join(" · ")}</p>`);
    return lines.join("");
  }

  /**
   * Эффекты предмета: табличный бонус/штраф «Силы» → transfer:false эффект,
   * который накладывается кнопкой «Применить эффекты» карточки чата.
   * Состояния (appliedConditions) вешаются через реестр статусов при касте (Фаза 4).
   */
  #buildEffects(result) {
    const extras = result.compiled.extras;
    if (!extras.powerBonus) return [];
    const rounds = extras.durationRounds || 1;
    return [{
      name: game.i18n.format("DEDREL.Magic.UI.PowerEffectName", {
        n: `${extras.powerBonus > 0 ? "+" : ""}${extras.powerBonus}`
      }),
      img: "systems/dedrel/assets/icons/items/magic_item.svg",
      transfer: false,
      duration: { rounds },
      system: {
        changes: [{
          key: "system.bonuses.global_roll",
          type: "add",
          value: String(extras.powerBonus)
        }]
      }
    }];
  }
}
