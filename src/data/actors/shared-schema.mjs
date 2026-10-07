/**
 * Shared schema field builders for actors (character and npc).
 * Each function returns a FRESH field instance on every call —
 * the same DataField instance can't be reused in two schemas.
 *
 * The goal is a single source of truth for combat structures (attributes, skills,
 * defenses, DR, equipment slots), so that the NPC and the character don't diverge.
 * Calculation logic (prepareDerivedData) stays in the concrete models.
 */

/** One attribute: source rank + flat save bonus. */
export function attributeField() {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    rank: new fields.NumberField({ required: true, integer: true, initial: 1, min: 0 }),
    save_bonus: new fields.NumberField({ required: true, integer: true, initial: 0 })
  });
}

/** Array of the system's 9 attributes. */
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

/** One skill: rank, specialization, flat bonus. */
export function skillField() {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    rank: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
    specialization: new fields.StringField({ required: false, initial: "" }),
    bonus: new fields.NumberField({ required: true, integer: true, initial: 0 })
  });
}

/** Full flat skill list (combat, intellectual, practical, social). */
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
    thievery: skillField(),
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

/** Three derived defenses (values are filled in by prepareDerivedData). */
export function buildDefenses() {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    block: new fields.NumberField({ required: false, integer: true, initial: 0 }),
    dodge: new fields.NumberField({ required: false, integer: true, initial: 0 }),
    mdef: new fields.NumberField({ required: false, integer: true, initial: 0 })
  });
}

/** Damage reduction for 10 types (modified by Active Effects and armor). */
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
 * A Spell Constructor doctrine.
 * rank — source value (bought with XP; access talents give +1 via AE).
 * unlocked — access to the doctrine (granted by a talent via AE Override 1).
 * paths.<key> — purchased specialization Paths (path talent:
 *   AE system.doctrines.<doctrine>.paths.<path> | Override | 1).
 *   The switchable active_path "stance" is gone: the build carries its own path,
 *   casting only checks that the caster knows the path.
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
 * Full set of the 18 canonical doctrines (see "_rules/16. Magic.md";
 * rules — CONFIG.DEDREL.magic). Used by both the character and the NPC boss,
 * so that casting follows the same Spell Constructor rules.
 */
export function buildDoctrines() {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    // Doctrines of Matter
    geomancy: doctrineField(),
    hydromancy: doctrineField(["flow", "ice"]),
    pyromancy: doctrineField(),
    ventomancy: doctrineField(["squall", "echo"]),
    // Doctrines of Essence
    biomancy: doctrineField(["mending", "sculpting"]),
    shadowmancy: doctrineField(),
    aetheromancy: doctrineField(),
    // Doctrines of the Boundless
    electromancy: doctrineField(),
    temporalmancy: doctrineField(),
    astralomancy: doctrineField(),
    aether_song: doctrineField(),
    // Innate Magic
    blood_magic: doctrineField(),
    chaos_magic: doctrineField(),
    shapeshifting: doctrineField(),
    feral_magic: doctrineField(),
    // Psionics
    telekinesis: doctrineField(),
    telepathy: doctrineField(),
    zero: doctrineField()
  });
}

/**
 * Known Magic Techniques (granted by talents via AE; read by the constructor).
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

/** One equipment slot: item reference + expected type. */
function slot(type = "") {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    item_id: new fields.StringField({ initial: "" }),
    type: new fields.StringField({ initial: type })
  });
}

/** Equipment slots: hands, armor by layer, magic items, ammunition, accessories. */
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

    // Accessory slots (see character.mjs): head/neck/torso + rings/bracelets.
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
