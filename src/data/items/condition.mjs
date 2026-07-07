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
      // Сбрасывать таймер длительности при добавлении нового стака. По умолчанию
      // false — длительность отсчитывается от ПЕРВОГО наложения (стаки её не
      // продлевают). true — каждый новый стак обновляет таймер (см.
      // DedrelActor#addConditionStack).
      refresh_on_stack: new fields.BooleanField({ initial: false, label: "Refresh Duration On Stack" }),
      
      // Периодический эффект (тик): урон или лечение раз в ход. Формула
      // поддерживает @stacks — текущее число стаков эффекта. Исполняется
      // в бою через DedrelCombat#_onStartTurn/_onEndTurn (src/combat.mjs).
      tick: new fields.SchemaField({
        formula: new fields.StringField({ initial: "", label: "Tick Formula" }),
        is_heal: new fields.BooleanField({ initial: false, label: "Tick Heals" }), // лечение вместо урона (DR не применяется)
        damage_type: new fields.StringField({ initial: "", label: "Tick Damage Type" }), // ключ system.dr ("heat", "acid"...) или "" — без снижения
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
