/**
 * Проверяет, соответствует ли манёвр фильтру из next_free_maneuver_filter.
 * Поддерживает несколько условий через "|" (логика OR).
 *
 * Поддерживаемые токены фильтра:
 *   "any"          — любой манёвр (всегда true)
 *   "ranged"       — манёвр требует дальнобойного оружия (req_weapon_type.ranged)
 *   "melee"        — манёвр требует оружия ближнего боя (req_weapon_type.melee)
 *   "skill:<key>"  — манёвр привязан к конкретной группе навыков (req_weapon_skill_group)
 *   "key:<key>"    — манёвр имеет конкретный system.key или name
 *
 * @param {Item} maneuver
 * @param {string} filter
 * @returns {boolean}
 */
function matchesFilter(maneuver, filter) {
  if (!filter || filter === "any") return true;

  const tokens = filter.split("|").map(s => s.trim());
  const wType = maneuver.system.req_weapon_type || {};
  const skillGroup = maneuver.system.req_weapon_skill_group || "";

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
      if (maneuver.system.key === k || maneuver.name === k) return true;
    }
  }
  return false;
}

export class DedrelBonuses {
  /**
   * Extracts applicable bonuses for the given maneuver from the actor's system.bonuses.
   *
   * ВАЖНО для next_ap_set:
   *   Эффект применяется ТОЛЬКО если манёвр проходит проверку next_free_maneuver_filter.
   *   Если манёвр не проходит фильтр — apSet остаётся null и эффект НЕ сгорает
   *   (он протухнет сам по duration в конце хода).
   *
   * @param {Actor} actor
   * @param {Item} maneuver
   * @returns {Object} { attack, damage, apDiscount, apSet, usedKeys }
   */
  static extractNextActionBonuses(actor, maneuver) {
    const bonuses = actor.system.bonuses || {};
    let attack = bonuses.next_attack || 0;
    let damage = bonuses.next_damage || 0;
    let apDiscount = (bonuses.next_ap_discount || 0) + (bonuses.global_ap_discount || 0);
    let apSet = null;
    let usedKeys = [];

    if (bonuses.next_attack) usedKeys.push("system.bonuses.next_attack");
    if (bonuses.next_damage) usedKeys.push("system.bonuses.next_damage");
    if (bonuses.next_ap_discount) usedKeys.push("system.bonuses.next_ap_discount");

    // next_ap_set применяется только если манёвр проходит фильтр
    if (bonuses.next_ap_set !== undefined && bonuses.next_ap_set !== -1) {
      const filter = bonuses.next_free_maneuver_filter || "any";
      if (matchesFilter(maneuver, filter)) {
        apSet = bonuses.next_ap_set;
        usedKeys.push("system.bonuses.next_ap_set");
        usedKeys.push("system.bonuses.next_free_maneuver_filter");
      }
      // Если фильтр не прошёл — apSet остаётся null, usedKeys не пополняется,
      // эффект сгорит по истечению duration (конец хода).
    }

    if (maneuver.type === "maneuver" || maneuver.type === "spell") {
      const wType = maneuver.system.req_weapon_type || {};
      
      if (wType.melee) {
        attack += bonuses.next_melee_attack || 0;
        damage += bonuses.next_melee_damage || 0;
        if (bonuses.next_melee_attack) usedKeys.push("system.bonuses.next_melee_attack");
        if (bonuses.next_melee_damage) usedKeys.push("system.bonuses.next_melee_damage");
      }
      
      if (wType.ranged) {
        attack += bonuses.next_ranged_attack || 0;
        damage += bonuses.next_ranged_damage || 0;
        if (bonuses.next_ranged_attack) usedKeys.push("system.bonuses.next_ranged_attack");
        if (bonuses.next_ranged_damage) usedKeys.push("system.bonuses.next_ranged_damage");
      }
      
      // Инферим тип (дальний/ближний) из группы навыка, если req_weapon_type не задан явно
      const skillGroup = maneuver.system.req_weapon_skill_group;
      if (skillGroup && skillGroup !== "any" && !wType.melee && !wType.ranged) {
        if (["bows", "firearms", "crossbows", "throwing", "artillery"].includes(skillGroup)) {
          attack += bonuses.next_ranged_attack || 0;
          damage += bonuses.next_ranged_damage || 0;
          if (bonuses.next_ranged_attack && !usedKeys.includes("system.bonuses.next_ranged_attack")) usedKeys.push("system.bonuses.next_ranged_attack");
          if (bonuses.next_ranged_damage && !usedKeys.includes("system.bonuses.next_ranged_damage")) usedKeys.push("system.bonuses.next_ranged_damage");
        } else {
          attack += bonuses.next_melee_attack || 0;
          damage += bonuses.next_melee_damage || 0;
          if (bonuses.next_melee_attack && !usedKeys.includes("system.bonuses.next_melee_attack")) usedKeys.push("system.bonuses.next_melee_attack");
          if (bonuses.next_melee_damage && !usedKeys.includes("system.bonuses.next_melee_damage")) usedKeys.push("system.bonuses.next_melee_damage");
        }
      }
    }

    return { attack, damage, apDiscount, apSet, usedKeys };
  }

  /**
   * Consumes all active effects on the actor that grant the used keys.
   * @param {Actor} actor 
   * @param {Array<String>} usedKeys 
   */
  static async consumeNextActionBonuses(actor, usedKeys) {
    if (!usedKeys || usedKeys.length === 0) return;
    
    const effectsToDelete = [];
    for (const effect of actor.effects) {
      if (effect.changes.some(c => usedKeys.includes(c.key))) {
        effectsToDelete.push(effect.id);
      }
    }
    
    if (effectsToDelete.length > 0) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", effectsToDelete);
    }
  }
}

