/**
 * Spell Constructor calculation engine: validating a spell build and
 * compiling it into the executable fields of an Item of type "spell".
 *
 * The single source of truth for cost/limits. Used by:
 *  - the Constructor (SpellConstructorApp) for live recalculation;
 *  - re-validation on cast (DedrelItem.use);
 *  - the smoke test (the "Magic Validation" macro).
 *
 * The module doesn't touch documents or the DOM: pure functions over plain objects.
 * game.i18n is used ONLY in the localization helpers (localizeErrors,
 * buildBreakdownText) — calculate() itself doesn't depend on i18n.
 *
 * Terms:
 *  build   — the build: { doctrine, path, sourceScale, techniques: ["create"],
 *            modifiers: [{ key, rank, option }] }. path: "" = no path (base).
 *  context — the environment: { doctrineRank, knownTechniques: {create:1,...},
 *            knownPaths: {ice:1,...}, ignoreKnown } (ignoreKnown — GM mode:
 *            don't check whether techniques and paths are learned; the GM sets the doctrine rank
 *            by hand via doctrineRank)
 */
export class SpellCalculator {

  /**
   * Full calculation of a build.
   * @returns {{
   *   valid: boolean,
   *   errors: Array<{code: string, data?: object}>,
   *   totalAp: number,
   *   requiredRank: number,
   *   breakdown: Array<{kind: string, key: string, rank?: number, option?: string, base: number, delta: number, final: number}>,
   *   compiled: object|null  // patch for item.system + service fields (see compile)
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

    // A path is a specialization purchased with a talent; a build without a path is always legal
    let pathKey = "";
    let pathCfg = null;
    if (build.path) {
      pathCfg = doctrineCfg.paths?.[build.path];
      if (!pathCfg) {
        errors.push({ code: "path_unknown", data: { key: build.path } });
      } else if (!context.ignoreKnown && !(context.knownPaths?.[build.path])) {
        errors.push({ code: "path_not_known", data: { key: build.path } });
        pathCfg = null;
      } else {
        pathKey = build.path;
      }
    }

    const { deltas, forbidden, caps } = this.rulesFor(doctrineCfg, pathCfg);
    // Doctrinal modifiers owned by the doctrine (+ the path adds its own)
    const ownedDoctrinal = new Set([...(doctrineCfg.modifiers || []), ...(pathCfg?.modifiers || [])]);
    // Damage forms: the path's list overrides the doctrine's list entirely
    const forms = pathCfg?.forms ?? doctrineCfg.forms ?? [];

    // Doctrines with ignoresSource (Telekinesis, Biomancy): the Source concept
    // doesn't apply — the scale is forced to "none", move is always available,
    // rank 5 of the modifiers is unlocked by Doctrine Rank 5 (the regular maxModCost).
    const ignoresSource = !!doctrineCfg.ignoresSource;
    const sourceScale = ignoresSource ? "none" : (build.sourceScale || "none");
    const sourceCfg = config.sourceScales[sourceScale];
    const abundant = !!sourceCfg?.ignoresMaxModCost;
    // Abundant Source mode (the abundantSourceMode world setting):
    //   unlockAll   — lifts maxModCost entirely (all ranks available);
    //   requireRank — only unlocks rank 5, maxModCost stays in force.
    // context.abundantMode — explicit override for tests outside Foundry.
    const abundantMode = context.abundantMode
      ?? ((typeof game !== "undefined" && game.settings) ? game.settings.get("dedrel", "abundantSourceMode") : "unlockAll");
    const bypassMaxCost = abundant && abundantMode === "unlockAll";

    // --- Techniques ---
    const techniques = build.techniques || [];
    const seenTech = new Set();
    for (const t of techniques) {
      const cfg = config.techniques[t];
      if (!cfg) { errors.push({ code: "technique_unknown", data: { key: t } }); continue; }
      if (seenTech.has(t)) { errors.push({ code: "technique_duplicate", data: { key: t } }); continue; }
      seenTech.add(t);
      if (forbidden.has(`tech:${t}`)) {
        errors.push({ code: "technique_forbidden", data: { key: t } });
        continue;
      }
      if (!context.ignoreKnown && !(context.knownTechniques?.[t])) {
        errors.push({ code: "technique_not_known", data: { key: t } });
      }
      if (cfg.requiresSource && sourceScale === "none" && !ignoresSource) {
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

    // --- Modifiers ---
    const modifiers = build.modifiers || [];
    const chosenModKeys = new Set(modifiers.map(m => m.key));
    const hasArea = ["area_cone", "area_circle", "area_line"].some(k => chosenModKeys.has(k));
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
      // A doctrinal modifier is available only to its owner (doctrine/path from the config)
      if (cfg.doctrinal && !ownedDoctrinal.has(m.key)) {
        errors.push({ code: "modifier_not_owned", data: { key: m.key } });
        continue;
      }
      // A form is available only to a doctrine/path with a non-empty form list
      if (cfg.requiresForms && forms.length === 0) {
        errors.push({ code: "modifier_forbidden", data: { key: m.key } });
        continue;
      }
      if (forbidden.has(target)) {
        errors.push({ code: "modifier_forbidden", data: { key: m.key } });
        continue;
      }
      // Dependencies: "the modifier requires a technique" (Imbuement → imbue),
      // "the modifier requires an Area" (Dust Veil)
      if (cfg.requiresTechnique && !seenTech.has(cfg.requiresTechnique)) {
        errors.push({ code: "modifier_needs_technique", data: { key: m.key, tech: cfg.requiresTechnique } });
      }
      if (cfg.requiresArea && !hasArea) {
        errors.push({ code: "modifier_needs_area", data: { key: m.key } });
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

      // Mutual exclusions (Targets ↔ Areas, Areas among themselves) — a pair is reported once
      for (const other of cfg.exclusiveWith || []) {
        if (chosenModKeys.has(other)) {
          const pairId = [m.key, other].sort().join("+");
          if (!reportedConflicts.has(pairId)) {
            reportedConflicts.add(pairId);
            errors.push({ code: "modifier_conflict", data: { key: m.key, other } });
          }
        }
      }
      // A cone is cast from the caster's square — Range doesn't apply
      if (cfg.noRange && chosenModKeys.has("range")) {
        errors.push({ code: "cone_no_range", data: { key: m.key } });
      }

      // Rank limits. Rank 5 requires an Abundant Source — except for ignoresSource
      // doctrines, where it is gated by Doctrine Rank 5 via the regular maxModCost.
      if (!abundant && !ignoresSource && rank === 5) {
        errors.push({ code: "rank5_needs_abundant", data: { key: m.key } });
      } else if (!bypassMaxCost && rank > limits.maxModCost) {
        errors.push({ code: "over_max_mod_cost", data: { key: m.key, rank, max: limits.maxModCost } });
      }

      maxModRank = Math.max(maxModRank, rank);
      const base = rank; // a modifier's base AP cost equals its rank
      // priceDelta — the modifier's own surcharge (Areas: +1 AP),
      // adds up with the doctrine's and path's affinities/restrictions
      const delta = (deltas[target] || 0) + (cfg.priceDelta || 0);
      breakdown.push({ kind: "modifier", key: m.key, rank, option: m.option || "", base, delta, final: Math.max(0, base + delta) });
    }
    if (seenMods.size > limits.modifiers) {
      errors.push({ code: "too_many_modifiers", data: { count: seenMods.size, max: limits.modifiers } });
    }

    const totalAp = breakdown.reduce((sum, b) => sum + b.final, 0);

    // The minimum doctrine rank at which the build is legal (for doctrine_rank_req).
    // In unlockAll mode an abundant source excludes maxModCost from the requirement.
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
      ? this.compile(build, { config, doctrineCfg, pathKey, pathCfg, forms, breakdown, totalAp, requiredRank, sourceScale, doctrineRank })
      : null;

    return { valid, errors, totalAp, requiredRank, breakdown, compiled };
  }

  /**
   * Merges the price deltas and caps of the doctrine and the active path into single maps.
   * target: "tech:<key>" | "mod:<key>". Deltas add up.
   * Used both in calculate() and in the Constructor UI (highlighting prices/bans).
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
   * Damage formula on the Ladder: the rank's step + the doctrine's shift (Pyro: +1)
   * + the Abundant Source bonus, clamped at step VII.
   * Used both by the compiler and by the UI hints.
   */
  static damageFormulaFor(config, doctrineCfg, rank, sourceScale) {
    const rankCfg = config.modifiers.damage.ranks[rank];
    if (!rankCfg) return "";
    const sourceBonus = doctrineCfg.ignoresSource ? 0 : (config.sourceScales[sourceScale]?.damageStepBonus || 0);
    const steps = Object.keys(config.damageLadder).map(Number);
    const maxStep = Math.max(...steps);
    const step = Math.min(rankCfg.step + (doctrineCfg.ladderShift || 0) + sourceBonus, maxStep);
    return config.damageLadder[step] || "";
  }

