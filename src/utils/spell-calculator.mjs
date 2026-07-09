/**
 * Движок расчёта Магического Конструктора: валидация сборки заклинания и
 * компиляция в исполняемые поля Item типа "spell".
 *
 * Единственный источник истины для стоимости/лимитов. Используется:
 *  - Конструктором (SpellConstructorApp) для живого пересчёта;
 *  - ре-валидацией при касте (DedrelItem.use);
 *  - смоук-тестом (макрос "Валидация магии").
 *
 * Модуль не трогает документы и DOM: чистые функции над plain-объектами.
 * game.i18n используется ТОЛЬКО в хелперах локализации (localizeErrors,
 * buildBreakdownText) — сам calculate() от i18n не зависит.
 *
 * Термины:
 *  build   — сборка: { doctrine, path, sourceScale, techniques: ["create"],
 *            modifiers: [{ key, rank, option }] }
 *  context — окружение: { doctrineRank, knownTechniques: {create:1,...},
 *            ignoreKnown } (ignoreKnown — ГМ-режим: не проверять изученность
 *            техник; ранг доктрины ГМ задаёт вручную через doctrineRank)
 */
export class SpellCalculator {

  /**
   * Полный расчёт сборки.
   * @returns {{
   *   valid: boolean,
   *   errors: Array<{code: string, data?: object}>,
   *   totalAp: number,
   *   requiredRank: number,
   *   breakdown: Array<{kind: string, key: string, rank?: number, option?: string, base: number, delta: number, final: number}>,
   *   compiled: object|null  // патч для item.system + служебные поля (см. compile)
   * }}
   */
  static calculate(build, context, config = CONFIG.DEDREL?.magic) {
    const errors = [];
    const breakdown = [];

    if (!config) return { valid: false, errors: [{ code: "no_config" }], totalAp: 0, requiredRank: 0, breakdown, compiled: null };

    const doctrineCfg = config.doctrines?.[build.doctrine];
    if (!doctrineCfg) {
      errors.push({ code: "doctrine_unknown", data: { key: build.doctrine || "?" } });
      return { valid: false, errors, totalAp: 0, requiredRank: 0, breakdown, compiled: null };
    }

    const doctrineRank = Math.max(0, context.doctrineRank | 0);
    if (doctrineRank < 1) errors.push({ code: "no_doctrine_rank" });
    const limits = config.rankLimits[Math.min(Math.max(doctrineRank, 1), 6)];

    // Активный путь двухпутёвой доктрины (гидро/венто)
    let pathKey = "";
    let pathCfg = null;
    if (doctrineCfg.paths) {
      pathKey = build.path || Object.keys(doctrineCfg.paths)[0];
      pathCfg = doctrineCfg.paths[pathKey];
      if (!pathCfg) {
        errors.push({ code: "path_unknown", data: { key: build.path } });
        pathKey = "";
      }
    }

    const { deltas, forbidden, caps } = this.rulesFor(doctrineCfg, pathCfg);

    const sourceScale = build.sourceScale || "none";
    const abundant = !!config.sourceScales[sourceScale]?.ignoresMaxModCost;
    // Режим Изобильного Источника (настройка мира abundantSourceMode):
    //   unlockAll   — снимает maxModCost целиком (все ранги доступны);
    //   requireRank — только открывает 5-й ранг, maxModCost продолжает действовать.
    // context.abundantMode — явный override для тестов вне Foundry.
    const abundantMode = context.abundantMode
      ?? ((typeof game !== "undefined" && game.settings) ? game.settings.get("dedrel", "abundantSourceMode") : "unlockAll");
    const bypassMaxCost = abundant && abundantMode === "unlockAll";

    // --- Техники ---
    const techniques = build.techniques || [];
    const seenTech = new Set();
    for (const t of techniques) {
      const cfg = config.techniques[t];
      if (!cfg) { errors.push({ code: "technique_unknown", data: { key: t } }); continue; }
      if (seenTech.has(t)) { errors.push({ code: "technique_duplicate", data: { key: t } }); continue; }
      seenTech.add(t);
      if (!context.ignoreKnown && !(context.knownTechniques?.[t])) {
        errors.push({ code: "technique_not_known", data: { key: t } });
      }
      if (cfg.requiresSource && sourceScale === "none") {
        errors.push({ code: "technique_needs_source", data: { key: t } });
      }
      const base = cfg.ap;
      const delta = deltas[`tech:${t}`] || 0;
      breakdown.push({ kind: "technique", key: t, base, delta, final: Math.max(0, base + delta) });
    }
    if (seenTech.size === 0) errors.push({ code: "no_techniques" });
    if (seenTech.size > limits.techniques) {
      errors.push({ code: "too_many_techniques", data: { count: seenTech.size, max: limits.techniques } });
    }

    // --- Модификаторы ---
    const modifiers = build.modifiers || [];
    const chosenModKeys = new Set(modifiers.map(m => m.key));
    const seenMods = new Set();
    const reportedConflicts = new Set();
    let maxModRank = 0;

    for (const m of modifiers) {
      const cfg = config.modifiers[m.key];
      if (!cfg) { errors.push({ code: "modifier_unknown", data: { key: m.key } }); continue; }
      if (seenMods.has(m.key)) { errors.push({ code: "modifier_duplicate", data: { key: m.key } }); continue; }
      seenMods.add(m.key);

      const rank = m.rank | 0;
      const rankCfg = cfg.ranks[rank];
      if (!rankCfg) {
        errors.push({ code: "modifier_rank_unavailable", data: { key: m.key, rank } });
        continue;
      }

      const target = `mod:${m.key}`;
      if (forbidden.has(target)) {
        errors.push({ code: "modifier_forbidden", data: { key: m.key } });
        continue;
      }
      const cap = caps[target];
      if (cap) {
        if (cap.maxRank !== undefined && rank > cap.maxRank) {
          errors.push({ code: "modifier_over_cap", data: { key: m.key, rank, max: cap.maxRank } });
        }
        if (Array.isArray(cap.allowedRanks) && !cap.allowedRanks.includes(rank)) {
          errors.push({ code: "modifier_rank_not_allowed", data: { key: m.key, rank } });
        }
      }

      // Взаимоисключения (Цели ↔ Области, Области между собой) — пара репортится один раз
      for (const other of cfg.exclusiveWith || []) {
        if (chosenModKeys.has(other)) {
          const pairId = [m.key, other].sort().join("+");
          if (!reportedConflicts.has(pairId)) {
            reportedConflicts.add(pairId);
            errors.push({ code: "modifier_conflict", data: { key: m.key, other } });
          }
        }
      }
      // Конус кастуется от клетки заклинателя — Дальность неприменима
      if (cfg.noRange && chosenModKeys.has("range")) {
        errors.push({ code: "cone_no_range", data: { key: m.key } });
      }

      // Ранговые лимиты. 5-й ранг всегда требует Изобильного Источника;
      // снимает ли изобилие maxModCost для остальных проверок — зависит от режима.
      if (!abundant && rank === 5) {
        errors.push({ code: "rank5_needs_abundant", data: { key: m.key } });
      } else if (!bypassMaxCost && rank > limits.maxModCost) {
        errors.push({ code: "over_max_mod_cost", data: { key: m.key, rank, max: limits.maxModCost } });
      }

      maxModRank = Math.max(maxModRank, rank);
      const base = rank; // базовая цена модификатора в ОД равна его рангу
      const delta = deltas[target] || 0;
      breakdown.push({ kind: "modifier", key: m.key, rank, option: m.option || "", base, delta, final: Math.max(0, base + delta) });
    }
    if (seenMods.size > limits.modifiers) {
      errors.push({ code: "too_many_modifiers", data: { count: seenMods.size, max: limits.modifiers } });
    }

    const totalAp = breakdown.reduce((sum, b) => sum + b.final, 0);

    // Минимальный ранг доктрины, при котором сборка легальна (для doctrine_rank_req).
    // В режиме unlockAll изобильный источник исключает maxModCost из требования.
    let requiredRank = 6;
    for (let r = 1; r <= 6; r++) {
      const lim = config.rankLimits[r];
      const costOk = bypassMaxCost || maxModRank <= lim.maxModCost;
      if (seenTech.size <= lim.techniques && seenMods.size <= lim.modifiers && costOk) {
        requiredRank = r;
        break;
      }
    }

    const valid = errors.length === 0;
    const compiled = valid
      ? this.compile(build, { config, doctrineCfg, pathKey, pathCfg, breakdown, totalAp, requiredRank, sourceScale })
      : null;

    return { valid, errors, totalAp, requiredRank, breakdown, compiled };
  }

