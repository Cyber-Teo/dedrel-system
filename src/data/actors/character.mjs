/**
 * Модель данных (Data Model) для главного героя (персонажа) в системе Dedrel.
 * Определяет структуру всех базовых параметров (Атрибуты, Навыки, Ресурсы)
 * и содержит логику для расчета производных (Derived) характеристик.
 */
export default class CharacterDataModel extends foundry.abstract.TypeDataModel {
  /**
   * Определяет схему данных (Data Schema) для сущности "character".
   * Возвращает объект с полями, которые будут сохранены в базе данных Foundry.
   */
  static defineSchema() {
    const fields = foundry.data.fields;
    
    // Helper to generate attribute schema
    const attributeField = () => new fields.SchemaField({
      rank: new fields.NumberField({ required: true, integer: true, initial: 1, min: 0 })
    });

    // Helper to generate skill schema
    const skillField = () => new fields.SchemaField({
      rank: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      specialization: new fields.StringField({ required: false, initial: "" })
    });

    return {
      bloodlines: new fields.SchemaField({
        human: attributeField(),
        demon: attributeField(),
        dragon: attributeField(),
        fay: attributeField(),
        elf: attributeField()
      }),
      attributes: new fields.SchemaField({
        int: attributeField(),
        dex: attributeField(),
        log: attributeField(),
        rea: attributeField(),
        str: attributeField(),
        will: attributeField(),
        con: attributeField(),
        luck: attributeField(),
        cha: attributeField()
      }),
      
      skills: new fields.SchemaField({
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
        // Social
        persuasion: skillField(),
        insight: skillField(),
        deception: skillField(),
        intimidation: skillField(),
        performance: skillField()
      }),

      resources: new fields.SchemaField({
        hp: new fields.SchemaField({
          value: new fields.NumberField({ required: true, integer: true, initial: 10, min: 0 }),
          temp: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
          max: new fields.NumberField({ required: false, integer: true, initial: 10 }) // Derived
        }),
        wounds: new fields.SchemaField({
          level: new fields.NumberField({ required: false, integer: true, initial: 1 }), // Derived
          penalty: new fields.NumberField({ required: false, integer: true, initial: 0 }) // Derived
        }),
        ap_universal: new fields.SchemaField({
          max: new fields.NumberField({ required: false, integer: true, initial: 0 }), // Derived
          value: new fields.NumberField({ required: true, integer: true, initial: 0 })
        }),
        ap_maneuver: new fields.SchemaField({
          max: new fields.NumberField({ required: false, integer: true, initial: 0 }), // Derived
          value: new fields.NumberField({ required: true, integer: true, initial: 0 })
        }),
        ap_magic: new fields.SchemaField({
          max: new fields.NumberField({ required: false, integer: true, initial: 0 }), // Derived
          value: new fields.NumberField({ required: true, integer: true, initial: 0 })
        }),
        luck_points: new fields.SchemaField({
          max: new fields.NumberField({ required: false, integer: true, initial: 0 }), // Derived
          value: new fields.NumberField({ required: true, integer: true, initial: 0 })
        }),
        movement: new fields.SchemaField({
          max: new fields.NumberField({ required: false, integer: true, initial: 0 }), // Derived
          value: new fields.NumberField({ required: true, integer: true, initial: 0 })
        })
      }),

      defenses: new fields.SchemaField({
        block: new fields.NumberField({ required: false, integer: true, initial: 0 }), // Derived
        dodge: new fields.NumberField({ required: false, integer: true, initial: 0 }), // Derived
        mdef: new fields.NumberField({ required: false, integer: true, initial: 0 }) // Derived
      }),

      equipment_slots: new fields.SchemaField({
        main_hand: new fields.SchemaField({ item_id: new fields.StringField({ initial: "" }), type: new fields.StringField({ initial: "weapon" }) }),
        off_hand: new fields.SchemaField({ item_id: new fields.StringField({ initial: "" }), type: new fields.StringField({ initial: "shield" }) }),
        tail: new fields.SchemaField({ item_id: new fields.StringField({ initial: "" }), type: new fields.StringField({ initial: "" }) }),
        armor_upper: new fields.SchemaField({ item_id: new fields.StringField({ initial: "" }), type: new fields.StringField({ initial: "armor" }) }),
        armor_middle: new fields.SchemaField({ item_id: new fields.StringField({ initial: "" }), type: new fields.StringField({ initial: "armor" }) }),
        armor_lower: new fields.SchemaField({ item_id: new fields.StringField({ initial: "" }), type: new fields.StringField({ initial: "armor" }) }),
        magic_item_1: new fields.SchemaField({ item_id: new fields.StringField({ initial: "" }), type: new fields.StringField({ initial: "magic_item" }) }),
        magic_item_2: new fields.SchemaField({ item_id: new fields.StringField({ initial: "" }), type: new fields.StringField({ initial: "magic_item" }) }),
        ammo: new fields.SchemaField({ item_id: new fields.StringField({ initial: "" }), type: new fields.StringField({ initial: "loot" }) })
      }),

      initiative: new fields.NumberField({ required: false, integer: true, initial: 0 }), // Derived
      
      details: new fields.SchemaField({
        xp: new fields.NumberField({ required: true, integer: true, initial: 0 }),
        level: new fields.NumberField({ required: true, integer: true, initial: 1 }),
        biography: new fields.HTMLField({ required: false, blank: true, initial: "" })
      })
    };
  }

