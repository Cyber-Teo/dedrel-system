export default class ArmorDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      description: new fields.HTMLField({ label: "Description" }),
      block_bonus: new fields.NumberField({ initial: 0, integer: true, label: "Block Bonus" }),
      dodge_bonus: new fields.NumberField({ initial: 0, integer: true, label: "Dodge Bonus" }),
      mdef_bonus: new fields.NumberField({ initial: 0, integer: true, label: "MDef Bonus" }),
      requirement: new fields.StringField({ initial: "", label: "Requirement" }),
      equipped: new fields.BooleanField({ initial: false, label: "Equipped" })
    };
  }
}
