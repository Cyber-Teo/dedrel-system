export default class CountryOfOriginData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { HTMLField, StringField, NumberField, ArrayField } = foundry.data.fields;
    return {
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      skill_points: new NumberField({ required: true, integer: true, initial: 2, min: 0 }),
      skill_list: new ArrayField(new StringField({ required: true }), { required: true, initial: [] }),
      feature_name: new StringField({ required: false, initial: "" }),
      feature_description: new HTMLField({ required: false, blank: true, initial: "" }),
      default_languages: new ArrayField(new StringField({ required: true }), { required: true, initial: [] })
    };
  }
}
