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
      
      req_weapon_type: new fields.SchemaField({
        melee: new fields.BooleanField(),
        ranged: new fields.BooleanField(),
        shield: new fields.BooleanField()
      }),
      req_weapon_damage_type: new fields.SchemaField({
        piercing: new fields.BooleanField(),
        bludgeoning: new fields.BooleanField(),
        slashing: new fields.BooleanField()
      }),
      req_weapon_skill_group: new fields.StringField({ required: true, blank: true, initial: "any" }),
      req_weapon_property: new fields.SchemaField({
        is_auxiliary: new fields.BooleanField(),
        is_fast: new fields.BooleanField(),
        is_slow: new fields.BooleanField(),
        is_twohanded: new fields.BooleanField(),
        is_thrown: new fields.BooleanField(),
        is_enchanted: new fields.BooleanField(),
        is_reloading: new fields.BooleanField()
      }),
      
      prerequisites_text: new fields.StringField({ required: true, blank: true }),
      prerequisites_attributes: new fields.ArrayField(new fields.StringField()),
      prerequisites_skills: new fields.ArrayField(new fields.StringField()),
      prerequisites_talents: new fields.ArrayField(new fields.StringField()),
      prerequisites_mutations: new fields.ArrayField(new fields.StringField()),
      prerequisites_bloodlines: new fields.ArrayField(new fields.StringField()),
      
      target_type: new fields.StringField({ required: true, blank: true, initial: "creature" }),
      target_range: new fields.StringField({ required: true, blank: true, initial: "" }),
      target_value: new fields.NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      template_shape: new fields.StringField({ required: true, blank: true }),
      template_size: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      
      formula_attack: new fields.StringField({ required: true, blank: true }),
      formula_damage: new fields.StringField({ required: true, blank: true }),
      formula_custom: new fields.StringField({ required: true, blank: true }),
      
      save_attribute: new fields.StringField({ required: true, blank: true }),
      save_dc_formula: new fields.StringField({ initial: "", label: "Save DC Formula" }),
      forbidden_defense: new fields.StringField({ initial: "", label: "Forbidden Defense" }),
      
      on_use_macro: new fields.StringField({ initial: "", label: "On Use Macro" })
    };
  }
}
