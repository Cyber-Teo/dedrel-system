export default class MutilationData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { HTMLField, ArrayField, ObjectField } = foundry.data.fields;
    return {
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      changes: new ArrayField(new ObjectField({ required: true }), { required: true, initial: [] })
    };
  }
}
