/**
 * Two-handed grip (Variable grip).
 *
 * The system has no full "how many hands hold the weapon" state (postponed).
 * Working heuristic: a weapon with
 * a variable grip is held two-handed if the SECOND hand slot is empty.
 * A true two-handed weapon (is_twohanded) occupies both slots and is always two-handed.
 *
 * Used:
 *  - in Item#use(): a maneuver's is_twohanded requirement is read as "two-handed GRIP"
 *    (two-handed OR variable grip with a free hand), not as a weapon flag;
 *  - in the "Damage (two-handed grip)" button on the chat card: +1 Damage Ladder step.
 */

/**
 * Whether the weapon is held with a two-handed grip (or can be held so right now).
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
