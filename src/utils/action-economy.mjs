/**
 * Экономика действий: «одно Действие за ход» (_rules/14. Combat Maneuvers).
 *
 * Тип манёвра нельзя прочитать с карточки: большинство помечено сразу как
 * Действие + Цепь (или Действие + Реакция), и чем манёвр окажется, решает
 * СПОСОБ применения. Поэтому режим вычисляется в момент использования:
 * запуск из чейн-HUD — Цепь, не ваш ход — Реакция, всё остальное съедает
 * Действие за ход.
 *
 * Счётчик намеренно предупреждающий, а не запрещающий: реакция может
 * сработать и в свой ход (уронил цель Подсечкой — сработало Добивание),
 * автоматика такой случай не отличит, а блокировка сорвала бы легальный
 * ход. Та же логика, что у перерасхода Скорости в src/canvas/movement.mjs.
 */

const FLAG_SCOPE = "dedrel";
const FLAG_KEY = "actionSpent";

export const ActionEconomy = {
  /**
   * Чем оказался манёвр в этот раз.
   * @param {Actor} actor
   * @param {Item} item
   * @param {"chain"|"reaction"|undefined} requested — режим, заявленный вызывающим
   * @returns {"action"|"chain"|"reaction"|"free"}
   */
  resolveMode(actor, item, requested) {
    const types = item.system?.action_type || {};
    if (types.free) return "free";
    if (requested === "chain" && types.chain) return "chain";
    if (requested === "reaction" && types.reaction) return "reaction";

    // Вне своего хода Действие потратить нельзя — значит это Реакция.
    if (types.reaction && !this.isOwnTurn(actor)) return "reaction";

    if (types.action) return "action";
    if (types.chain) return "chain";
    if (types.reaction) return "reaction";
    return "free";
  },

  /**
   * Идёт ли сейчас ход этого актёра. Сравнение по uuid, а не по id: у
   * несвязанных токенов синтетический актёр наследует id базового, поэтому
   * по id вся стая волков с одного прототипа считалась бы одним существом.
   */
  isOwnTurn(actor) {
    if (!game.combat?.started || !actor) return false;
    return game.combat.combatant?.actor?.uuid === actor.uuid;
  },

  /** Потрачено ли Действие в текущем ходу. */
  isActionSpent(actor) {
    return !!actor?.getFlag(FLAG_SCOPE, FLAG_KEY);
  },

  /**
   * Отмечает Действие потраченным. Возвращает true, если оно уже было
   * потрачено, — вызывающий решает, предупреждать ли игрока.
   */
  async spendAction(actor) {
    if (!actor || !game.combat?.started) return false;
    const already = this.isActionSpent(actor);
    if (!already) await actor.setFlag(FLAG_SCOPE, FLAG_KEY, true);
    return already;
  },

  /** Сброс на начало хода — зовётся оттуда же, откуда восстанавливаются ОД. */
  async resetAction(actor) {
    if (!actor) return;
    if (this.isActionSpent(actor)) await actor.setFlag(FLAG_SCOPE, FLAG_KEY, false);
  }
};
