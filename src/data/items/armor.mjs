export default class ArmorDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      description: new fields.HTMLField({ label: "Description" }),
      key: new fields.StringField({ initial: "" }),
      rarity: new fields.StringField({ initial: "common", choices: ["common", "uncommon", "rare", "very rare", "legendary"] }),
      base_price: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      weight: new fields.NumberField({ initial: 0, min: 0 }),
      slot: new fields.StringField({ initial: "middle", choices: ["lower", "middle", "upper", "universal"] }),
      weight_class: new fields.StringField({ initial: "light", choices: ["light", "medium", "heavy"] }),
      
      dr: new fields.SchemaField({
        slashing: new fields.NumberField({ initial: 0, integer: true }),
        piercing: new fields.NumberField({ initial: 0, integer: true }),
        bludgeoning: new fields.NumberField({ initial: 0, integer: true }),
        heat: new fields.NumberField({ initial: 0, integer: true }),
        cold: new fields.NumberField({ initial: 0, integer: true }),
        necrotic: new fields.NumberField({ initial: 0, integer: true }),
        radiant: new fields.NumberField({ initial: 0, integer: true }),
        electric: new fields.NumberField({ initial: 0, integer: true }),
        sonic: new fields.NumberField({ initial: 0, integer: true }),
        acid: new fields.NumberField({ initial: 0, integer: true })
      }),
      
      modifiers: new fields.SchemaField({
        dodge: new fields.NumberField({ initial: 0, integer: true }),
        block: new fields.NumberField({ initial: 0, integer: true }),
        stealth: new fields.NumberField({ initial: 0, integer: true }),
        ranged_attack: new fields.NumberField({ initial: 0, integer: true }),
        magic_attack: new fields.NumberField({ initial: 0, integer: true }),
        movement: new fields.NumberField({ initial: 0, integer: true })
      }),
      
      properties: new fields.SchemaField({
        exclusive_slot: new fields.BooleanField({ initial: false }),
        rigid: new fields.BooleanField({ initial: false }),
        loud: new fields.BooleanField({ initial: false }),
        encumbering: new fields.BooleanField({ initial: false }),
        weak_point_protection: new fields.BooleanField({ initial: false })
      }),

      // Заряды и макросы (добавлено для поддержки магических свойств, особенностей и эффектов)
      uses_value: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      uses_max: new fields.StringField({ initial: "" }),
      uses_per: new fields.StringField({ initial: "" }),
      on_use_macro: new fields.StringField({ initial: "" }),

      prerequisites_text: new fields.StringField({ initial: "" }),
      prerequisites_attributes: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      prerequisites_skills: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      prerequisites_talents: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      prerequisites_mutations: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      prerequisites_bloodlines: new fields.ArrayField(new fields.StringField(), { initial: [] }),

      equipped: new fields.BooleanField({ initial: false })
    };
  }
}