  /**
   * Метод жизненного цикла DataModel (Foundry VTT).
   * Вызывается каждый раз при инициализации документа (при загрузке или обновлении данных).
   * Здесь мы рассчитываем все вторичные (производные) характеристики,
   * такие как Максимум ХП, Блок, Уворот, Инициатива, исходя из базовых атрибутов.
   */
  prepareDerivedData() {
    super.prepareDerivedData();
    const attrs = this.attributes;
    const res = this.resources;
    const def = this.defenses;

    // HP Max
    res.hp.max = Math.ceil((attrs.con.rank + attrs.will.rank / 2) * 10);

    // Wounds
    const hpPercent = (res.hp.value / res.hp.max) * 100;
    if (hpPercent > 75) {
      res.wounds.level = 1;
      res.wounds.penalty = 0;
    } else if (hpPercent > 50) {
      res.wounds.level = 2;
      res.wounds.penalty = -1;
    } else if (hpPercent > 25) {
      res.wounds.level = 3;
      res.wounds.penalty = -3;
    } else {
      res.wounds.level = 4;
      res.wounds.penalty = -5;
    }

    // Luck Points Max
    res.luck_points.max = attrs.luck.rank;

    // AP Universal
    const maxConWill = Math.max(attrs.con.rank, attrs.will.rank);
    const minConWill = Math.min(attrs.con.rank, attrs.will.rank);
    const baseUniv = maxConWill > 1 ? 1 : 0;
    res.ap_universal.max = baseUniv + Math.ceil((maxConWill + minConWill / 2) / 2);

    // AP Maneuver
    const maxManeuver = Math.max(attrs.str.rank, attrs.dex.rank, attrs.rea.rank);
    const baseManeuver = maxManeuver > 1 ? 1 : 0;
    res.ap_maneuver.max = baseManeuver + Math.ceil(maxManeuver / 2);

    // AP Magic
    const maxMagic = Math.max(attrs.log.rank, attrs.int.rank);
    const baseMagic = maxMagic > 1 ? 1 : 0;
    res.ap_magic.max = baseMagic + Math.ceil(maxMagic / 2);

    // Defenses
    def.block = Math.floor(attrs.str.rank + attrs.rea.rank / 2) + 8;
    def.dodge = Math.floor(attrs.dex.rank + attrs.rea.rank / 2) + 8;
    def.mdef = Math.floor(Math.max(attrs.int.rank, attrs.log.rank) + attrs.will.rank / 2) + 8;

    // Initiative
    this.initiative = Math.max(attrs.int.rank, attrs.rea.rank);

    // Movement
    res.movement.max = Math.floor(2 + attrs.dex.rank);

    // DR and Armor calculation
    this.dr = { slashing: 0, piercing: 0, bludgeoning: 0, heat: 0, cold: 0, necrotic: 0, radiant: 0, electric: 0, sonic: 0 };
    
    if (this.parent && this.parent.items) {
      const equippedArmors = [];
      const slots = this.equipment_slots;
      for (const slotKey of ['armor_upper', 'armor_middle', 'armor_lower']) {
        if (slots[slotKey] && slots[slotKey].item_id) {
          const item = this.parent.items.get(slots[slotKey].item_id);
          if (item && item.type === "armor") equippedArmors.push(item);
        }
      }

      let maxArmorWeight = 0; // 0 = light or none, 1 = medium, 2 = heavy

      for (const armor of equippedArmors) {
        for (const [key, value] of Object.entries(armor.system.dr || {})) {
          if (this.dr[key] !== undefined) {
            this.dr[key] += (value || 0);
          }
        }
        if (armor.system.modifiers) {
          def.dodge += (armor.system.modifiers.dodge || 0);
          def.block += (armor.system.modifiers.block || 0);
          res.movement.max += (armor.system.modifiers.movement || 0);
        }
        
        const weightClass = armor.system.weight_class;
        if (weightClass === "heavy") maxArmorWeight = Math.max(maxArmorWeight, 2);
        else if (weightClass === "medium") maxArmorWeight = Math.max(maxArmorWeight, 1);
      }

      // ==========================================
      // Расчет штрафов от навыка ношения доспехов
      // ==========================================
      // Навыки хранятся единым плоским списком (flat schema), поэтому обращаемся напрямую.
      const armorUseRank = this.skills?.armor_use?.rank || 0;
      let hasArmorPenalty = false;
      
      // Тяжелая броня требует 4+ ранг навыка "Ношение доспехов"
      if (maxArmorWeight === 2 && armorUseRank < 4) hasArmorPenalty = true;
      // Средняя броня требует 2+ ранг навыка "Ношение доспехов"
      if (maxArmorWeight === 1 && armorUseRank < 2) hasArmorPenalty = true;

      this.armor_penalty = hasArmorPenalty;
      if (hasArmorPenalty) {
        // Применяем механический штраф за недостаточный навык:
        // -2 к Инициативе, -2 к Скорости. 
        // Этот штраф также отображается в инвентаре для удобства игрока.
        this.initiative -= 2;
        res.movement.max -= 2;
      }
    }
  }
}