  /**
   * Сводит ценовые дельты и капы доктрины и активного пути в единые карты.
   * target: "tech:<key>" | "mod:<key>". Дельты складываются.
   * Используется и в calculate(), и в UI Конструктора (подсветка цен/запретов).
   */
  static rulesFor(doctrineCfg, pathCfg) {
    const deltas = {};
    const forbidden = new Set();
    const caps = {};
    const collect = (rules) => {
      for (const r of rules || []) {
        if (r.forbidden) forbidden.add(r.target);
        if (typeof r.delta === "number") deltas[r.target] = (deltas[r.target] || 0) + r.delta;
        if (r.maxRank !== undefined || r.allowedRanks !== undefined) {
          caps[r.target] = { ...(caps[r.target] || {}), ...r };
        }
      }
    };
    collect(doctrineCfg?.affinity);
    collect(doctrineCfg?.restriction);
    collect(doctrineCfg?.caps);
    if (pathCfg) {
      collect(pathCfg.affinity);
      collect(pathCfg.restriction);
      collect(pathCfg.caps);
    }
    return { deltas, forbidden, caps };
  }

  /**
   * Компиляция валидной сборки в патч item.system (+ служебные поля caster-side).
   * Возвращаемый объект содержит ТОЛЬКО поля схемы SpellDataModel и блок extras.
   */
  static compile(build, { config, doctrineCfg, pathKey, pathCfg, breakdown, totalAp, requiredRank, sourceScale }) {
    const mods = {};
    for (const b of breakdown) {
      if (b.kind === "modifier") mods[b.key] = b;
    }
    const rankData = (key) => config.modifiers[key]?.ranks?.[mods[key]?.rank] || null;

    const sys = {
      doctrine: build.doctrine,
      doctrine_rank_req: requiredRank,
      doctrine_path: pathKey,
      source_scale: sourceScale,
      chosen_techniques: breakdown.filter(b => b.kind === "technique").map(b => b.key),
      chosen_modifiers: breakdown.filter(b => b.kind === "modifier")
        .map(b => ({ key: b.key, rank: b.rank, ap: b.final, option: b.option })),
      total_cost_breakdown: this.buildBreakdownText(breakdown, totalAp),

      ap_cost: totalAp,
      skill: "magical_attacks",
      attack_bonus: rankData("accuracy")?.attackBonus || 0,

      action_type: {
        action: !rankData("actionType"),
        chain: !!rankData("actionType")?.chain,
        reaction: !!rankData("actionType")?.reaction,
        free: false
      },

      target_type: "creature",
      target_range: "",
      target_value: 1,
      template_shape: "",
      template_size: 0,

      formula_attack: "",
      formula_damage: "",
      formula_heal: "",
      save_attribute: "",
      save_dc_formula: ""
    };

    // ЛЮБОЕ сотворение магии требует фокуса: экипированного оружия с типом
    // "магическое" (посох, жезл; у Пути Эха — концептуально музыкальный инструмент,
    // отдельной проверки нет). Диалог использования предложит выбрать фокус;
    // его бонусы к навыку "Магические атаки" вешаются transfer-эффектами оружия
    // и активны только пока фокус экипирован (гейт по system.equipped —
    // DedrelActor#allApplicableEffects; ядро само такого подавления НЕ делает).
    sys.req_weapon_type = { melee: false, ranged: false, shield: false, magic: true };

    // --- Масштаб: дальность / цели / области ---
    // Правила оперируют гексами, движок шаблонов (chat.mjs placeTemplate →
    // placeTemplatePreview) — метрами сцены. template_size пишем СРАЗУ в метрах
    // (1 гекс = config.hexSizeMeters); target_range оставляем в гексах — это
    // язык правил, поле чисто отображательное.
    const hexM = config.hexSizeMeters || 2;
    const range = rankData("range");
    if (range) sys.target_range = String(range.hexes);
    const targets = rankData("targets");
    if (targets) sys.target_value = targets.targets;
    const cone = rankData("area_cone");
    // Конус 60° от клетки заклинателя: дальний ряд из N гексов лежит на дистанции N-1 гексов
    if (cone) { sys.template_shape = "cone"; sys.template_size = (cone.farRowHexes - 1) * hexM; sys.target_type = "area"; }
    const circle = rankData("area_circle");
    if (circle) { sys.template_shape = "circle"; sys.template_size = circle.radius * hexM; sys.target_type = "area"; }
    const line = rankData("area_line");
    if (line) { sys.template_shape = "ray"; sys.template_size = line.hexes * hexM; sys.target_type = "area"; }

    // --- Урон: дайс от пути (Эхо: d4), тип — Форма > спец-путь > базовый тип доктрины ---
    const damage = rankData("damage");
    if (damage) {
      const die = pathCfg?.special?.damageDie || config.modifiers.damage.die;
      const form = rankData("form");
      let damageType = "";
      if (form && form.damageType && form.damageType !== "complex") damageType = form.damageType;
      else if (pathCfg?.special?.damageType) damageType = pathCfg.special.damageType;
      else if (doctrineCfg.baseDamageType) damageType = doctrineCfg.baseDamageType;
      sys.formula_damage = `${damage.diceCount}${die}` + (damageType ? `[${damageType}]` : "");
    }

    // --- Сила: спасбросок + эффект (табличный бонус/штраф ИЛИ состояние) ---
    const extras = {
      appliedConditions: [],
      powerBonus: 0,
      durationRounds: 0,
      durationSpecial: "",
      durabilityHp: rankData("durability")?.hp || 0
    };

    const power = rankData("power");
    if (power) {
      sys.save_dc_formula = String(power.saveDc);
      // Атрибут спасброска правилами не зафиксирован; Воля — дефолт, ГМ меняет на листе
      sys.save_attribute = "will";
      const option = mods.power.option;
      if (option && option !== "bonus" && option !== "penalty") {
        // option = ключ condition-предмета: актуальная версия подтягивается из
        // компендиума Conditions при применении (toggleStatusEffect, Фаза 4)
        extras.appliedConditions.push(option);
      } else if (power.bonus) {
        extras.powerBonus = option === "penalty" ? -power.bonus : power.bonus;
      }
    }

    const duration = rankData("duration");
    if (duration) {
      if (duration.rounds) extras.durationRounds = duration.rounds;
      if (duration.special) extras.durationSpecial = duration.special;
    }

    return { system: sys, extras };
  }

