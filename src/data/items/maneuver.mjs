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
      // Reload maneuver: loads the selected reloadable weapon (loaded=true),
      // and takes its AP cost from the weapon (system.reload_cost 1-3), ignoring ap_cost.
      // Such a maneuver doesn't consume ammunition and isn't blocked by the load state.
      is_reload_action: new fields.BooleanField({ initial: false }),
      // Scroll-reading maneuver (16. Magic §10): the AP cost is taken from the selected
      // scroll (derived from rarity), paid with universal AP only,
      // casting and consumption happen on the scroll item. Mirrors the is_reload_action pattern.
      is_scroll_read: new fields.BooleanField({ initial: false }),

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
      // Gate on a specific weapon: substrings, searched in system.key AND in the weapon's
      // name, case-insensitive (OR across the list). Example: ["greatsword"] lets through
      // an "Adamantine Greatsword" with key "adamantine_greatsword".
      req_weapon_keys: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      // The maneuver's own damage shift on the Ladder (1d4→1d6→2d4→2d6→2d8→3d6):
      // a damage roll from the maneuver card moves the weapon's dice by N steps.
      // Adds up with dice_step DSL mods. A negative value is a nerf.
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
      // Built-in bonus to the maneuver's attack roll (read in src/dice/roll.mjs on par
      // with the spells' Accuracy). For maneuvers with built-in aiming
      // (Braced Shot) — so that the bonus doesn't hang around as a status and spawn extra entities.
      attack_bonus: new fields.NumberField({ required: true, integer: true, initial: 0 }),
      formula_attack: new fields.StringField({ required: true, blank: true }),
      formula_damage: new fields.StringField({ required: true, blank: true }),
      formula_heal: new fields.StringField({ required: true, blank: true }),
      // Grants temporary HP on use (a number, dice or "N%" of the target's max HP)
      formula_temp_hp: new fields.StringField({ required: true, blank: true }),
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
