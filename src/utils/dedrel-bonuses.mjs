/**
 * ==========================================================================
 * DSL-модификаторы Dedrel (flags.dedrel.mod)
 * ==========================================================================
 *
 * Единый механизм одноразовых и условных бонусов «на следующий манёвр».
 * Носитель — Active Effect (обычно от технического Condition-предмета),
 * содержащий одну или несколько change-строк с ключом "flags.dedrel.mod".
 *
 * Формат значения: сегменты через ";", каждый сегмент — "имя:значение".
 * Первый сегмент — операция:
 *   ap_set:N       — установить стоимость ОД = N (из нескольких берётся минимум)
 *   ap_discount:N  — скидка ОД (складываются, стоимость не ниже 0)
 *   attack:N       — бонус к броску атаки (складываются)
 *   damage:X       — добавка к формуле урона; число или дайсы, например "1d6"
 *   dice_step:N    — сдвиг БАЗОВОЙ формулы урона по лестнице кубов
 *                    1d4→1d6→2d4→2d6→2d8→3d6 (складываются; N может быть
 *                    отрицательным — нерф; см. src/utils/dice-ladder.mjs)
 *   pierce:N       — бронебойность урона (складываются между собой и с
 *                    бронебойностью оружия; каждая единица снимает 10% DR цели)
 *
 * Опциональные параметры:
 *   filter:<expr>  — к каким манёврам применяется (см. matchesFilter);
 *                    по умолчанию "any"
 *   consume:<когда> — момент сгорания эффекта-носителя:
 *                    use (при трате ОД) | roll (после броска атаки) |
 *                    damage (после броска урона) | never (не сгорает).
 *                    Дефолт по операции: ap_* → use, attack → roll, damage → damage.
 *
 * Примеры:
 *   "ap_set:0; filter:ranged"                        — следующий выстрел бесплатно
 *   "attack:2; filter:ranged; consume:roll"          — Прицеливание
 *   "damage:1d6; filter:melee"                       — +1d6 к следующему удару
 *   "attack:1; filter:skill:bows; consume:never"     — постоянный +1 к атакам из лука
 *   "dice_step:1; filter:dtype:bludgeoning"          — следующий дробящий удар на ступень выше
 *   "dice_step:-1; filter:melee; consume:never"      — постоянный нерф: урон на ступень ниже
 *   "ap_discount:1; filter:tech:imbue; consume:never" — материал фокуса: заклинания
 *                    с Насыщением дешевле на 1 ОД (пока предмет экипирован)
 *
 * ВАЖНО: движок читает change-строки КАЖДОГО эффекта отдельно
 * (actor.appliedEffects → effect.changes) — включая эффекты, перенесённые
 * с предметов (transfer: true). Слитое значение флага на актёре не используется,
 * поэтому режим change-строки (Add/Override) значения НЕ имеет, а несколько
 * одновременных баффов не затирают друг друга — каждый живёт и сгорает независимо.
 *
 * Правило сгорания: на стадии S удаляется эффект, у которого максимальная
 * стадия среди СОВПАВШИХ по фильтру модов равна S. Эффект, чей фильтр не
 * совпал с манёвром, не тратится — он протухнет сам по duration.
 */

/** Порядок стадий потребления. "never" не сгорает автоматически. */
const CONSUME_STAGES = { use: 0, roll: 1, damage: 2, never: 3 };

/** Дефолтный момент сгорания для каждой операции. */
const DEFAULT_CONSUME = {
  ap_set: "use",
  ap_discount: "use",
  attack: "roll",
  damage: "damage",
  dice_step: "damage",
  pierce: "damage"
};

export const MOD_CHANGE_KEY = "flags.dedrel.mod";

