import { physicalItemFields } from "./_physical.mjs";
import { craftingFields, migrateCraftingData } from "./_crafting.mjs";
import { MATERIAL_CLASS_ENUM, SLOT_TIER_ENUM } from "../../constants.mjs";

/**
 * Ремесленный материал — сырьё для крафта/починки. Измеряется в «мерах»
 * (quantity). Восемь классов (material_class) — из правил крафта
 * (craft/New Craft.md): семь сырьевых плюс "processed" (обработанные). Блок
 * crafting тоже подключён: обработанные материалы (слитки из руды, кожа из шкур,
 * чернила, бумага, склянки) сами являются продуктами крафта.
 *
 * Грамматика материала после реворка 2026-07-15 (craft/Armor Rework Plan.md §2) —
 * четыре фиксированные оси, одинаковые у всех материалов:
 *   rarity        — качество (tier), из physicalItemFields;
 *   slots         — магоёмкость: список тиров слотов улучшений;
 *   weight_class  — вес/хват;
 *   signature     — ОДНА качественная штука, отдельно для брони/оружия/магии.
 *
 * Плоского «+N ко всему» материал не даёт: прежний grants[].bonus снят, мощность
 * живёт в лекалах и слотах. Источник истины по значениям — tables/materials.csv.
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
      // Канонический класс материала (8 типов из правил крафта; processed —
      // обработанные, продукты крафта: у них нет сигнатур, слотов и применимости)
      material_class: new StringField({ required: true, initial: "metal", choices: MATERIAL_CLASS_ENUM }),
      // Текст особых свойств (вес −50%, урон нежити и т.п.)
      special_rules: new StringField({ required: false, blank: true, initial: "" }),
      // Вес/хват — ось §2. Пока свободный текст (normal/heavy/light): механика
      // сдвига весового класса не зафиксирована, привязываться к enum рано.
      weight_class: new StringField({ required: false, blank: true, initial: "normal" }),
      // Магоёмкость: по одной записи на слот, значение — тир (лесенка §6
      // белый/зелёный/синий/фиолетовый). Пустой массив = «магию не держит».
      slots: new ArrayField(new StringField({ choices: SLOT_TIER_ENUM })),
      // Сигнатура — по одной на область применения, свободный текст.
      signature: new SchemaField({
        armor: new StringField({ required: false, blank: true, initial: "" }),
        weapon: new StringField({ required: false, blank: true, initial: "" }),
        magic: new StringField({ required: false, blank: true, initial: "" })
      }),
      // К каким изделиям материал применим как ОСНОВНОЙ (для лекал оружия/брони)
      applicable_to: new SchemaField({
        weapon: new BooleanField({ required: true, initial: false }),
        armor: new BooleanField({ required: true, initial: false }),
        shield: new BooleanField({ required: true, initial: false }),
        jewelry: new BooleanField({ required: true, initial: false })
      })
    };
  }

  static migrateData(source) {
    // Легаси-теги material_type → канонический material_class.
    if (!source.material_class && source.material_type) {
      const map = {
        ore: "metal", herb: "herb", wood: "wood", skin: "leather", cloth: "cloth",
        processed: "processed", crafted: "processed"
      };
      if (map[source.material_type]) source.material_class = map[source.material_type];
    }
    // Легаси-grants (варианты «+1 И слот ИЛИ слот») → плоская магоёмкость.
    // Бонус отбрасываем осознанно: плоского +N в новой грамматике нет. Из
    // вариантов берём первый непустой — выбор произвольный, поэтому значения
    // всё равно перезаписывает макрос «Реворк материалов» из materials.csv.
    if (!source.slots && Array.isArray(source.grants)) {
      const withSlots = source.grants.find(g => g?.slots?.length);
      source.slots = withSlots ? [...withSlots.slots] : [];
    }
    migrateCraftingData(source);
    return super.migrateData(source);
  }
}
