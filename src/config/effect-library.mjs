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
  // Свет токена: у ActiveEffect нет нативного пути к token.light, поэтому маркер
  // `tokenLight` читает собственный хук (src/canvas/token-light.mjs) и патчит свет
  // носящего токена, восстанавливая исходный при снятии. Значения dim/bright — в
  // единицах сцены (метры; сетка гексов = 2 м). Источник эффекта: факел ~ 8/4 м.
  light: {
    label: "DEDREL.EffectLib.Light",
    img: "icons/magic/light/torch-fire-orange.webp",
    category: "utility",
    duration: {},
    changes: [],
    tokenLight: {
      dim: 8,
      bright: 4,
      color: "#ff9329",
      alpha: 0.5,
      animation: { type: "torch", speed: 3, intensity: 4 }
    }
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
  // Маркер света токена (применяется хуком token-light.mjs, не через system.changes)
  if (preset.tokenLight) dedrelFlags.tokenLight = opts.tokenLight || { ...preset.tokenLight };

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
