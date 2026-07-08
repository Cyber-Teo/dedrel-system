import { physicalItemFields } from "./_physical.mjs";

/**
 * Свиток — одноразовый носитель заклинания. Хранит ссылку на предмет-заклинание
 * (spell_id / spell_key), который «откастовывается» со свитка; после использования
 * обычно уничтожается (consumable + quantity 1).
 *
 * Как и зелья, использует плоские поля зарядов/расхода для совместимости
 * с Item#use().
 */
export default class ScrollDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { HTMLField, StringField, NumberField, BooleanField, SchemaField } = foundry.data.fields;
    return {
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      key: new StringField({ required: false, initial: "" }),
      ...physicalItemFields({ weight: 0.01, rarity: "uncommon" }),
      quantity: new NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      stackable: new BooleanField({ required: true, initial: true }),
      // Заклинание, заключённое в свитке: ссылка на Item типа spell.
      // spell_id — id встроенного предмета; spell_key — system.key для поиска в компендиуме.
      spell_id: new StringField({ required: false, initial: "" }),
      spell_key: new StringField({ required: false, initial: "" }),
      consumable: new BooleanField({ required: true, initial: true }),
      uses_value: new NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      uses_max: new StringField({ required: false, initial: "1" }),
      uses_per: new StringField({ required: false, initial: "" }),
      on_use_macro: new StringField({ required: false, initial: "" }),
      requirements: new SchemaField({
        text: new StringField({ required: false, initial: "" }),
        attribute: new SchemaField({
          key: new StringField({ required: false, initial: "" }),
          rank: new NumberField({ required: true, integer: true, initial: 0, min: 0 })
        })
      })
    };
  }
}
