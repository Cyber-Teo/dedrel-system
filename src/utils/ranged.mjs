import { RANGED_CLASS_KEYS } from "../constants.mjs";

/**
 * Класс дальнобойного оружия по его ключу/названию.
 * Возвращает элемент RANGED_CLASS_KEYS ({ class, ammo, recoverable }) или null.
 *
 * null означает «не боеприпасное дальнобойное»: метательное (is_thrown),
 * оружие без weapon_type.ranged, либо ключ без совпадений с известными классами.
 *
 * ВАЖНО: порядок проверки firearm → crossbow → bow. Матчинг подстрокой (как в
 * гейте манёвров, item.mjs), поэтому "crossbow" обязан проверяться раньше "bow".
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

/** Подходит ли боеприпас (item типа ammunition) данному оружию по ammo_type ↔ классу. */
export function ammoMatchesWeapon(ammo, weapon) {
  const rc = getRangedClass(weapon);
  if (!rc || ammo?.type !== "ammunition") return false;
  return ammo.system?.ammo_type === rc.ammo;
}
