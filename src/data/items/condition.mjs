export default class ConditionDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      description: new fields.HTMLField({ label: "Description" }),
      key: new fields.StringField({ initial: "" }),
      category: new fields.StringField({ initial: "negative", label: "Category" }), // "negative", "neutral", "positive", "technical"
      is_technical: new fields.BooleanField({ initial: false, label: "Is Technical" }),
      stackable: new fields.BooleanField({ initial: false, label: "Stackable" }),
      max_stacks: new fields.NumberField({ initial: 1, integer: true, min: 1, label: "Max Stacks" }),
      // Reset the duration timer when a new stack is added. Default
      // false — the duration counts from the FIRST application (stacks don't
      // extend it). true — every new stack refreshes the timer (see
      // DedrelActor#addConditionStack).
      refresh_on_stack: new fields.BooleanField({ initial: false, label: "Refresh Duration On Stack" }),
      
      // Periodic effect (tick): damage or healing once per turn. The formula
      // supports @stacks — the effect's current stack count. Executed
      // in combat via DedrelCombat#_onStartTurn/_onEndTurn (src/combat.mjs).
      tick: new fields.SchemaField({
        formula: new fields.StringField({ initial: "", label: "Tick Formula" }),
        is_heal: new fields.BooleanField({ initial: false, label: "Tick Heals" }), // healing instead of damage (DR doesn't apply)
        damage_type: new fields.StringField({ initial: "", label: "Tick Damage Type" }), // system.dr key ("heat", "acid"...) or "" — no reduction
        trigger: new fields.StringField({ initial: "turnStart", label: "Tick Trigger" }) // "turnStart" | "turnEnd"
      }),

      duration: new fields.SchemaField({
        units: new fields.StringField({ initial: "rounds", label: "Duration Units" }), // "rounds", "turns", "seconds", "minutes", "hours", "days"
        value: new fields.NumberField({ initial: 1, integer: true, label: "Duration Value" })
      }),
      expiry_events: new fields.ArrayField(new fields.StringField(), { initial: ["turnEnd"] }),
      
      application_text: new fields.StringField({ initial: "", label: "Application Text" }),
      removal_text: new fields.StringField({ initial: "", label: "Removal Text" }),
      
      system_flags: new fields.ObjectField({ initial: {} })
    };
  }
}
