export default class TalentDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      description: new fields.HTMLField({ label: "Description" }),
      subtype: new fields.StringField({ initial: "passive", label: "Subtype" }),
      xp_cost: new fields.NumberField({ initial: 0, integer: true, min: 0, label: "XP Cost" }),
      
      prerequisites_text: new fields.StringField({ initial: "", label: "Prerequisites Text" }),
      prerequisites_attributes: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      prerequisites_skills: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      prerequisites_talents: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      prerequisites_mutations: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      prerequisites_bloodlines: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      
      uses_value: new fields.NumberField({ initial: 0, integer: true, min: 0, label: "Current Uses" }),
      uses_max: new fields.NumberField({ initial: 0, integer: true, min: 0, label: "Max Uses" }),
      uses_per: new fields.StringField({ initial: "", label: "Uses Per" }),
      
      adds_maneuvers: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      on_add_macro: new fields.StringField({ initial: "", label: "On Add Macro" })
    };
  }
}