/**
 * Проверяет, соответствует ли манёвр фильтру модификатора.
 * Поддерживает несколько условий через "|" (логика OR).
 *
 * Поддерживаемые токены фильтра:
 *   "any"          — любой манёвр (всегда true)
 *   "ranged"       — манёвр требует дальнобойного оружия (req_weapon_type.ranged)
 *   "melee"        — манёвр требует оружия ближнего боя (req_weapon_type.melee)
 *   "shield"       — манёвр требует щита
 *   "skill:<key>"  — манёвр привязан к конкретной группе навыков (req_weapon_skill_group)
 *   "key:<key>"    — манёвр имеет конкретный system.key или name
 *   "dtype:<type>" — предмет наносит урон определённого типа (piercing, slashing, bludgeoning)
 *
 * Токены для заклинаний Конструктора (синтаксис ключей как в CONFIG.DEDREL.magic):
 *   "doctrine:<key>" — заклинание доктрины (system.doctrine; работает и для линейных)
 *   "tech:<key>"     — в сборке есть Техника (chosen_techniques)
 *   "mod:<key>"      — в сборке есть Модификатор (chosen_modifiers)
 *
 * @param {Item} item
 * @param {string} filter
 * @returns {boolean}
 */
function matchesFilter(item, filter) {
  if (!filter || filter === "any") return true;

  const tokens = filter.split("|").map(s => s.trim());
  const wType = item.system.req_weapon_type || item.system.weapon_type || {};
  const skillGroup = item.system.req_weapon_skill_group || item.system.skill || "";
  const wDmgType = item.system.req_weapon_damage_type || item.system.damage_type || {};

  for (const token of tokens) {
    if (token === "any") return true;
    if (token === "ranged") {
      if (wType.ranged) return true;
      // Также проверяем по группе навыка (луки, арбалеты и т.д.)
      if (["bows", "crossbows", "firearms", "throwing", "artillery"].includes(skillGroup)) return true;
    }
    if (token === "melee") {
      if (wType.melee) return true;
      // Также проверяем по группе навыка для оружия ближнего боя.
      // Примечание: некоторые манёвры используют "bladed" вместо "bladed_weapons".
      if (["bladed_weapons", "bladed", "blunt_weapons", "pole_weapons", "unarmed_combat", "exotic_weapons"].includes(skillGroup)) return true;
    }
    if (token === "shield") {
      if (wType.shield) return true;
    }
    if (token.startsWith("skill:")) {
      const sk = token.slice(6);
      if (skillGroup === sk) return true;
    }
    if (token.startsWith("key:")) {
      const k = token.slice(4);
      if (item.system.key === k || item.name === k) return true;
    }
    if (token.startsWith("dtype:")) {
      const dt = token.slice(6);
      if (wDmgType[dt]) return true;
    }
    if (token.startsWith("doctrine:")) {
      const d = token.slice(9);
      if (item.system.doctrine === d) return true;
    }
    if (token.startsWith("tech:")) {
      const t = token.slice(5);
      if ((item.system.chosen_techniques || []).includes(t)) return true;
    }
    if (token.startsWith("mod:")) {
      const mk = token.slice(4);
      if ((item.system.chosen_modifiers || []).some(m => m.key === mk)) return true;
    }
  }
  return false;
}

export class DedrelBonuses {

  /**
   * Разбирает одну DSL-строку модификатора.
   * @param {string} str — например "ap_set:0; filter:ranged; consume:use"
   * @returns {{op: string, value: string, filter: string, consume: string}|null}
   *          null, если строка не является валидным модификатором.
   */
  static parseMod(str) {
    if (typeof str !== "string" || !str.trim()) return null;

    const segments = str.split(";").map(s => s.trim()).filter(s => s.length > 0);
    if (segments.length === 0) return null;

    // Первый сегмент — операция
    const [opRaw, ...opValueParts] = segments[0].split(":");
    const op = opRaw.trim();
    const opValue = opValueParts.join(":").trim();

    if (!(op in DEFAULT_CONSUME)) {
      console.warn(`Dedrel | Неизвестная операция DSL-модификатора: "${op}" в строке "${str}"`);
      return null;
    }
    if (opValue === "") {
      console.warn(`Dedrel | Пустое значение операции "${op}" в строке "${str}"`);
      return null;
    }

    const mod = {
      op,
      value: opValue,
      filter: "any",
      consume: DEFAULT_CONSUME[op]
    };

    for (const segment of segments.slice(1)) {
      const idx = segment.indexOf(":");
      if (idx === -1) {
        console.warn(`Dedrel | Некорректный сегмент "${segment}" в строке модификатора "${str}"`);
        return null;
      }
      const name = segment.slice(0, idx).trim();
      const value = segment.slice(idx + 1).trim();

      if (name === "filter") {
        // Валидация токенов фильтра: частая ошибка — ключ манёвра без префикса "key:".
        // Такой фильтр никогда не совпадёт, и мод молча не будет работать.
        for (const token of value.split("|").map(s => s.trim()).filter(s => s.length > 0)) {
          if (["any", "ranged", "melee", "shield"].includes(token)) continue;
          if (token.startsWith("skill:") || token.startsWith("key:") || token.startsWith("dtype:")) continue;
          if (token.startsWith("doctrine:") || token.startsWith("tech:") || token.startsWith("mod:")) continue;
          console.warn(`Dedrel | Неизвестный токен фильтра "${token}" в строке "${str}". Для ключей манёвров используйте префикс "key:", например "key:${token}".`);
          return null;
        }
        mod.filter = value || "any";
      } else if (name === "consume") {
        if (!(value in CONSUME_STAGES)) {
          console.warn(`Dedrel | Неизвестный момент сгорания "consume:${value}" в строке "${str}"`);
          return null;
        }
        mod.consume = value;
      } else {
        console.warn(`Dedrel | Неизвестный параметр "${name}" в строке модификатора "${str}"`);
        return null;
      }
    }

    return mod;
  }

