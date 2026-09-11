/**
 * Общие построители полей схемы для актёров (character и npc).
 * Каждая функция возвращает СВЕЖИЙ экземпляр поля при каждом вызове —
 * один и тот же экземпляр DataField нельзя переиспользовать в двух схемах.
 *
 * Цель — единый источник правды для боевых структур (атрибуты, навыки,
 * защиты, DR, слоты экипировки), чтобы NPC и персонаж не расходились.
 * Логика расчётов (prepareDerivedData) остаётся в конкретных моделях.
 */

/** Один атрибут: source-ранг + плоский бонус к сейву. */
export function attributeField() {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    rank: new fields.NumberField({ required: true, integer: true, initial: 1, min: 0 }),
    save_bonus: new fields.NumberField({ required: true, integer: true, initial: 0 })
  });
}

/** Массив из 9 атрибутов системы. */
export function buildAttributes() {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    int: attributeField(),
    dex: attributeField(),
    log: attributeField(),
    rea: attributeField(),
    str: attributeField(),
    will: attributeField(),
    con: attributeField(),
    luck: attributeField(),
    cha: attributeField()
  });
}

/** Один навык: ранг, специализация, плоский бонус. */
export function skillField() {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    rank: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
    specialization: new fields.StringField({ required: false, initial: "" }),
    bonus: new fields.NumberField({ required: true, integer: true, initial: 0 })
  });
}

/** Полный плоский список навыков (боевые, интеллект, практика, социалка). */
export function buildSkills() {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    // Combat
    crossbows: skillField(),
    unarmed_combat: skillField(),
    pole_weapons: skillField(),
    blunt_weapons: skillField(),
    artillery: skillField(),
    firearms: skillField(),
    throwing: skillField(),
    exotic_weapons: skillField(),
    magical_attacks: skillField(),
    bows: skillField(),
    bladed_weapons: skillField(),
    armor_use: skillField(),
    // Intellectual
    cultural_awareness: skillField(),
    knowledge: skillField(),
    logic_reasoning: skillField(),
    interpretation: skillField(),
    research: skillField(),
    // Practical
    craftsmanship: skillField(),
    stealth: skillField(),
    healing: skillField(),
    survival: skillField(),
    engineering: skillField(),
    atletism: skillField(),
    perception: skillField(),
    // Social
    persuasion: skillField(),
    insight: skillField(),
    deception: skillField(),
    intimidation: skillField(),
    performance: skillField()
  });
}

/** Три производные защиты (значения дописываются в prepareDerivedData). */
export function buildDefenses() {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    block: new fields.NumberField({ required: false, integer: true, initial: 0 }),
    dodge: new fields.NumberField({ required: false, integer: true, initial: 0 }),
    mdef: new fields.NumberField({ required: false, integer: true, initial: 0 })
  });
}

/** Снижение урона по 10 типам (модифицируется Active Effects и бронёй). */
export function buildDR() {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    slashing: new fields.NumberField({ required: false, integer: true, initial: 0 }),
    piercing: new fields.NumberField({ required: false, integer: true, initial: 0 }),
    bludgeoning: new fields.NumberField({ required: false, integer: true, initial: 0 }),
    heat: new fields.NumberField({ required: false, integer: true, initial: 0 }),
    cold: new fields.NumberField({ required: false, integer: true, initial: 0 }),
    necrotic: new fields.NumberField({ required: false, integer: true, initial: 0 }),
    radiant: new fields.NumberField({ required: false, integer: true, initial: 0 }),
    electric: new fields.NumberField({ required: false, integer: true, initial: 0 }),
    sonic: new fields.NumberField({ required: false, integer: true, initial: 0 }),
    acid: new fields.NumberField({ required: false, integer: true, initial: 0 })
  });
}

/**
 * Доктрина Магического Конструктора.
 * rank — source-значение (покупается за XP; таланты доступа дают +1 через AE).
 * unlocked — доступ к доктрине (выдаётся талантом через AE Override 1).
 * paths.<key> — купленные Пути-специализации (талант пути:
 *   AE system.doctrines.<doctrine>.paths.<path> | Override | 1).
 *   Переключаемой "стойки" active_path больше нет: сборка сама несёт путь,
 *   при касте проверяется лишь то, что путь известен магу.
 */
function doctrineField(pathKeys = []) {
  const fields = foundry.data.fields;
  const schema = {
    rank: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0, max: 6 }),
    unlocked: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
  };
  if (pathKeys.length) {
    const paths = {};
    for (const p of pathKeys) {
      paths[p] = new fields.NumberField({ required: false, integer: true, initial: 0, min: 0 });
    }
    schema.paths = new fields.SchemaField(paths);
  }
  return new fields.SchemaField(schema);
}

/**
 * Полный набор из 18 канонических доктрин (см. "_rules/16. Magic.md";
 * правила — CONFIG.DEDREL.magic). Используется и персонажем, и NPC-боссом,
 * чтобы каст шёл по одним и тем же правилам Магического Конструктора.
 */
export function buildDoctrines() {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    // Доктрины Материи
    geomancy: doctrineField(),
    hydromancy: doctrineField(["flow", "ice"]),
    pyromancy: doctrineField(),
    ventomancy: doctrineField(["squall", "echo"]),
    // Доктрины Сущности
    biomancy: doctrineField(["mending", "sculpting"]),
    shadowmancy: doctrineField(),
    aetheromancy: doctrineField(),
    // Доктрины Беспредельного
    electromancy: doctrineField(),
    temporalmancy: doctrineField(),
    astralomancy: doctrineField(),
    aether_song: doctrineField(),
    // Врождённая магия
    blood_magic: doctrineField(),
    chaos_magic: doctrineField(),
    shapeshifting: doctrineField(),
    feral_magic: doctrineField(),
    // Псионика
    telekinesis: doctrineField(),
    telepathy: doctrineField(),
    zero: doctrineField()
  });
}

/**
 * Известные Магические Техники (выдаются талантами через AE; читает конструктор).
 */
export function buildMagic() {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    techniques: new fields.SchemaField({
      create: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      move: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      transform: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      sense: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      imbue: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
    })
  });
}

/** Один слот экипировки: ссылка на предмет + ожидаемый тип. */
function slot(type = "") {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    item_id: new fields.StringField({ initial: "" }),
    type: new fields.StringField({ initial: type })
  });
}

/** Слоты экипировки: руки, броня послойно, магпредметы, боеприпас, аксессуары. */
export function buildEquipmentSlots() {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    main_hand: slot("weapon"),
    off_hand: slot("shield"),
    tail: slot(""),
    armor_upper: slot("armor"),
    armor_middle: slot("armor"),
    armor_lower: slot("armor"),
    magic_item_1: slot("magic_item"),
    magic_item_2: slot("magic_item"),
    ammo: slot("loot"),

    // Слоты аксессуаров (см. character.mjs): голова/шея/торс + кольца/браслеты.
    head: slot("head"),
    neck: slot("neck"),
    torso: slot("torso"),
    acc_left_1: slot("hand"),
    acc_left_2: slot("hand"),
    acc_right_1: slot("hand"),
    acc_right_2: slot("hand"),
    acc_tail: slot("hand")
  });
}
