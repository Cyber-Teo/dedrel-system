export default class MutationDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      description: new fields.HTMLField({ label: "Description" }),
      prerequisite: new fields.StringField({ required: true, blank: true, label: "Prerequisites" })
    };
  }
}
