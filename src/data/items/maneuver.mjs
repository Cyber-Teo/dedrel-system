export default class ManeuverDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      description: new fields.HTMLField({ label: "Description" }),
      source: new fields.StringField({ required: true, blank: true, initial: "basic" }),
      action_type: new fields.ArrayField(new fields.StringField()),
      chain_trigger_text: new fields.StringField({ required: true, blank: true }),
      chain_trigger_maneuvers: new fields.ArrayField(new fields.StringField()),
      
      ap_cost: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      is_variable_cost: new fields.BooleanField({ initial: false }),
      variable_cost_max: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      
      uses_value: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      uses_max: new fields.StringField({ required: true, blank: true, initial: "0" }),
      uses_per: new fields.StringField({ required: true, blank: true }),
      
      req_weapon_type: new fields.StringField({ required: true, blank: true, initial: "any" }),
      req_weapon_damage_type: new fields.StringField({ required: true, blank: true, initial: "any" }),
      req_weapon_skill_group: new fields.StringField({ required: true, blank: true, initial: "any" }),
      req_weapon_property: new fields.StringField({ required: true, blank: true }),
      
      prerequisites_text: new fields.StringField({ required: true, blank: true }),
      prerequisites_attributes: new fields.ArrayField(new fields.StringField()),
      prerequisites_skills: new fields.ArrayField(new fields.StringField()),
      prerequisites_talents: new fields.ArrayField(new fields.StringField()),
      prerequisites_mutations: new fields.ArrayField(new fields.StringField()),
      prerequisites_bloodlines: new fields.ArrayField(new fields.StringField()),
      
      target_type: new fields.StringField({ required: true, blank: true, initial: "creature" }),
      target_range: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      target_value: new fields.NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      template_shape: new fields.StringField({ required: true, blank: true }),
      template_size: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      
      formula_attack: new fields.StringField({ required: true, blank: true }),
      formula_damage: new fields.StringField({ required: true, blank: true }),
      formula_custom: new fields.StringField({ required: true, blank: true }),
      
      save_attribute: new fields.StringField({ required: true, blank: true }),
      save_dc_formula: new fields.StringField({ required: true, blank: true }),
      forbidden_defense: new fields.StringField({ required: true, blank: true })
    };
  }
}