  /**
   * Собирает все применимые к предмету модификаторы со всех активных эффектов актёра.
   *
   * @param {Actor} actor
   * @param {Item} item — манёвр/заклинание, к которому применяем фильтры
   * @returns {{
   *   apSet: number|null,        — минимальный ap_set среди совпавших (null, если нет)
   *   apDiscount: number,        — суммарная скидка ОД
   *   attack: number,            — суммарный бонус к атаке
   *   damageParts: string[],     — добавки к формуле урона (числа или дайсы)
   *   diceStep: number,          — суммарный сдвиг базовой формулы по лестнице кубов
   *   pierce: number,            — суммарная бронебойность урона
   *   hasMatches: boolean        — есть ли хоть один совпавший мод
   * }}
   */
  static collect(actor, item) {
    const result = { apSet: null, apDiscount: 0, attack: 0, damageParts: [], diceStep: 0, pierce: 0, hasMatches: false };
    if (!actor || !item) return result;

    for (const mod of this.#iterateMatchedMods(actor, item)) {
      result.hasMatches = true;
      switch (mod.op) {
        case "ap_set": {
          const v = parseInt(mod.value, 10);
          if (!Number.isNaN(v)) {
            result.apSet = (result.apSet === null) ? v : Math.min(result.apSet, v);
          }
          break;
        }
        case "ap_discount": {
          const v = parseInt(mod.value, 10);
          if (!Number.isNaN(v)) result.apDiscount += v;
          break;
        }
        case "attack": {
          const v = parseInt(mod.value, 10);
          if (!Number.isNaN(v)) result.attack += v;
          break;
        }
        case "damage": {
          result.damageParts.push(mod.value);
          break;
        }
        case "dice_step": {
          const v = parseInt(mod.value, 10);
          if (!Number.isNaN(v)) result.diceStep += v;
          break;
        }
        case "pierce": {
          const v = parseInt(mod.value, 10);
          if (!Number.isNaN(v)) result.pierce += v;
          break;
        }
      }
    }

    return result;
  }

