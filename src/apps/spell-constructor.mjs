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

  /**
   * Опции селекта из компендиума: [{ value, label }], label = имя предмета.
   * keyField задан ("system.key") — value берётся из него (ключ состояния,
   * записи без ключа отбрасываются); иначе value = имя предмета.
   * Индекс пака кэшируется ядром — повторные вызовы дёшевы.
   */
  async #packOptions(packId, keyField = "") {
    const pack = game.packs.get(packId);
    if (!pack) return [];
    const index = keyField ? await pack.getIndex({ fields: [keyField] }) : await pack.getIndex();
    return [...index]
      .map(e => ({ value: keyField ? (foundry.utils.getProperty(e, keyField) || "") : e.name, label: e.name }))
      .filter(o => o.value)
      .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
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

    // --- Путь: купленная талантом специализация (гайд §1); "без пути" легален всегда ---
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

    // --- Масштаб Источника (доктрины ignoresSource живут вне этой концепции) ---
    context.hideSource = !!doctrineCfg.ignoresSource;
    if (context.hideSource) this.build.sourceScale = "none";
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
    // Доктринные модификаторы и формы (путь переопределяет формы, добавляет модификаторы)
    const ownedDoctrinal = new Set([...(doctrineCfg.modifiers || []), ...(pathCfg?.modifiers || [])]);
    const forms = pathCfg?.forms ?? doctrineCfg.forms ?? [];

    // --- Анонс особенностей доктрины/пути: сродства, ограничения, запреты, капы ---
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
    // Доктринные модификаторы рендерятся только владельцу (доктрине/пути из
    // конфига), Форма — только при непустом списке форм: чужие строки скрыты.
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

        // Подсказка "что даёт этот ранг": для урона — динамически по Лестнице
        // (сдвиг доктрины + бонус Изобильного Источника), для остальных — RankHints
        const hint = k === "damage"
          ? SpellCalculator.damageFormulaFor(config, doctrineCfg, r, this.build.sourceScale)
          : (i18n.has(`DEDREL.Magic.RankHints.${k}.${r}`) ? i18n.localize(`DEDREL.Magic.RankHints.${k}.${r}`) : "");

        // priceDelta — собственная надбавка модификатора (Области: +1 ОД)
        const price = Math.max(0, r + (deltas[target] || 0) + (cfg.priceDelta || 0));
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

      // Модификатор "Сила": выбор "табличный штраф ИЛИ состояние" (бонусных
      // ветвей больше нет — бафы уехали в "Воодушевление" Эха). Список состояний —
      // кураторский компендиум magic_conditions (conditionsFromPack); при пустом
      // паке — канонические массивы conditions ранга (имена из реестра статусов).
      if (k === "power" && chosen) {
        const rankCfg = cfg.ranks[chosen.rank];
        const options = [];
        if (rankCfg?.penalty) {
          options.push({ value: "penalty", label: i18n.format("DEDREL.Magic.UI.PowerPenalty", { n: rankCfg.penalty }) });
        }
        if (rankCfg?.conditions?.length) {
          const packOpts = cfg.conditionsFromPack ? await this.#packOptions(cfg.conditionsFromPack, "system.key") : [];
          if (packOpts.length) {
            options.push(...packOpts);
          } else {
            for (const condKey of rankCfg.conditions) {
              options.push({ value: condKey, label: CONFIG.statusEffects[condKey]?.name || condKey });
            }
          }
        }
        if (options.length > 0) {
          if (!options.some(o => o.value === chosen.option)) chosen.option = options[0].value;
          row.powerOptions = options.map(o => ({ ...o, selected: o.value === chosen.option }));
        }
      }

      // Модификаторы с выбором из пака (Адаптация ← biomancy_adaptations):
      // селект показывает имена предметов компендиума; пуст — остаётся подсказка ранга
      if (cfg.optionsFromPack && chosen) {
        const packOpts = await this.#packOptions(cfg.optionsFromPack);
        if (packOpts.length > 0) {
          if (!packOpts.some(o => o.value === chosen.option)) chosen.option = packOpts[0].value;
          row.powerOptions = packOpts.map(o => ({ ...o, selected: o.value === chosen.option }));
        }
      }

      // Форма: выбор конкретного физического типа из списка форм доктрины/пути
      if (k === "form" && chosen) {
        if (!forms.includes(chosen.option)) chosen.option = forms[0];
        row.powerOptions = forms.map(f => ({
          value: f,
          label: i18n.localize(`DEDREL.Magic.Forms.${f}`),
          selected: f === chosen.option
        }));
      }

      // Насыщение (ранги 1–3): выбор свойства — навык/защита, урон оружию или DR
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

      // Запрет защиты: выбор "блок или уклонение" тем же селектом опций
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
    // Селекты опций модификаторов ("Сила", "Запрет защиты"): какому модификатору
    // принадлежит селект, определяет data-mod-key строки
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
      img: "systems/dedrel/assets/icons/items/spell.svg",
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
    // Текстовые эффекты доктринных модификаторов (замедление Сковывания, Пыльная
    // завеса, форс-мув Принуждения, Адаптация...) — строка таблицы из RankHints
    for (const note of extras.factNotes || []) {
      const label = i18n.localize(`DEDREL.Magic.Modifiers.${note.key}`);
      const hintKey = `DEDREL.Magic.RankHints.${note.key}.${note.rank}`;
      const hint = i18n.has(hintKey) ? i18n.localize(hintKey) : "";
      const dc = note.saveDc ? ` (${i18n.format("DEDREL.Magic.UI.SaveDcShort", { dc: note.saveDc })})` : "";
      // Выбор из пака (Адаптация: имя предмета-адаптации) — дописываем к строке
      const opt = note.option ? ` — ${note.option}` : "";
      facts.push(`${label} ${note.rank}: ${hint}${opt}${dc}`);
    }
    if (facts.length) lines.push(`<p>${facts.join(" · ")}</p>`);
    return lines.join("");
  }

  /**
   * Эффекты предмета: накладываются кнопкой «Применить эффекты» карточки чата.
   *  - штраф «Силы» / бонус «Воодушевления» → transfer:false эффект на броски
   *    (длительность — по durationMode ранга, иначе от Длительности сборки);
   *  - «Насыщение» → transfer:false эффект-маркер (v1: величина и свойство в
   *    описании, конкретный ключ навыка/DR правит ГМ; без Длительности — 1 раунд).
   * Состояния (appliedConditions) вешаются через реестр статусов при касте.
   */
  #buildEffects(result) {
    const extras = result.compiled.extras;
    const effects = [];
    if (extras.powerBonus) {
      effects.push({
        name: game.i18n.format("DEDREL.Magic.UI.PowerEffectName", {
          n: `${extras.powerBonus > 0 ? "+" : ""}${extras.powerBonus}`
        }),
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
