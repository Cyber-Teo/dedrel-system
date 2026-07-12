import { physicalItemFields } from "./_physical.mjs";
import { craftingFields } from "./_crafting.mjs";

export default class WeaponDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      description: new fields.HTMLField({ label: "Description" }),
      key: new fields.StringField({ initial: "" }),
      // Общие физические поля (редкость/вес/цена) для экономики и перегрузки
      ...physicalItemFields(),
      // Встроенный «чертёж» (состав/наценка) — см. _crafting.mjs
      ...craftingFields(),

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
      // Базовая формула урона — фолбэк, если для типа не задана своя (damage_formulas)
      damage_formula: new fields.StringField({ initial: "" }),
      // Формулы урона ПО ТИПАМ: манёвр с req_weapon_damage_type берёт формулу
      // своего типа; пустая строка = использовать damage_formula. Так глефа может
      // бить slashing 1d8 и piercing 1d4 — выбор режима делается выбором манёвра.
      damage_formulas: new fields.SchemaField({
        slashing: new fields.StringField({ initial: "" }),
        piercing: new fields.StringField({ initial: "" }),
        bludgeoning: new fields.StringField({ initial: "" })
      }),
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
      // Бронебойность 0-10: каждая единица гасит 10% DR цели (10 = игнорирует DR полностью)
      armor_piercing: new fields.NumberField({ initial: 0, integer: true, min: 0, max: 10 }),
      // Качество/редкость НЕ дублируем: у оружия уже есть rarity (physicalItemFields,
      // common→legendary) — тяжесть осечек огнестрела читается из него (src/dice/roll.mjs).

      // Бонусы против типов существ. Карта { <ключ типа>: potency(0-10) }.
      // Если цель несёт тип (Item creature_type), урон умножается на
      // (1 + potency·0.1) ДО вычета DR цели. Ключи — из CONFIG.DEDREL.creatureTypes
      // (расширяемо через конфиг). Свободный объект → новые типы не требуют миграции.
      vs_creature: new fields.ObjectField({ initial: {} }),
      
      // Properties — плоские флаги свойств; по ним гейтятся манёвры (req_weapon_property)
      is_auxiliary: new fields.BooleanField({ initial: false }),
      is_fast: new fields.BooleanField({ initial: false }),
      is_slow: new fields.BooleanField({ initial: false }),
      is_twohanded: new fields.BooleanField({ initial: false }),
      is_thrown: new fields.BooleanField({ initial: false }),
      is_reloading: new fields.BooleanField({ initial: false }),
      // Вариативный хват: можно держать одной или двумя руками; при двуручном
      // хвате урон поднимается на ступень Лестницы (кнопка на карточке чата)
      is_variable_grip: new fields.BooleanField({ initial: false }),
      // Парное: одна сущность-«пара» (катары, когти) занимает ОБА слота рук при
      // экипировке, как двуручное, но двуручным ХВАТОМ не считается
      is_paired: new fields.BooleanField({ initial: false })
    };
  }
}
