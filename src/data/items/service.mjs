import { ITEM_RARITY_ENUM } from "../../constants.mjs";

/**
 * Услуга — нематериальный покупаемый предмет (аренда, телепорт, еда, ночлег).
 * НЕ физический: без веса, не попадает в инвентарь-перегрузку и не «носится».
 * При покупке у торговца списываются деньги, в чат падает квитанция, и, если на
 * предмете есть переносимые Active Effects, — они применяются покупателю
 * (напр. бафф от сытной еды). В инвентарь ничего не кладётся.
 */
export default class ServiceDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { HTMLField, StringField, NumberField } = foundry.data.fields;
    return {
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      key: new StringField({ required: false, initial: "" }),
      rarity: new StringField({ required: true, initial: "common", choices: ITEM_RARITY_ENUM }),
      base_price: new NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      // Свободный тег типа услуги: rental, teleport, meal, lodging, toll, ...
      service_type: new StringField({ required: false, initial: "" })
    };
  }
}
