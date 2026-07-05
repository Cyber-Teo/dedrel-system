const { HTMLField, NumberField, StringField, SchemaField, BooleanField, ArrayField, ObjectField } = foundry.data.fields;

export default class ExpData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new HTMLField({ required: true, blank: true }),
      key: new StringField({ required: false, initial: "" }),
      value: new NumberField({ required: true, initial: 10, integer: true })
    };
  }
}