  /**
   * Человекочитаемая расшифровка стоимости: "Создать 2 + Урон 3−1=2 = 4 ОД".
   * Вне Foundry (нет game) вместо названий используются ключи.
   */
  static buildBreakdownText(breakdown, totalAp) {
    const hasI18n = typeof game !== "undefined" && game.i18n;
    const parts = breakdown.map(b => {
      const labelKey = b.kind === "technique" ? `DEDREL.Magic.Techniques.${b.key}` : `DEDREL.Magic.Modifiers.${b.key}`;
      const label = hasI18n ? game.i18n.localize(labelKey) : b.key;
      const rankSuffix = b.kind === "modifier" ? ` ${b.rank}` : "";
      const price = b.delta === 0
        ? `${b.final}`
        : `${b.base}${b.delta > 0 ? "+" : "−"}${Math.abs(b.delta)}=${b.final}`;
      return `${label}${rankSuffix} [${price}]`;
    });
    const apLabel = hasI18n ? game.i18n.localize("DEDREL.Magic.APShort") : "AP";
    return `${parts.join(" + ")} = ${totalAp} ${apLabel}`;
  }

  /** Локализует массив ошибок calculate() в строки для UI/чата. */
  static localizeErrors(errors) {
    return errors.map(e => {
      const data = { ...(e.data || {}) };
      // Подставляем локализованные названия компонентов вместо сырых ключей
      if (data.key && game.i18n.has(`DEDREL.Magic.Modifiers.${data.key}`)) {
        data.key = game.i18n.localize(`DEDREL.Magic.Modifiers.${data.key}`);
      } else if (data.key && game.i18n.has(`DEDREL.Magic.Techniques.${data.key}`)) {
        data.key = game.i18n.localize(`DEDREL.Magic.Techniques.${data.key}`);
      }
      if (data.other && game.i18n.has(`DEDREL.Magic.Modifiers.${data.other}`)) {
        data.other = game.i18n.localize(`DEDREL.Magic.Modifiers.${data.other}`);
      }
      return game.i18n.format(`DEDREL.Magic.Errors.${e.code}`, data);
    });
  }

  /**
   * Собирает context для calculate() из актора.
   * Отдельный хелпер, чтобы Конструктор/ре-валидация не дублировали чтение полей.
   */
  static contextFromActor(actor, doctrineKey) {
    return {
      doctrineRank: actor.system.doctrines?.[doctrineKey]?.rank || 0,
      knownTechniques: actor.system.magic?.techniques || {},
      ignoreKnown: false
    };
  }
}
