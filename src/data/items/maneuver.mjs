export default class ManeuverDataModel extends foundry.abstract.TypeDataModel {
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
      // Манёвр-перезарядка: заряжает выбранное перезаряжаемое оружие (loaded=true),
      // а цену ОД берёт из оружия (system.reload_cost 1-3), игнорируя ap_cost.
      // Такой манёвр не расходует боеприпас и не блокируется состоянием заряда.
      is_reload_action: new fields.BooleanField({ initial: false }),

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
      // Гейт по конкретному оружию: подстроки, ищутся в system.key И в имени
      // оружия без учёта регистра (OR по списку). Пример: ["greatsword"] пускает
      // «Адамантиновый двуручный меч» с key "adamantine_greatsword".
      req_weapon_keys: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      // Собственный сдвиг урона манёвра по Лестнице (1d4→1d6→2d4→2d6→2d8→3d6):
      // бросок урона с карточки манёвра двигает кубы оружия на N ступеней.
      // Складывается с DSL-модами dice_step. Отрицательное значение — нерф.
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
      
      skill: new fields.StringField({ initial: "", label: "Override Skill" }),
      // Вшитый бонус к броску атаки манёвра (читается в src/dice/roll.mjs наравне
      // с «Точностью» заклинаний). Для манёвров со встроенным прицеливанием
      // («Выстрел с упора») — чтобы бонус не висел статусом и не плодил сущности.
      attack_bonus: new fields.NumberField({ required: true, integer: true, initial: 0 }),
      formula_attack: new fields.StringField({ required: true, blank: true }),
      formula_damage: new fields.StringField({ required: true, blank: true }),
      formula_heal: new fields.StringField({ required: true, blank: true }),
      formula_custom: new fields.StringField({ required: true, blank: true }),
      
      save_attribute: new fields.StringField({ required: true, blank: true }),
      save_dc_formula: new fields.StringField({ initial: "", label: "Save DC Formula" }),
      forbidden_defense: new fields.StringField({ initial: "", label: "Forbidden Defense" }),
      
      hide_combat_buttons: new fields.BooleanField({ initial: false, label: "Hide Combat Buttons" }),
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
