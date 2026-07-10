import { physicalItemFields } from "./_physical.mjs";
import { craftingFields } from "./_crafting.mjs";
import { MATERIAL_CLASS_ENUM, SLOT_TIER_ENUM } from "../../constants.mjs";

/**
 * Ремесленный материал — сырьё для крафта/починки. Измеряется в «мерах»
 * (quantity). Семь канонических классов (material_class) — из правил крафта
 * (craft/New Craft.md). Блок crafting тоже подключён: обработанные материалы
 * (слитки из руды, кожа из шкур) сами являются продуктами крафта.
 *
 * grants — варианты комплектации для оружейных/броневых материалов: крафтер
 * при создании изделия выбирает ОДИН вариант (паттерн «+1 И обычный слот
 * ИЛИ необычный слот»). У чисто ингредиентных материалов массив пуст.
 */
export default class CraftMaterialDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { HTMLField, StringField, NumberField, BooleanField, SchemaField, ArrayField } = foundry.data.fields;
    return {
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      key: new StringField({ required: false, initial: "" }),
      ...physicalItemFields(),
      ...craftingFields(),
      quantity: new NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      stackable: new BooleanField({ required: true, initial: true }),
      // ЛЕГАСИ: свободный тег (ore, herb...). Оставлен для старых данных и
      // тонкой классификации; канонический класс — material_class ниже.
      material_type: new StringField({ required: true, initial: "ore" }),
      // Канонический класс материала (7 типов из правил крафта)
      material_class: new StringField({ required: true, initial: "metal", choices: MATERIAL_CLASS_ENUM }),
      // Текст особых свойств (вес −50%, урон нежити и т.п.)
      special_rules: new StringField({ required: false, blank: true, initial: "" }),
      // К каким изделиям материал применим как ОСНОВНОЙ (для лекал оружия/брони)
      applicable_to: new SchemaField({
        weapon: new BooleanField({ required: true, initial: false }),
        armor: new BooleanField({ required: true, initial: false }),
        shield: new BooleanField({ required: true, initial: false }),
        jewelry: new BooleanField({ required: true, initial: false })
      }),
      // Варианты комплектации изделия из этого материала (выбирается один)
      grants: new ArrayField(new SchemaField({
        label: new StringField({ required: true, blank: true, initial: "" }),
        bonus: new NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
        slots: new ArrayField(new StringField({ choices: SLOT_TIER_ENUM }))
      }))
    };
  }

  /** Маппинг легаси-тегов material_type в канонический material_class. */
  static migrateData(source) {
    if (!source.material_class && source.material_type) {
      const map = { ore: "metal", herb: "herb", wood: "wood", skin: "leather", cloth: "cloth" };
      if (map[source.material_type]) source.material_class = map[source.material_type];
    }
    return super.migrateData(source);
  }
}
