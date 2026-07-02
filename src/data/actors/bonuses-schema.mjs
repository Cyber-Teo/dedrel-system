/**
 * Выделенная схема для всех системных бонусов персонажа.
 * Возвращает объект SchemaField, который затем внедряется в основную DataModel.
 */
export function getBonusesSchema() {
  const fields = foundry.data.fields;
  
  return new fields.SchemaField({
    // Глобальные бонусы
    global_roll: new fields.NumberField({ initial: 0, integer: true }),
    global_skill: new fields.NumberField({ initial: 0, integer: true }),
    global_save: new fields.NumberField({ initial: 0, integer: true }),
    global_ap_discount: new fields.NumberField({ initial: 0, integer: true }),
    
    // Одноразовые бонусы (Next Action)
    next_attack: new fields.NumberField({ initial: 0, integer: true }),
    next_damage: new fields.NumberField({ initial: 0, integer: true }),
    next_melee_attack: new fields.NumberField({ initial: 0, integer: true }),
    next_melee_damage: new fields.NumberField({ initial: 0, integer: true }),
    next_ranged_attack: new fields.NumberField({ initial: 0, integer: true }),
    next_ranged_damage: new fields.NumberField({ initial: 0, integer: true }),
    
    // Одноразовые модификаторы ОД
    next_ap_discount: new fields.NumberField({ initial: 0, integer: true }),
    next_ap_set: new fields.NumberField({ initial: -1, integer: true }),

    // Фильтр для next_ap_set: определяет, к каким манёврам применяется бесплатное действие.
    // "any" — любой манёвр (по умолчанию, обратная совместимость).
    // "ranged" / "melee" — по типу оружия.
    // "skill:bows" — по группе навыка.
    // "key:shot_bow" — по system.key манёвра.
    // Поддерживает несколько условий через "|", например "ranged|key:throw" (логика OR).
    next_free_maneuver_filter: new fields.StringField({ initial: "any" })
  });
}
