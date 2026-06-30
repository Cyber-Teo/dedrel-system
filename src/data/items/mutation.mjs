export default class MutationDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      description: new fields.HTMLField({ label: "Description" }),
      key: new fields.StringField({ initial: "", label: "System Key" }),
      
      mutation_type: new fields.StringField({ initial: "useful", label: "Mutation Type" }),
      starting: new fields.BooleanField({ initial: false, label: "Starting" }),
      
      subtype: new fields.StringField({ initial: "passive", label: "Subtype" }),
      xp_cost: new fields.NumberField({ initial: 0, integer: true, min: 0, label: "XP Cost" }),
      
      situational_bonus: new fields.NumberField({ initial: 0, integer: true, label: "Situational Bonus" }),
      situational_trigger: new fields.StringField({ initial: "", label: "Situational Trigger" }),
      
      prerequisites_text: new fields.StringField({ initial: "", label: "Prerequisites Text" }),
      prerequisites_attributes: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      prerequisites_skills: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      prerequisites_talents: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      prerequisites_mutations: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      prerequisites_bloodlines: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      
      uses_value: new fields.NumberField({ initial: 0, integer: true, min: 0, label: "Current Uses" }),
      uses_max: new fields.StringField({ initial: "", label: "Max Uses" }),
      uses_per: new fields.StringField({ initial: "", label: "Uses Per" }),
      
      adds_items: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      on_add_macro: new fields.StringField({ initial: "", label: "On Add Macro" })
    };
  }
}
