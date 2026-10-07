import { RANGED_CLASS_KEYS } from "../constants.mjs";

/**
 * A ranged weapon's class by its key/name.
 * Returns an element of RANGED_CLASS_KEYS ({ class, ammo, recoverable }) or null.
 *
 * null means "not an ammunition-using ranged weapon": thrown (is_thrown),
 * a weapon without weapon_type.ranged, or a key matching none of the known classes.
 *
 * IMPORTANT: check order firearm → crossbow → bow. Matching is by substring (as in
 * the maneuver gate, item.mjs), so "crossbow" must be checked before "bow".
 */
export function getRangedClass(weapon) {
  if (!weapon || weapon.type !== "weapon") return null;
  const sys = weapon.system || {};
  if (!sys.weapon_type?.ranged || sys.is_thrown) return null;
  const hay = `${sys.key || ""} ${weapon.name || ""}`.toLowerCase();
  for (const rc of RANGED_CLASS_KEYS) {
    if (rc.keys.some(k => hay.includes(k))) return rc;
  }
  return null;
}

/** Whether the ammunition (an item of type ammunition) suits this weapon by ammo_type ↔ class. */
export function ammoMatchesWeapon(ammo, weapon) {
  const rc = getRangedClass(weapon);
  if (!rc || ammo?.type !== "ammunition") return false;
  return ammo.system?.ammo_type === rc.ammo;
}
