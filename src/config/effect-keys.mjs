/**
 * Каталог ключей Active Effects для «Справочника ключей» (EffectKeyBrowserApp)
 * и словари конструктора DSL-модификаторов flags.dedrel.mod.
 *
 * Человекочитаемая версия — EFFECT_KEYS_CHEAT_SHEET.md; этот файл — её
 * машинный аналог для UI. Чтобы каталог не приходилось поддерживать руками,
 * списки атрибутов/навыков/DR/бонусов/доктрин строятся ИНТРОСПЕКЦИЕЙ схемы
 * персонажа (CONFIG.Actor.dataModels.character.schema): новый навык или бонус
 * в shared-schema.mjs / bonuses-schema.mjs появится в справочнике сам.
 * Руками описаны только derived-параметры без схемных ярлыков (защиты,
 * ресурсы) и подсказки.
 *
 * Всё строится в рантайме (после i18n init) — вызывать функции, не константы.
 */

import { DR_KEY_LABELS } from "../constants.mjs";

/** Локализация с фолбэком: если ключа нет в словаре — вернуть fallback. */
function loc(key, fallback = null) {
  const s = game.i18n.localize(key);
  return s === key ? (fallback ?? key) : s;
}

/**
 * Ключи вложенного SchemaField схемы персонажа по пути ("attributes",
 * "magic.techniques"...). Пустой массив, если путь не существует.
 */
function schemaFieldKeys(path) {
  let field = CONFIG.Actor?.dataModels?.character?.schema;
  for (const part of path.split(".")) field = field?.fields?.[part];
  return field?.fields ? Object.keys(field.fields) : [];
}

/** Как выше, но возвращает сам SchemaField (для доступа к подполям). */
function schemaField(path) {
  let field = CONFIG.Actor?.dataModels?.character?.schema;
  for (const part of path.split(".")) field = field?.fields?.[part];
  return field ?? null;
}

/** Подписи полей бонусов (bonuses-schema.mjs). Новые поля падают в фолбэк-ключ. */
const BONUS_HINTS = {
  hp_multiplier: "0.25 = +25%",
  carry_capacity_mult: "0.5 = +50%",
  ignore_wound_penalty: "Add | 1",
  infinite_explode: "Add | 1",
  damage_explode: "Add | 1",
  ignore_encumbrance_penalty: "Add | 1"
};

/**
 * Собирает каталог категорий ключей для справочника.
 * @returns {Array<{id: string, label: string, note?: string, entries: Array}>}
 *   entry: { key, label, mode, hint?, searchText }
 */
export function buildEffectKeyCatalog() {
  const kb = (k, f) => loc(`DEDREL.KeyBrowser.${k}`, f);
  const categories = [];

  const entry = (key, label, mode = "Add", hint = "") => ({
    key, label, mode, hint,
    searchText: `${label} ${key} ${hint}`.toLowerCase()
  });

  // 1. Атрибуты: ранг + бонус спасброска
  const attrEntries = [];
  for (const a of schemaFieldKeys("attributes")) {
    const name = loc(`DEDREL.Attributes.${a}`, a);
    attrEntries.push(entry(`system.attributes.${a}.rank`, `${name} — ${kb("Sub.Rank")}`));
    attrEntries.push(entry(`system.attributes.${a}.save_bonus`, `${name} — ${kb("Sub.SaveBonus")}`));
  }
  categories.push({ id: "attributes", label: kb("Cat.Attributes"), entries: attrEntries });

  // 2. Навыки: бонус к броску (рекомендуется) + ранг (перманентное обучение)
  const skillEntries = [];
  for (const s of schemaFieldKeys("skills")) {
    const name = loc(`DEDREL.Skills.${s}`, s);
    skillEntries.push(entry(`system.skills.${s}.bonus`, `${name} — ${kb("Sub.Bonus")}`));
    skillEntries.push(entry(`system.skills.${s}.rank`, `${name} — ${kb("Sub.Rank")}`));
  }
  categories.push({
    id: "skills", label: kb("Cat.Skills"), note: kb("Note.Skills"), entries: skillEntries
  });

  // 3. Защиты и производные параметры
  categories.push({
    id: "derived", label: kb("Cat.Derived"), entries: [
      entry("system.defenses.dodge", kb("Entry.Dodge")),
      entry("system.defenses.block", kb("Entry.Block")),
      entry("system.defenses.mdef", kb("Entry.MDef")),
      entry("system.initiative", kb("Entry.Initiative")),
      entry("system.resources.movement.max", kb("Entry.Movement")),
      entry("system.resources.hp.max", kb("Entry.HPMax")),
      entry("system.resources.luck_points.max", kb("Entry.LuckMax")),
      entry("system.senses.darkvision", kb("Entry.Darkvision"))
    ]
  });

  // 4. Системные бонусы (bonuses-schema.mjs) — штраф = отрицательное значение
  const bonusEntries = schemaFieldKeys("bonuses").map(b =>
    entry(`system.bonuses.${b}`, loc(`DEDREL.KeyBrowser.Bonus.${b}`, b), "Add", BONUS_HINTS[b] ?? "")
  );
  categories.push({
    id: "bonuses", label: kb("Cat.Bonuses"), note: kb("Note.Bonuses"), entries: bonusEntries
  });

  // 5. Сопротивление урону (DR)
  const drEntries = schemaFieldKeys("dr").map(d =>
    entry(`system.dr.${d}`, loc(DR_KEY_LABELS[d] ?? d, d))
  );
  categories.push({ id: "dr", label: kb("Cat.DR"), entries: drEntries });

  // 6. Очки Действий (максимумы пулов)
  categories.push({
    id: "ap", label: kb("Cat.AP"), entries: [
      entry("system.resources.ap_universal.max", loc("DEDREL.ActorSheet.UniversalAP")),
      entry("system.resources.ap_maneuver.max", loc("DEDREL.ActorSheet.ManeuverAP")),
      entry("system.resources.ap_magic.max", loc("DEDREL.ActorSheet.MagicAP"))
    ]
  });

  // 7. Магия: доктрины (доступ Override 1 / ранг Add), Пути, Техники
  const magicEntries = [];
  for (const d of schemaFieldKeys("doctrines")) {
    const name = loc(`DEDREL.Magic.Doctrines.${d}`, d);
    magicEntries.push(entry(`system.doctrines.${d}.unlocked`, `${name} — ${kb("Sub.Unlocked")}`, "Override", "1"));
    magicEntries.push(entry(`system.doctrines.${d}.rank`, `${name} — ${kb("Sub.Rank")}`));
    const paths = schemaField(`doctrines.${d}.paths`);
    for (const p of paths?.fields ? Object.keys(paths.fields) : []) {
      magicEntries.push(entry(`system.doctrines.${d}.paths.${p}`, loc(`DEDREL.Magic.Paths.${p}`, p), "Override", "1"));
    }
  }
  for (const t of schemaFieldKeys("magic.techniques")) {
    magicEntries.push(entry(`system.magic.techniques.${t}`, `${kb("Sub.Technique")}: ${loc(`DEDREL.Magic.Techniques.${t}`, t)}`, "Override", "1"));
  }
  categories.push({ id: "magic", label: kb("Cat.Magic"), entries: magicEntries });

  return categories;
}

