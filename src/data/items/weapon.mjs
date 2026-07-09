import { physicalItemFields } from "./_physical.mjs";

export default class WeaponDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      description: new fields.HTMLField({ label: "Description" }),
      key: new fields.StringField({ initial: "" }),
      // Общие физические поля (редкость/вес/цена) для экономики и перегрузки
      ...physicalItemFields(),

      // Basic Stats
      weapon_type: new fields.SchemaField({
        melee: new fields.BooleanField(),
        ranged: new fields.BooleanField(),
        shield: new fields.BooleanField(),
        magic: new fields.BooleanField()
      }),
      damage_type: new fields.SchemaField({
        piercing: new fields.BooleanField(),
        bludgeoning: new fields.BooleanField(),
        slashing: new fields.BooleanField()
      }),
      skill: new fields.StringField({ initial: "" }),
      damage_formula: new fields.StringField({ initial: "" }),
      formula_heal: new fields.StringField({ initial: "", label: "Healing Formula" }),
      equipped: new fields.BooleanField({ initial: false }),
      range: new fields.StringField({ initial: "" }),

      properties: new fields.SchemaField({
        natural: new fields.BooleanField({ initial: false }),
        armor_piercing: new fields.BooleanField({ initial: false }),
        misfire_chance: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        consumed_on_use: new fields.BooleanField({ initial: false }),
        can_be_sold: new fields.BooleanField({ initial: false }),
        can_be_dropped: new fields.BooleanField({ initial: false })
      }),
      // Потребление и количество
      quantity: new fields.NumberField({ initial: 1, integer: true, min: 0 }),
      consume_target: new fields.StringField({ initial: "" }), // ID предмета-боеприпаса
      consume_amount: new fields.NumberField({ initial: 1, integer: true, min: 0 }),
      // Заряды и макросы (добавлено для поддержки магических свойств, особенностей и эффектов)
      uses_value: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      uses_max: new fields.StringField({ initial: "" }),
      uses_per: new fields.StringField({ initial: "" }),
      on_use_macro: new fields.StringField({ initial: "" }),
      
      prerequisites_attributes: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      prerequisites_skills: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      
      control_zone: new fields.NumberField({ initial: 0, integer: true, min: 0, max: 3 }),
      armor_piercing: new fields.NumberField({ initial: 0, integer: true, min: 0, max: 3 }),

      // Бонусы против типов существ. Карта { <ключ типа>: potency(0-10) }.
      // Если цель несёт тип (Item creature_type), урон умножается на
      // (1 + potency·0.1) ДО вычета DR цели. Ключи — из CONFIG.DEDREL.creatureTypes
      // (расширяемо через конфиг). Свободный объект → новые типы не требуют миграции.
      vs_creature: new fields.ObjectField({ initial: {} }),
      
      // Properties
      is_auxiliary: new fields.BooleanField({ initial: false }),
      is_fast: new fields.BooleanField({ initial: false }),
      is_slow: new fields.BooleanField({ initial: false }),
      is_twohanded: new fields.BooleanField({ initial: false }),
      is_thrown: new fields.BooleanField({ initial: false }),
      is_enchanted: new fields.BooleanField({ initial: false }),
      is_reloading: new fields.BooleanField({ initial: false }),
      
      equipped: new fields.BooleanField({ initial: false })
    };
  }
}
