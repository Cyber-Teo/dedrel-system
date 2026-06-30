export default class CurrencyData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { HTMLField, StringField, NumberField, ObjectField } = foundry.data.fields;
    return {
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      weight: new NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      base_price: new NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      denomination: new StringField({ required: true, nullable: false, initial: "copper" }),
      value: new NumberField({ required: true, integer: true, initial: 0 }),
      weight_per_unit: new NumberField({ required: true, nullable: false, initial: 0.01, min: 0 }),
      exchange_rate_modifiers: new ObjectField({ required: false, initial: {} }),
      properties: new ObjectField({ required: false, initial: {} })
    };
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    // Вычисляем финальный вес пачки монет на основании количества и веса за единицу
    this.weight = this.value * this.weight_per_unit;
  }
}
