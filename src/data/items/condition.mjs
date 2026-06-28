export default class ConditionDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      description: new fields.HTMLField({ label: "Description" }),
      category: new fields.StringField({ initial: "negative", label: "Category" }), // "negative", "neutral", "positive", "technical"
      is_technical: new fields.BooleanField({ initial: false, label: "Is Technical" }),
      stackable: new fields.BooleanField({ initial: false, label: "Stackable" }),
      max_stacks: new fields.NumberField({ initial: 1, integer: true, min: 1, label: "Max Stacks" }),
      
      duration: new fields.SchemaField({
        units: new fields.StringField({ initial: "rounds", label: "Duration Units" }), // "rounds", "turns", "seconds", "minutes", "hours", "days"
        value: new fields.NumberField({ initial: 1, integer: true, label: "Duration Value" })
      }),
      expiry_events: new fields.ArrayField(new fields.StringField(), { initial: ["turnEnd"] }),
      
      application_text: new fields.StringField({ initial: "", label: "Application Text" }),
      removal_text: new fields.StringField({ initial: "", label: "Removal Text" }),
      
      is_removable_by_skill: new fields.BooleanField({ initial: false, label: "Removable By Skill" }),
      skill_to_remove: new fields.StringField({ initial: "", label: "Skill To Remove" }),
      remove_dc: new fields.NumberField({ initial: 0, integer: true, min: 0, label: "Removal DC" }),
      
      system_flags: new fields.ObjectField({ initial: {} })
    };
  }
}
