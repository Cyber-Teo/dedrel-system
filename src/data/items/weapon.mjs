export default class WeaponDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      description: new fields.HTMLField({ label: "Description" }),
      weapon_type: new fields.StringField({ initial: "melee", label: "Type" }),
      damage_formula: new fields.StringField({ initial: "", label: "Damage" }),
      range: new fields.StringField({ initial: "", label: "Range" }),
      requirement: new fields.StringField({ initial: "", label: "Requirement" }),
      equipped: new fields.BooleanField({ initial: false, label: "Equipped" })
    };
  }
}
