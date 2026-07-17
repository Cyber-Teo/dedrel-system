export default class SpellDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      description: new fields.HTMLField({ label: "Description" }),
      key: new fields.StringField({ initial: "", label: "System Key" }),
      source: new fields.StringField({ required: true, blank: true, initial: "basic" }),
      action_type: new fields.SchemaField({
        action: new fields.BooleanField(),
        reaction: new fields.BooleanField(),
        free: new fields.BooleanField(),
        chain: new fields.BooleanField()
      }),
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
        shield: new fields.BooleanField(),
        magic: new fields.BooleanField()
      }),
      req_weapon_damage_type: new fields.SchemaField({
        piercing: new fields.BooleanField(),
        bludgeoning: new fields.BooleanField(),
        slashing: new fields.BooleanField()
      }),
      req_weapon_skill_group: new fields.StringField({ required: true, blank: true, initial: "any" }),
      // Гейт по конкретному оружию (подстроки key/имени, OR) — как у манёвров.
      req_weapon_keys: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      // Собственный сдвиг урона по Лестнице кубов — как у манёвров.
      weapon_dice_step: new fields.NumberField({ required: true, integer: true, initial: 0 }),
      req_weapon_property: new fields.SchemaField({
        is_auxiliary: new fields.BooleanField(),
        is_fast: new fields.BooleanField(),
        is_slow: new fields.BooleanField(),
        is_twohanded: new fields.BooleanField(),
        is_thrown: new fields.BooleanField(),
        is_reloading: new fields.BooleanField(),
        is_variable_grip: new fields.BooleanField(),
        is_paired: new fields.BooleanField()
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

      // === Магический Конструктор: исходник сборки ===
      // Заполняется Конструктором (SpellConstructorApp); используется для
      // пере-открытия сборки в конструкторе и ре-валидации при касте.
      // Справочники ключей: CONFIG.DEDREL.magic (src/config/magic.mjs).
      doctrine: new fields.StringField({ required: true, blank: true, initial: "", label: "Doctrine Key" }),
      doctrine_rank_req: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0, max: 6 }),
      doctrine_path: new fields.StringField({ required: true, blank: true, initial: "" }),
      source_scale: new fields.StringField({ required: true, blank: true, initial: "none" }), // none | any | abundant
      chosen_techniques: new fields.ArrayField(new fields.StringField()),
      chosen_modifiers: new fields.ArrayField(new fields.SchemaField({
        key: new fields.StringField({ required: true, blank: false }),   // ключ модификатора
        rank: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1, max: 5 }),
        ap: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }), // цена ПОСЛЕ сродств
        option: new fields.StringField({ required: false, blank: true, initial: "" })      // выбор внутри ранга: "bonus"/"penalty"/ключ состояния
      })),
      total_cost_breakdown: new fields.StringField({ required: true, blank: true, initial: "" }),

      // === Магический Конструктор: скомпилированные исполняемые поля ===
      // skill — навык броска атаки (конструктор ставит "magical_attacks");
      // attack_bonus — Модификатор "Точность", добавляется к броску атаки в chat.mjs.
      skill: new fields.StringField({ initial: "", label: "Override Skill" }),
      attack_bonus: new fields.NumberField({ required: true, integer: true, initial: 0 }),

      formula_attack: new fields.StringField({ required: true, blank: true }),
      formula_damage: new fields.StringField({ required: true, blank: true }),
      formula_heal: new fields.StringField({ required: true, blank: true }),
      // Выдача временных хитов при использовании (число, дайсы или "N%" от макс. ХП цели)
      formula_temp_hp: new fields.StringField({ required: true, blank: true }),
      formula_custom: new fields.StringField({ required: true, blank: true }),
      
      save_attribute: new fields.StringField({ required: true, blank: true }),
      save_dc_formula: new fields.StringField({ initial: "", label: "Save DC Formula" }),
      forbidden_defense: new fields.StringField({ initial: "", label: "Forbidden Defense" }),
      
      on_use_macro: new fields.StringField({ initial: "", label: "On Use Macro" })
    };
  }

  static migrateData(source) {
    if (Array.isArray(source.action_type)) {
      const arr = source.action_type;
      source.action_type = {
        action: arr.includes("action"),
        reaction: arr.includes("reaction"),
        free: arr.includes("free"),
        chain: arr.includes("chain")
      };
    }
    return super.migrateData(source);
  }
}
