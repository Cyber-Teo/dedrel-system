/**
 * Библиотека переиспользуемых Active Effects (Фаза 3 — зелья/свитки/магические вещи).
 *
 * Единственный источник истины для «шаблонных» эффектов, которые накладываются на
 * актёров (баффы/дебаффы/яд/сопротивления). Один раз описанный здесь пресет
 * переиспользуется где угодно: зелье, свиток, факел, ловушка, макрос ГМа —
 * вместо ручной сборки Active Effect с нуля.
 *
 * Регистрируется как CONFIG.DEDREL.effectLibrary в dedrel.mjs. Билдер
 * buildEffectData(key, opts) собирает из пресета данные ActiveEffect, готовые для
 * createEmbeddedDocuments("ActiveEffect", [data]) (на актёре или на предмете).
 *
 * СООТВЕТСТВИЕ V14 (см. FOUNDRY V14 QUIRKS.md):
 *  - Изменения живут в `system.changes`, тип операции — строковое `change.type`
 *    ("add"/"override"/…), НЕ числовое `mode` (§11, §13).
 *  - Фазу "apply" всем system.*-изменениям проставляет хук preCreateActiveEffect —
 *    здесь её задавать не нужно (§12).
 *  - Периодический урон/лечение — флаг `flags.dedrel.tick` = { formula, trigger,
 *    damage_type, is_heal }; тикает в DedrelCombat._onStartTurn/_onEndTurn (combat.mjs).
 *
 * Все label — ключи локализации (ru.json / en.json). Пути DR — из buildDR()
 * (shared-schema.mjs): slashing/piercing/bludgeoning/heat/cold/necrotic/radiant/
 * electric/sonic/acid. Бонусы — из bonuses-schema.mjs (global_roll и т.п.).
 */

const ICON = "systems/dedrel/assets/icons/items/magic_item.svg";

export const DEDREL_EFFECT_LIBRARY = {
  // ── Дебаффы ──────────────────────────────────────────────────────────────
  poison: {
    label: "DEDREL.EffectLib.Poison",
    img: "icons/magic/death/skull-poison-green.webp",
    category: "debuff",
    duration: { rounds: 3 },
    changes: [],
    // Урон яда по умолчанию нетипизирован (игнорирует DR брони). damage_type можно
    // переопределить в opts (например, "acid"). Формула масштабируется @stacks.
    tick: { formula: "1d4", trigger: "turnStart", damage_type: "", is_heal: false }
  },
  poison_strong: {
    label: "DEDREL.EffectLib.PoisonStrong",
    img: "icons/magic/death/skull-poison-green.webp",
    category: "debuff",
    duration: { rounds: 3 },
    changes: [],
    tick: { formula: "2d6", trigger: "turnStart", damage_type: "", is_heal: false }
  },
  weakness: {
    label: "DEDREL.EffectLib.Weakness",
    img: "icons/magic/unholy/strike-body-explode-disintegrate.webp",
    category: "debuff",
    duration: { rounds: 5 },
    changes: [
      { key: "system.bonuses.global_roll", type: "add", value: "-2" }
    ]
  },

  // ── Баффы ────────────────────────────────────────────────────────────────
  regeneration: {
    label: "DEDREL.EffectLib.Regeneration",
    img: "icons/magic/life/heart-cross-strong-green.webp",
    category: "buff",
    duration: { rounds: 5 },
    changes: [],
    tick: { formula: "1d4", trigger: "turnStart", damage_type: "", is_heal: true }
  },
  might: {
    label: "DEDREL.EffectLib.Might",
    img: "icons/magic/control/buff-strength-muscle-damage-orange.webp",
    category: "buff",
    duration: { seconds: 600 },
    changes: [
      { key: "system.bonuses.global_roll", type: "add", value: "2" }
    ]
  },
  invulnerability: {
    label: "DEDREL.EffectLib.Invulnerability",
    img: "icons/magic/defensive/shield-barrier-glowing-blue.webp",
    category: "buff",
    // Короткий, очень сильный бафф: почти иммунитет к физическому урону на 1 раунд.
    duration: { rounds: 1 },
    changes: [
      { key: "system.dr.slashing", type: "add", value: "99" },
      { key: "system.dr.piercing", type: "add", value: "99" },
      { key: "system.dr.bludgeoning", type: "add", value: "99" }
    ]
  },
  resist_fire: {
    label: "DEDREL.EffectLib.ResistFire",
    img: "icons/magic/defensive/shield-barrier-flaming-diamond-red.webp",
    category: "buff",
    duration: { seconds: 600 },
    changes: [
      { key: "system.dr.heat", type: "add", value: "5" }
    ]
  },
  resist_cold: {
    label: "DEDREL.EffectLib.ResistCold",
    img: "icons/magic/water/snowflake-ice-blue.webp",
    category: "buff",
    duration: { seconds: 600 },
    changes: [
      { key: "system.dr.cold", type: "add", value: "5" }
    ]
  },

  // ── Утилита ──────────────────────────────────────────────────────────────
  // Свет токена: нативные change-ключи `token.light.*` (V14). Ядро применяет их
  // эфемерно на каждом клиенте (TokenDocument#applyActiveEffects), ничего не
  // записывая в документ токена: снятие/подавление эффекта гасит свет само.
  // Значения dim/bright — в единицах сцены (метры; сетка гексов = 2 м).
  // Источник пресета: факел ~ 8/4 м.
  light: {
    label: "DEDREL.EffectLib.Light",
    img: "icons/magic/light/torch-fire-orange.webp",
    category: "utility",
    duration: {},
    changes: [
      { key: "token.light.dim", type: "override", value: "8" },
      { key: "token.light.bright", type: "override", value: "4" },
      { key: "token.light.color", type: "override", value: "#ff9329" },
      { key: "token.light.alpha", type: "override", value: "0.5" },
      { key: "token.light.animation.type", type: "override", value: "torch" },
      { key: "token.light.animation.speed", type: "override", value: "3" },
      { key: "token.light.animation.intensity", type: "override", value: "4" }
    ]
  }
};