  /**
   * Эффективная стоимость ОД предмета с учётом DSL-модификаторов, глобальной скидки
   * и наценки на ОД (system.bonuses.*_ap_penalty).
   * Единая точка расчёта: используется и в Item#use(), и в HUD цепных манёвров,
   * чтобы отображаемая и фактическая стоимость никогда не расходились.
   *
   * @param {Actor} actor
   * @param {Item} item
   * @returns {{cost: number, modApplied: boolean}} modApplied — применился ли одноразовый мод
   */
  static effectiveApCost(actor, item) {
    let apCost = item.system.ap_cost || 0;
    let modApplied = false;

    if (item.type === "maneuver" || item.type === "spell") {
      const mods = this.collect(actor, item);
      const bonuses = actor.system.bonuses || {};

      // Наценка на ОД («штраф на ОД»): глобальная + адресная по типу предмета.
      // Взаимозачитывается со скидками (скидка − наценка). Применяется только к
      // предметам с ненулевой базовой стоимостью — бесплатные не облагаются.
      const apPenalty = (bonuses.global_ap_penalty || 0)
        + (item.type === "maneuver" ? (bonuses.maneuver_ap_penalty || 0) : 0)
        + (item.type === "spell" ? (bonuses.spell_ap_penalty || 0) : 0);

      const globalDiscount = bonuses.global_ap_discount || 0;
      // Чистый модификатор стоимости: скидка увеличивает, наценка уменьшает пул скидки.
      const netDiscount = mods.apDiscount + globalDiscount - apPenalty;
      if (netDiscount !== 0 && apCost > 0) {
        apCost = Math.max(0, apCost - netDiscount);
        if (mods.apDiscount > 0) modApplied = true;
      }
      if (mods.apSet !== null) {
        // ap_set применяется всегда при совпадении фильтра (даже если apCost уже 0)
        apCost = mods.apSet;
        modApplied = true;
      }
    }

    return { cost: apCost, modApplied };
  }

  /**
   * Сжигает эффекты-носители, чей момент сгорания наступил.
   * Эффект «сгорает» на стадии S, если максимальная стадия среди его
   * СОВПАВШИХ модов равна S (моды с consume:never не учитываются и не сгорают).
   *
   * Что именно удаляется, зависит от носителя:
   *  - эффект, встроенный в актёра (наложенный статус) — удаляется сам эффект;
   *  - эффект на Condition-предмете актёра — удаляется весь предмет-состояние;
   *  - эффект на постоянном предмете (талант, мутация, оружие) — НЕ удаляется,
   *    в консоль пишется предупреждение: на таких носителях используйте consume:never.
   *
   * @param {Actor} actor
   * @param {Item} item
   * @param {"use"|"roll"|"damage"} stage
   */
  static async consumeStage(actor, item, stage) {
    if (!actor || !item) return;
    const stageIdx = CONSUME_STAGES[stage];
    if (stageIdx === undefined) return;

    const effectIds = [];
    const conditionItemIds = new Set();

    for (const effect of this.#activeEffects(actor)) {
      let maxStage = -1;
      for (const change of effect.changes) {
        if (change.key !== MOD_CHANGE_KEY) continue;
        const mod = this.parseMod(change.value);
        if (!mod) continue;
        if (!matchesFilter(item, mod.filter)) continue;
        if (mod.consume === "never") continue;
        maxStage = Math.max(maxStage, CONSUME_STAGES[mod.consume]);
      }
      if (maxStage !== stageIdx) continue;

      const parent = effect.parent;
      if (parent === actor) {
        effectIds.push(effect.id);
      } else if (parent instanceof Item && parent.type === "condition") {
        conditionItemIds.add(parent.id);
      } else {
        console.warn(`Dedrel | Расходуемый DSL-модификатор находится на постоянном предмете "${parent?.name}" и не будет сожжён. Используйте consume:never или носитель-состояние.`);
      }
    }

    if (effectIds.length > 0) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", effectIds);
    }
    if (conditionItemIds.size > 0) {
      await actor.deleteEmbeddedDocuments("Item", [...conditionItemIds]);
    }
  }

  /**
   * Все действующие на актёра эффекты: встроенные в актёра (наложенные статусы)
   * ПЛЮС перенесённые с предметов (transfer: true). Обычный actor.effects
   * содержит только первую группу — из-за этого моды на Condition-предметах
   * были бы невидимы для движка.
   */
  static #activeEffects(actor) {
    return actor.appliedEffects ?? actor.effects.filter(e => !e.disabled);
  }

  /**
   * Генератор: обходит активные эффекты актёра и выдаёт разобранные моды,
   * прошедшие фильтр по предмету.
   */
  static *#iterateMatchedMods(actor, item) {
    for (const effect of this.#activeEffects(actor)) {
      for (const change of effect.changes) {
        if (change.key !== MOD_CHANGE_KEY) continue;
        const mod = this.parseMod(change.value);
        if (!mod) continue;
        if (!matchesFilter(item, mod.filter)) continue;
        yield mod;
      }
    }
  }
}
