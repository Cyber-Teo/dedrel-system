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
    // Глобальные бонусы
    global_roll: new fields.NumberField({ initial: 0, integer: true }),
    global_skill: new fields.NumberField({ initial: 0, integer: true }),
    global_save: new fields.NumberField({ initial: 0, integer: true }),
    global_ap_discount: new fields.NumberField({ initial: 0, integer: true }),

    // Флаги-переключатели: эффекты добавляют 1 (режим Add), любое значение > 0 = включено.
    // Числовое поле вместо булевого, чтобы несколько одновременных источников
    // (манёвр + талант) складывались и не затирали друг друга при снятии одного.
    ignore_wound_penalty: new fields.NumberField({ initial: 0, integer: true })
  });
}
