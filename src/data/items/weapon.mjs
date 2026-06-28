export default class WeaponDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      description: new fields.HTMLField({ label: "Description" }),
      
      // Basic Stats
      weapon_type: new fields.SchemaField({
        melee: new fields.BooleanField({ label: "Ближний бой (Melee)" }),
        ranged: new fields.BooleanField({ label: "Дальний бой (Ranged)" }),
        shield: new fields.BooleanField({ label: "Щит (Shield)" }),
        magic: new fields.BooleanField({ label: "Магическое (Magic)" })
      }),
      damage_type: new fields.SchemaField({
        piercing: new fields.BooleanField({ label: "Колющий" }),
        bludgeoning: new fields.BooleanField({ label: "Дробящий" }),
        slashing: new fields.BooleanField({ label: "Режущий" })
      }),
      skill: new fields.StringField({ initial: "", label: "Навык оружия" }),
      damage_formula: new fields.StringField({ initial: "", label: "Урон" }),
      range: new fields.StringField({ initial: "", label: "Дальность" }),

      properties: new fields.SchemaField({
        natural: new fields.BooleanField({ initial: false }),
        auxiliary: new fields.BooleanField({ initial: false }),
        armor_piercing: new fields.BooleanField({ initial: false }),
        fast: new fields.BooleanField({ initial: false }),
        slow: new fields.BooleanField({ initial: false }),
        thrown: new fields.BooleanField({ initial: false }),
        enchanted: new fields.BooleanField({ initial: false }),
        misfire_chance: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        requires_reload: new fields.BooleanField({ initial: false }),
        consumed_on_use: new fields.BooleanField({ initial: false }),
        can_be_sold: new fields.BooleanField({ initial: false }),
        can_be_dropped: new fields.BooleanField({ initial: false })
      }),
      // Заряды и макросы (добавлено для поддержки магических свойств, особенностей и эффектов)
      uses_value: new fields.NumberField({ initial: 0, integer: true, min: 0, label: "Текущие заряды" }),
      uses_max: new fields.StringField({ initial: "", label: "Максимум зарядов" }),
      uses_per: new fields.StringField({ initial: "", label: "Восстановление зарядов" }),
      on_use_macro: new fields.StringField({ initial: "", label: "Макрос при использовании" }),
      
      prerequisites_attributes: new fields.ArrayField(new fields.StringField(), { initial: [], label: "Требования к атрибутам" }),
      prerequisites_skills: new fields.ArrayField(new fields.StringField(), { initial: [], label: "Требования к навыкам" }),
      
      control_zone: new fields.NumberField({ initial: 0, integer: true, min: 0, max: 3, label: "Зона контроля" }),
      armor_piercing: new fields.NumberField({ initial: 0, integer: true, min: 0, max: 3, label: "Бронебойность" }),
      
      // Properties
      is_auxiliary: new fields.BooleanField({ initial: false, label: "Вспомогательное" }),
      is_fast: new fields.BooleanField({ initial: false, label: "Быстрое" }),
      is_slow: new fields.BooleanField({ initial: false, label: "Медленное" }),
      is_twohanded: new fields.BooleanField({ initial: false, label: "Двуручное" }),
      is_thrown: new fields.BooleanField({ initial: false, label: "Метательное" }),
      is_enchanted: new fields.BooleanField({ initial: false, label: "Магическое" }),
      is_reloading: new fields.BooleanField({ initial: false, label: "Перезарядка" }),
      
      equipped: new fields.BooleanField({ initial: false, label: "Экипировано" })
    };
  }
}
