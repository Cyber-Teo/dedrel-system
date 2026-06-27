export default class WeaponDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      description: new fields.HTMLField({ label: "Description" }),
      
      // Basic Stats
      weapon_type: new fields.StringField({ 
        initial: "melee", 
        choices: {
          "melee": "Ближний бой (Melee)",
          "ranged": "Дальний бой (Ranged)",
          "shield": "Щит (Shield)",
          "magic": "Магическое (Magic)"
        },
        label: "Тип оружия" 
      }),
      damage_type: new fields.SchemaField({
        piercing: new fields.BooleanField({ label: "Колющий" }),
        bludgeoning: new fields.BooleanField({ label: "Дробящий" }),
        slashing: new fields.BooleanField({ label: "Режущий" })
      }),
      skill: new fields.StringField({ initial: "", label: "Навык оружия" }),
      damage_formula: new fields.StringField({ initial: "", label: "Урон" }),
      range: new fields.StringField({ initial: "", label: "Дальность" }),
      
      req_attribute: new fields.StringField({ 
        initial: "none", 
        choices: {
          "none": "Нет",
          "str": "Сила",
          "dex": "Ловкость",
          "con": "Телосложение",
          "int": "Интеллект",
          "wis": "Мудрость",
          "cha": "Харизма"
        },
        label: "Требуемый атрибут" 
      }),
      req_atr_rank: new fields.NumberField({ initial: 0, integer: true, min: 0, max: 6, label: "Требование к рангу" }),
      
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
