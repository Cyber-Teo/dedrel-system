import { CRAFT_DISCIPLINE_ENUM } from "../../constants.mjs";

/**
 * Общий блок «чертежа» — данные крафта, встроенные прямо в предмет-продукт
 * (см. CRAFT_IMPLEMENTATION_PLAN.md §2.1). Спредится в defineSchema() всех
 * «физических» типов предметов рядом с physicalItemFields().
 *
 * Item type `recipe` («знание рецепта» у персонажа) — тонкая ссылка на продукт
 * и ГЕНЕРИРУЕТСЯ макросом из этих данных; вручную состав нигде не дублируется.
 *
 * cost_price (себестоимость) не редактируется руками: её запекает пересчёт
 * цены (кнопка на листе / макрос «Пересчёт экономики»), формула:
 *   cost_price  = Σ(base_price ингредиента × amount)
 *   base_price  = cost_price × (1 + markup_pct/100)
 *
 * @returns {object} Объект полей для спреда в defineSchema().
 */
export function craftingFields() {
  const { SchemaField, StringField, NumberField, BooleanField, ArrayField } = foundry.data.fields;
  return {
    crafting: new SchemaField({
      // Создаётся ли предмет крафтом вообще (гейт для генерации рецептов и цен)
      craftable: new BooleanField({ required: true, initial: false }),
      // Функциональное ремесло (пусто = не задано)
      discipline: new StringField({ required: true, blank: true, initial: "", choices: ["", ...CRAFT_DISCIPLINE_ENUM] }),
      // Состав: uuid храним компендиумный, name — человекочитаемый fallback
      // (при переносе предмета на актора UUID меняются, см. план §3.3)
      ingredients: new ArrayField(new SchemaField({
        uuid: new StringField({ required: true, blank: true, initial: "" }),
        name: new StringField({ required: true, blank: true, initial: "" }),
        amount: new NumberField({ required: true, nullable: false, initial: 1, min: 0 })
      })),
      // Наценка в % к себестоимости
      markup_pct: new NumberField({ required: true, nullable: false, initial: 50, min: 0 }),
      // Себестоимость — запекается пересчётом, вручную не правится
      cost_price: new NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      // Сколько единиц продукта даёт один цикл крафта (3 склянки зелья и т.п.)
      output_quantity: new NumberField({ required: true, nullable: false, integer: true, initial: 1, min: 1 }),
      // Явное время в часах; 0 = стандартное время по редкости (таблица 1.1)
      time_override: new NumberField({ required: true, nullable: false, initial: 0, min: 0 })
    })
  };
}

/**
 * Миграция легаси-данных блока crafting. Вызывать из static migrateData(source)
 * КАЖДОЙ модели, спредящей craftingFields(): choices-валидация дисциплины
 * выполняется до подготовки данных, и устаревшее значение роняет инициализацию
 * всего предмета (Failed to initialize Item).
 */
export function migrateCraftingData(source) {
  // Дисциплина "Ткачество" переименована в "Шитьё" (2026-07-16): weaving → tailoring.
  if (source.crafting?.discipline === "weaving") source.crafting.discipline = "tailoring";
}
