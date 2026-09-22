import { physicalItemFields } from "./_physical.mjs";
import { craftingFields, migrateCraftingData } from "./_crafting.mjs";
import { ACCESSORY_SLOT_TYPES } from "../../constants.mjs";

/**
 * Магическая вещь — постоянный/перезаряжаемый предмет (жезлы, амулеты, чудесные вещи).
 * В отличие от зелий/свитков НЕ уничтожается при опустошении: заряды (uses_*)
 * разряжаются и восстанавливаются на отдыхе (по uses_per, см. character-sheet.performRest),
 * а сам предмет остаётся. Уничтожение возможно только через consumable+quantity, что
 * по умолчанию выключено (consumable: false).
 *
 * Нагрузка при использовании (как у свитка/зелья, разрешается в Item#use):
 * - spell_id / spell_key — вшитое заклинание (жезл огненного шара): каст за заряд;
 * - formula_heal — мгновенное лечение;
 * - embedded Active Effects — баффы/дебаффы (кнопка «Применить эффекты» в карточке);
 * - on_use_macro — «аварийный люк» для нестандартных срабатываний.
 */
export default class MagicItemDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      description: new fields.HTMLField({ label: "Description" }),
      key: new fields.StringField({ initial: "" }),
      // Дефолт редкости — необычный: это первая ступень, где магвещи разрешены
      // числа к броскам (15. Inventory §Лестница силы по редкости). Обычный тир
      // существует, но он про глаголы с лимитом, и его выбирают осознанно.
      ...physicalItemFields({ rarity: "uncommon" }),
      ...craftingFields(),
      // Аксессуарный слот (диадема→head, кольцо/браслет→hand, ожерелье→neck, ...)
      equip_slot: new fields.StringField({ required: false, blank: true, initial: "", choices: ACCESSORY_SLOT_TYPES }),
      stackable: new fields.BooleanField({ initial: false }),
      consumable: new fields.BooleanField({ initial: false, label: "Consumable" }),
      quantity: new fields.NumberField({ initial: 1, integer: true, label: "Quantity" }),
      // Краткое описание эффекта для игрока (в дополнение к description)
      effect_description: new fields.StringField({ required: false, initial: "" }),
      // Вшитое заклинание (жезл-кастер): spell_id — предмет на акторе/в мире/UUID;
      // spell_key — system.key для поиска в компендиуме dedrel.spells. Разрешается
      // тем же #resolveBoundSpell/#castBoundSpell, что и свиток.
      spell_id: new fields.StringField({ required: false, initial: "" }),
      spell_key: new fields.StringField({ required: false, initial: "" }),
      formula_heal: new fields.StringField({ initial: "", label: "Healing Formula" }),
      // Выдача временных хитов при использовании (число, дайсы или "N%" от макс. ХП цели)
      formula_temp_hp: new fields.StringField({ initial: "" }),
      on_use_macro: new fields.StringField({ required: false, initial: "" }),
      // Перезаряжаемые заряды: uses_max>0 включает механику (item.prepareDerivedData),
      // списание в Item#use, авто-восстановление на отдыхе по uses_per.
      // uses_per: "" | "short_rest" | "long_rest" | "day" (см. performRest).
      uses_value: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      uses_max: new fields.StringField({ required: false, initial: "" }),
      uses_per: new fields.StringField({ required: false, initial: "" }),
      requirements: new fields.SchemaField({
        text: new fields.StringField({ required: false, initial: "" }),
        attribute: new fields.SchemaField({
          key: new fields.StringField({ required: false, initial: "" }),
          rank: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
        })
      })
    };
  }

  static migrateData(source) {
    migrateCraftingData(source);
    return super.migrateData(source);
  }
}
