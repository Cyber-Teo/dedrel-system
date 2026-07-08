import { physicalItemFields } from "./_physical.mjs";

/**
 * Ремесленный материал — сырьё для крафта/починки (руда, травы, дерево, шкуры,
 * магические эссенции). Стакается; используется будущей системой крафта (Фаза 4).
 */
export default class CraftMaterialDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { HTMLField, StringField, NumberField, BooleanField } = foundry.data.fields;
    return {
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      key: new StringField({ required: false, initial: "" }),
      ...physicalItemFields(),
      quantity: new NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      stackable: new BooleanField({ required: true, initial: true }),
      // Тип материала: ore, herb, wood, skin, magical_essence, и т.д.
      material_type: new StringField({ required: true, initial: "ore" })
    };
  }
}
