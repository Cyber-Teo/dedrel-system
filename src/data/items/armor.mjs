import { ITEM_RARITY_ENUM, ACCESSORY_SLOT_TYPES } from "../../constants.mjs";
import { craftingFields } from "./_crafting.mjs";

export default class ArmorDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      description: new fields.HTMLField({ label: "Description" }),
      key: new fields.StringField({ initial: "" }),
      rarity: new fields.StringField({ initial: "common", choices: ITEM_RARITY_ENUM }),
      // Аксессуарный слот: если задан (напр. "head" для шлема), броня надевается
      // в слот аксессуара, а не в слои тела (slot). Пусто = обычная броня тела.
      equip_slot: new fields.StringField({ required: false, blank: true, initial: "", choices: ACCESSORY_SLOT_TYPES }),
      base_price: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      weight: new fields.NumberField({ initial: 0, min: 0 }),
      // Встроенный «чертёж» (состав/наценка) — см. _crafting.mjs
      ...craftingFields(),
      slot: new fields.StringField({ initial: "middle", choices: ["lower", "middle", "upper", "universal"] }),
      weight_class: new fields.StringField({ initial: "light", choices: ["light", "medium", "heavy"] }),
      
      dr: new fields.SchemaField({
        slashing: new fields.NumberField({ initial: 0, integer: true }),
        piercing: new fields.NumberField({ initial: 0, integer: true }),
        bludgeoning: new fields.NumberField({ initial: 0, integer: true }),
        heat: new fields.NumberField({ initial: 0, integer: true }),
        cold: new fields.NumberField({ initial: 0, integer: true }),
        necrotic: new fields.NumberField({ initial: 0, integer: true }),
        radiant: new fields.NumberField({ initial: 0, integer: true }),
        electric: new fields.NumberField({ initial: 0, integer: true }),
        sonic: new fields.NumberField({ initial: 0, integer: true }),
        acid: new fields.NumberField({ initial: 0, integer: true })
      }),
      
      // «Щель» под добавки СВЕРХ лекала (материал, зачарование): механику типа и
      // свойств актор выводит сам, дублировать её сюда не нужно.
      modifiers: new fields.SchemaField({
        dodge: new fields.NumberField({ initial: 0, integer: true }),
        block: new fields.NumberField({ initial: 0, integer: true }),
        stealth: new fields.NumberField({ initial: 0, integer: true }),
        // НЕ ПРИМЕНЯЮТСЯ: у актора нет канала для штрафов к стрелковым/магическим
        // атакам (разбор и варианты — в NOTES.md).
        ranged_attack: new fields.NumberField({ initial: 0, integer: true }),
        magic_attack: new fields.NumberField({ initial: 0, integer: true }),
        movement: new fields.NumberField({ initial: 0, integer: true })
      }),

      // Свойства лекала (_rules/12. Armor.md §Свойства). Механику ВЫВОДИТ АКТОР —
      // дублировать её в modifiers.* не нужно. Исключения помечены ниже: там поле
      // хранится, показывается на листе, но ни на что не влияет.
      properties: new fields.SchemaField({
        exclusive_slot: new fields.BooleanField({ initial: false }),
        rigid: new fields.BooleanField({ initial: false }),
        loud: new fields.BooleanField({ initial: false }),
        // Отягощающий: −2 к стрелковым (кроме огнестрела) и магическим атакам.
        // ПОКА ДЕКОРАТИВНО: прикладывать некуда — см. modifiers.ranged_attack выше.
        encumbering: new fields.BooleanField({ initial: false }),
        // ЛЕГАСИ: в правилах отсутствует, никем не читается.
        weak_point_protection: new fields.BooleanField({ initial: false }),
        // Отражающий N — геометрия доспеха даёт +N к Блоку.
        deflecting: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        // Твёрдость N (Cohesion) — гасит N входящей Бронебойности из любого
        // источника, до сравнения AP с DR; Рассекание N на оружии её отменяет
        // (craft/Armor Rework Plan.md §5). ПОКА ДЕКОРАТИВНО: в расчёт урона не
        // входит, в правилах (12. Armor) не зафиксировано.
        cohesion: new fields.NumberField({ initial: 0, integer: true, min: 0 })
      }),

      // Заряды и макросы (добавлено для поддержки магических свойств, особенностей и эффектов)
      uses_value: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      uses_max: new fields.StringField({ initial: "" }),
      uses_per: new fields.StringField({ initial: "" }),
      formula_heal: new fields.StringField({ initial: "", label: "Healing Formula" }),
      on_use_macro: new fields.StringField({ initial: "" }),

      prerequisites_text: new fields.StringField({ initial: "" }),
      prerequisites_attributes: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      prerequisites_skills: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      prerequisites_talents: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      prerequisites_mutations: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      prerequisites_bloodlines: new fields.ArrayField(new fields.StringField(), { initial: [] }),

      equipped: new fields.BooleanField({ initial: false })
    };
  }
}
