import { physicalItemFields } from "./_physical.mjs";
import { craftingFields } from "./_crafting.mjs";

/**
 * Зелье — расходуемый предмет с мгновенным эффектом (лечение/бафф/дебафф).
 * Механические эффекты реализуются через Active Effects на самом предмете
 * (шаблоны, применяемые в Item#use), поэтому отдельного поля changes нет.
 *
 * Заряды/расход намеренно используют те же плоские поля, что и остальная
 * система (uses_value/uses_max/uses_per, consumable, quantity), чтобы поток
 * Item#use() работал без специальной ветки для зелий.
 */
export default class PotionDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { HTMLField, StringField, NumberField, BooleanField, SchemaField } = foundry.data.fields;
    return {
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      key: new StringField({ required: false, initial: "" }),
      ...physicalItemFields({ weight: 0.1 }),
      ...craftingFields(),
      quantity: new NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      stackable: new BooleanField({ required: true, initial: true }),
      // Краткое описание эффекта для игрока (в дополнение к description)
      effect_description: new StringField({ required: false, initial: "" }),
      // Расход при использовании (списывается quantity в Item#use)
      consumable: new BooleanField({ required: true, initial: true }),
      // Заряды (для многодозовых склянок); пусто/0 = без зарядов
      uses_value: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      uses_max: new StringField({ required: false, initial: "" }),
      uses_per: new StringField({ required: false, initial: "" }),
      formula_heal: new StringField({ required: false, initial: "", label: "Healing Formula" }),
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