/* ========================================================================== */
/* Словари конструктора DSL flags.dedrel.mod (движок: dedrel-bonuses.mjs)     */
/* ========================================================================== */

/** Операции DSL: значение-плейсхолдер и дефолтный момент сгорания (для подсказок). */
export const DSL_OPS = [
  { key: "attack", placeholder: "2", defaultConsume: "roll" },
  { key: "damage", placeholder: "1d6", defaultConsume: "damage" },
  { key: "dice_step", placeholder: "1", defaultConsume: "damage" },
  { key: "pierce", placeholder: "2", defaultConsume: "damage" },
  { key: "ap_discount", placeholder: "1", defaultConsume: "use" },
  { key: "ap_set", placeholder: "0", defaultConsume: "use" }
];

/**
 * Типы условий фильтра. valueKind:
 *   "none" — токен без значения; "select" — выпадашка (options строится в
 *   buildDslFilterOptions); "text" — свободный ввод (key:<system.key>).
 */
export const DSL_FILTER_TYPES = [
  { key: "any", valueKind: "none" },
  { key: "melee", valueKind: "none" },
  { key: "ranged", valueKind: "none" },
  { key: "shield", valueKind: "none" },
  { key: "skill", valueKind: "select" },
  { key: "dtype", valueKind: "select" },
  { key: "key", valueKind: "text" },
  { key: "doctrine", valueKind: "select" },
  { key: "tech", valueKind: "select" },
  { key: "mod", valueKind: "select" }
];

/** Моменты сгорания ("" = авто по операции). */
export const DSL_CONSUME = ["", "use", "roll", "damage", "never"];

/**
 * Опции значений для select-фильтров DSL, {value: label}.
 * @param {string} type — ключ из DSL_FILTER_TYPES
 */
export function buildDslFilterOptions(type) {
  const options = {};
  switch (type) {
    case "skill":
      for (const s of schemaFieldKeys("skills")) options[s] = loc(`DEDREL.Skills.${s}`, s);
      break;
    case "dtype":
      // Физические типы урона оружия (weapon.mjs → damage_type)
      for (const d of ["slashing", "piercing", "bludgeoning"]) options[d] = loc(DR_KEY_LABELS[d], d);
      break;
    case "doctrine":
      for (const d of schemaFieldKeys("doctrines")) options[d] = loc(`DEDREL.Magic.Doctrines.${d}`, d);
      break;
    case "tech":
      for (const t of schemaFieldKeys("magic.techniques")) options[t] = loc(`DEDREL.Magic.Techniques.${t}`, t);
      break;
    case "mod":
      for (const m of Object.keys(CONFIG.DEDREL?.magic?.modifiers ?? {})) {
        options[m] = loc(`DEDREL.Magic.Modifiers.${m}`, m);
      }
      break;
  }
  return options;
}