/**
 * Собирает данные ActiveEffect из пресета библиотеки.
 *
 * @param {string} key                    Ключ пресета в DEDREL_EFFECT_LIBRARY.
 * @param {object} [opts]
 * @param {string} [opts.name]            Переопределить отображаемое имя (иначе — из label).
 * @param {object} [opts.duration]        Переопределить длительность ({rounds} | {seconds}).
 * @param {number} [opts.stacks]          Стаки для масштабирования тика (@stacks в формуле).
 * @param {string} [opts.formula]         Переопределить формулу тика.
 * @param {string} [opts.damageType]      Переопределить тип урона тика (DR-ключ или "").
 * @param {boolean} [opts.transfer=false] Переносится ли эффект на носителя автоматически.
 * @param {string} [opts.origin]          UUID источника (предмет/актёр).
 * @returns {object|null} Данные для createEmbeddedDocuments("ActiveEffect", [data]).
 */
export function buildEffectData(key, opts = {}) {
  const preset = DEDREL_EFFECT_LIBRARY[key];
  if (!preset) {
    console.warn(`Dedrel | Неизвестный пресет эффекта: "${key}"`);
    return null;
  }

  const name = opts.name || game.i18n.localize(preset.label);
  const dedrelFlags = { effectLibrary: key };

  if (preset.tick) {
    dedrelFlags.tick = {
      ...preset.tick,
      ...(opts.formula ? { formula: opts.formula } : {}),
      ...(opts.damageType !== undefined ? { damage_type: opts.damageType } : {})
    };
  }
  if (opts.stacks) dedrelFlags.stacks = opts.stacks;

  const data = {
    name,
    img: preset.img || ICON,
    // По умолчанию эффекты-пресеты НЕ переносятся: их накладывают вручную (кнопка
    // «Применить эффекты» в карточке чата) либо конвейером использования зелья.
    transfer: opts.transfer ?? false,
    duration: opts.duration || { ...preset.duration },
    system: {
      changes: (preset.changes || []).map(c => ({ ...c }))
    },
    flags: { dedrel: dedrelFlags }
  };
  if (opts.origin) data.origin = opts.origin;

  return data;
}

/* ── Свет токена (нативные change-ключи `token.light.*`, V14) ─────────────── */

const TOKEN_LIGHT_PREFIX = "token.light.";

/** Есть ли у эффекта (документа или сырых данных) световые change-строки. */
export function hasTokenLightChanges(effectData) {
  return (effectData.system?.changes ?? []).some(c => c.key?.startsWith(TOKEN_LIGHT_PREFIX));
}

/**
 * Читает change-строки `token.light.*` в плоский объект настроек света.
 * Принимает и документ ActiveEffect, и сырые данные (toObject).
 * @returns {{dim, bright, color, alpha, animation: {type, speed, intensity}}|null}
 */
export function readTokenLightChanges(effectData) {
  const light = {};
  for (const c of effectData.system?.changes ?? []) {
    if (!c.key?.startsWith(TOKEN_LIGHT_PREFIX)) continue;
    foundry.utils.setProperty(light, c.key.slice(TOKEN_LIGHT_PREFIX.length), c.value);
  }
  return foundry.utils.isEmpty(light) ? null : light;
}

/**
 * Собирает change-строки `token.light.*` из плоского объекта настроек света.
 * Значения changes — всегда строки (так хранит схема ядра); касты к типам полей
 * LightData ядро выполняет само при применении.
 */
export function buildTokenLightChanges({ dim = 0, bright = 0, color = null, alpha = 0.5, animation = {} } = {}) {
  const changes = [
    { key: "token.light.dim", type: "override", value: String(dim) },
    { key: "token.light.bright", type: "override", value: String(bright) },
    { key: "token.light.alpha", type: "override", value: String(alpha) }
  ];
  if (color) changes.push({ key: "token.light.color", type: "override", value: String(color) });
  if (animation?.type) {
    changes.push({ key: "token.light.animation.type", type: "override", value: String(animation.type) });
    if (animation.speed != null) changes.push({ key: "token.light.animation.speed", type: "override", value: String(animation.speed) });
    if (animation.intensity != null) changes.push({ key: "token.light.animation.intensity", type: "override", value: String(animation.intensity) });
  }
  return changes;
}

/** Change-строки эффекта без световых (для замены/удаления света). */
export function stripTokenLightChanges(effectData) {
  return (effectData.system?.changes ?? [])
    .filter(c => !c.key?.startsWith(TOKEN_LIGHT_PREFIX))
    .map(c => ({ ...c }));
}