  /** Effect duration of a doctrinal modifier by durationMode. */
  static #modeRounds(mode, doctrineRank) {
    if (mode === "doctrineRank") return Math.max(1, doctrineRank | 0);
    if (typeof mode === "string" && mode.startsWith("rounds:")) return parseInt(mode.slice(7)) || 1;
    return 1; // instant: "the next roll" — an effect for 1 round
  }

  /**
   * Compiles a valid build into an item.system patch (+ caster-side service fields).
   * The returned object contains ONLY SpellDataModel schema fields and the extras block.
   */
  static compile(build, { config, doctrineCfg, pathKey, pathCfg, forms, breakdown, totalAp, requiredRank, sourceScale, doctrineRank }) {
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
      save_dc_formula: "",
      forbidden_defense: (() => {
        const choices = rankData("forbidDefense")?.forbidDefenseChoice;
        if (!choices?.length) return "";
        const opt = mods.forbidDefense?.option;
        return choices.includes(opt) ? opt : choices[0];
      })()
    };

    // ANY spellcasting requires a focus: an equipped weapon of type
    // "magic" (staff, wand; for the Path of the Echo — conceptually a musical instrument,
    // there's no separate check). The use dialog will offer to pick the focus;
    // its bonuses to the "Magical Attacks" skill are attached as the weapon's transfer effects
    // and are active only while the focus is equipped (gate on system.equipped —
    // DedrelActor#allApplicableEffects; core does NOT do such suppression itself).
    sys.req_weapon_type = { melee: false, ranged: false, shield: false, magic: true };

    // --- Scale: range / targets / areas ---
    // The rules and the template engine (chat.mjs placeTemplate) work in scene meters;
    // rank values are stored directly in meters. Without Scale — a self-targeted spell.
    const range = rankData("range");
    if (range) sys.target_range = String(range.meters);
    const targets = rankData("targets");
    if (targets) sys.target_value = targets.targets;
    const cone = rankData("area_cone");
    if (cone) { sys.template_shape = "cone"; sys.template_size = cone.lengthMeters; sys.target_type = "area"; }
    const circle = rankData("area_circle");
    if (circle) { sys.template_shape = "circle"; sys.template_size = circle.radiusMeters; sys.target_type = "area"; }
    const line = rankData("area_line");
    if (line) { sys.template_shape = "ray"; sys.template_size = line.lengthMeters; sys.target_type = "area"; }

    // --- Damage on the Ladder; type — Form (option) > special path > the doctrine's base type ---
    const damage = rankData("damage");
    if (damage) {
      const formula = this.damageFormulaFor(config, doctrineCfg, mods.damage.rank, sourceScale);
      let damageType = "";
      const formOption = mods.form ? (forms.includes(mods.form.option) ? mods.form.option : forms[0]) : "";
      if (formOption) damageType = formOption;
      else if (pathCfg?.special?.damageType) damageType = pathCfg.special.damageType;
      else if (doctrineCfg.baseDamageType) damageType = doctrineCfg.baseDamageType;
      sys.formula_damage = formula + (damageType ? `[${damageType}]` : "");
    }

    // --- Healing (Biomancy): pipeline formula_heal → the "Heal" button on the card ---
    const heal = rankData("heal");
    if (heal) sys.formula_heal = heal.heal;

    // --- Effects of doctrinal modifiers: saving throw + penalty/bonus/conditions ---
    const extras = {
      appliedConditions: [],
      powerBonus: 0,          // the Power penalty (negative)
      powerEffectRounds: 0,   // duration of the penalty effect (the rank's durationMode)
      pushMeters: 0,          // forced movement (Compulsion/Knockdown 3)
      factNotes: [],          // { key, rank, saveDc } — RankHints lines in the description
      imbue: null,            // { rank, value, option } — Imbuement
      durationRounds: 0,
      durationSpecial: "",
      durabilityHp: rankData("durability")?.hp || 0
    };

    let maxSaveDc = 0;
    for (const b of breakdown) {
      if (b.kind !== "modifier") continue;
      const rankCfg = config.modifiers[b.key]?.ranks?.[b.rank];
      if (!rankCfg) continue;

      if (rankCfg.saveDc) maxSaveDc = Math.max(maxSaveDc, rankCfg.saveDc);

      if (b.key === "power") {
        // Player's choice: the table penalty OR a condition from the rank's list
        const option = b.option;
        if (option && option !== "penalty") {
          // option = condition item key: the current version is pulled from
          // the Conditions compendium on application (toggleStatusEffect)
          extras.appliedConditions.push(option);
        } else if (rankCfg.penalty) {
          extras.powerBonus = -rankCfg.penalty;
          extras.powerEffectRounds = SpellCalculator.#modeRounds(rankCfg.durationMode, doctrineRank);
        } else if (rankCfg.conditions?.length) {
          extras.appliedConditions.push(rankCfg.conditions[0]);
        }
      } else if (b.key === "imbuement") {
        extras.imbue = {
          rank: b.rank,
          value: rankCfg.imbueValue || 0,
          option: rankCfg.imbueChoice?.includes(b.option) ? b.option : (rankCfg.imbueChoice?.[0] || "")
        };
      } else if (rankCfg.conditions?.length) {
        // Other doctrinal modifiers (Constraint, Knockdown, Choke):
        // conditions are fixed by the rank, there's no choice
        extras.appliedConditions.push(...rankCfg.conditions);
      }

      if (rankCfg.pushMeters) extras.pushMeters = Math.max(extras.pushMeters, rankCfg.pushMeters);
      // option — for modifiers with a choice from a pack (Adaptation): goes into the description
      if (rankCfg.hintFact) extras.factNotes.push({ key: b.key, rank: b.rank, saveDc: rankCfg.saveDc || 0, option: b.option || "" });
    }
    if (maxSaveDc) {
      sys.save_dc_formula = String(maxSaveDc);
      // The saving throw attribute isn't fixed by the rules; Willpower is the default, the GM changes it on the sheet
      sys.save_attribute = "will";
    }

    const duration = rankData("duration");
    if (duration) {
      if (duration.rounds) extras.durationRounds = duration.rounds;
      if (duration.special) extras.durationSpecial = duration.special;
    }

    return { system: sys, extras };
  }

  /**
   * Human-readable cost breakdown: "Create 2 + Damage 3−1=2 = 4 AP".
   * Outside Foundry (no game) keys are used instead of names.
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

  /** Localizes the calculate() error array into strings for the UI/chat. */
  static localizeErrors(errors) {
    return errors.map(e => {
      const data = { ...(e.data || {}) };
      // Substitute localized component names instead of raw keys
      if (data.key && game.i18n.has(`DEDREL.Magic.Modifiers.${data.key}`)) {
        data.key = game.i18n.localize(`DEDREL.Magic.Modifiers.${data.key}`);
      } else if (data.key && game.i18n.has(`DEDREL.Magic.Techniques.${data.key}`)) {
        data.key = game.i18n.localize(`DEDREL.Magic.Techniques.${data.key}`);
      }
      if (data.other && game.i18n.has(`DEDREL.Magic.Modifiers.${data.other}`)) {
        data.other = game.i18n.localize(`DEDREL.Magic.Modifiers.${data.other}`);
      }
      if (data.tech && game.i18n.has(`DEDREL.Magic.Techniques.${data.tech}`)) {
        data.tech = game.i18n.localize(`DEDREL.Magic.Techniques.${data.tech}`);
      }
      return game.i18n.format(`DEDREL.Magic.Errors.${e.code}`, data);
    });
  }

  /**
   * Assembles the context for calculate() from the actor.
   * A separate helper so that the Constructor/re-validation don't duplicate field reads.
   */
  static contextFromActor(actor, doctrineKey) {
    return {
      doctrineRank: actor.system.doctrines?.[doctrineKey]?.rank || 0,
      knownTechniques: actor.system.magic?.techniques || {},
      knownPaths: actor.system.doctrines?.[doctrineKey]?.paths || {},
      ignoreKnown: false
    };
  }
}
