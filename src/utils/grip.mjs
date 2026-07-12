/**
 * Двуручный хват (Variable grip).
 *
 * Полноценного состояния «в скольких руках оружие» в системе нет (отложено,
 * см. NOTES.md «Weapon Versatility / Grips»). Рабочая эвристика: оружие с
 * вариативным хватом удерживается двуручно, если ВТОРОЙ слот руки пуст.
 * Истинно двуручное (is_twohanded) занимает оба слота и двуручно всегда.
 *
 * Используется:
 *  - в Item#use(): требование манёвра is_twohanded трактуется как «двуручный ХВАТ»
 *    (двуручное ИЛИ вариативное со свободной рукой), а не как флаг оружия;
 *  - в кнопке «Урон (двуручный хват)» на карточке чата: +1 ступень Лестницы урона.
 */

/**
 * Удерживается ли оружие двуручным хватом (или может удерживаться прямо сейчас).
 * @param {Actor} actor
 * @param {Item} weapon
 * @returns {boolean}
 */
export function heldTwoHanded(actor, weapon) {
  if (!actor || !weapon) return false;
  if (weapon.system.is_twohanded) return true;
  if (!weapon.system.is_variable_grip) return false;

  const slots = actor.system.equipment_slots || {};
  const mainId = slots.main_hand?.item_id;
  const offId = slots.off_hand?.item_id;
  if (mainId === weapon.id && !offId) return true;
  if (offId === weapon.id && !mainId) return true;
  return false;
}
