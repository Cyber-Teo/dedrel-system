import { physicalItemFields } from "./_physical.mjs";
import { craftingFields, migrateCraftingData } from "./_crafting.mjs";

/**
 * Квестовый предмет — привязан к заданию. По умолчанию не продаётся и не
 * выбрасывается (can_be_sold / can_be_dropped = false); торговцы и логика
 * сброса лута обязаны уважать эти флаги.
 */
export default class QuestItemDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { HTMLField, StringField, NumberField, BooleanField } = foundry.data.fields;
    return {
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      key: new StringField({ required: false, initial: "" }),
      ...physicalItemFields(),
      ...craftingFields(),
      quantity: new NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      stackable: new BooleanField({ required: true, initial: false }),
      // Задание, к которому относится предмет (id или название)
      quest_id: new StringField({ required: false, initial: "" }),
      can_be_sold: new BooleanField({ required: true, initial: false }),
      can_be_dropped: new BooleanField({ required: true, initial: false })
    };
  }

  static migrateData(source) {
    migrateCraftingData(source);
    return super.migrateData(source);
  }
}
