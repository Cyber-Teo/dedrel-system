/**
 * Выделенная схема для постоянных системных бонусов персонажа.
 * Возвращает объект SchemaField, который затем внедряется в основную DataModel.
 *
 * Здесь живут ТОЛЬКО безусловные постоянные бонусы, которые применяются
 * к любым броскам (в том числе без предмета: проверки навыков, спасброски).
 *
 * Одноразовые и условные бонусы «на следующий манёвр» (бывшие next_*)
 * реализованы через DSL-модификаторы на ключе Active Effect
 * "flags.dedrel.mod" — см. EFFECT_KEYS_CHEAT_SHEET.md и
 * src/utils/dedrel-bonuses.mjs.
 */
export function getBonusesSchema() {
  const fields = foundry.data.fields;

  return new fields.SchemaField({
    // Глобальные бонусы.
    // ШТРАФЫ реализуются как отрицательные значения этих же полей (формула броска
    // умеет вычитать: см. src/dice/roll.mjs). Отдельной сущности «штрафов» нет.
    global_roll: new fields.NumberField({ initial: 0, integer: true }),
    global_skill: new fields.NumberField({ initial: 0, integer: true }),
    global_save: new fields.NumberField({ initial: 0, integer: true }),
    global_ap_discount: new fields.NumberField({ initial: 0, integer: true }),

    // Наценка на ОД («штраф на ОД»): манёвры/заклинания стоят ДОРОЖЕ на N.
    // Положительное значение увеличивает стоимость; складывается с DSL-скидками
    // (скидка и наценка взаимозачитываются). global_ap_penalty — на манёвры И
    // заклинания; maneuver_ap_penalty — только манёвры; spell_ap_penalty — только
    // заклинания. Применяется в DedrelBonuses.effectiveApCost.
    global_ap_penalty: new fields.NumberField({ initial: 0, integer: true }),
    maneuver_ap_penalty: new fields.NumberField({ initial: 0, integer: true }),
    spell_ap_penalty: new fields.NumberField({ initial: 0, integer: true }),

    // Флаги-переключатели: эффекты добавляют 1 (режим Add), любое значение > 0 = включено.
    // Числовое поле вместо булевого, чтобы несколько одновременных источников
    // (манёвр + талант) складывались и не затирали друг друга при снятии одного.
    ignore_wound_penalty: new fields.NumberField({ initial: 0, integer: true }),
    infinite_explode: new fields.NumberField({ initial: 0, integer: true }),
    damage_explode: new fields.NumberField({ initial: 0, integer: true }),

    // Множитель Максимального Здоровья. Значение 0.25 увеличит ХП на 25%.
    hp_multiplier: new fields.NumberField({ initial: 0 })
  });
}
