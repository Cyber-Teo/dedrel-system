/**
 * Модель данных (Data Model) для главного героя (персонажа) в системе Dedrel.
 * Определяет структуру всех базовых параметров (Атрибуты, Навыки, Ресурсы)
 * и содержит логику для расчета производных (Derived) характеристик.
 */
import { getBonusesSchema } from "./bonuses-schema.mjs";
import { buildAttributes, buildSkills, buildDefenses, buildDR, buildEquipmentSlots, buildDoctrines, buildMagic } from "./shared-schema.mjs";

export default class CharacterDataModel extends foundry.abstract.TypeDataModel {
  /**
   * Определяет схему данных (Data Schema) для сущности "character".
   * Возвращает объект с полями, которые будут сохранены в базе данных Foundry.
   */
  static defineSchema() {
    const fields = foundry.data.fields;

    const bloodlineField = () => new fields.SchemaField({
      rank: new fields.NumberField({ required: true, integer: true, initial: 1, min: 0 })
    });

    return {
      bloodlines: new fields.SchemaField({
        human: bloodlineField(),
        demon: bloodlineField(),
        dragon: bloodlineField(),
        fay: bloodlineField(),
        elf: bloodlineField()
      }),
      attributes: buildAttributes(),

      skills: buildSkills(),

      // Доктрины Магического Конструктора (18 канонических ключей) и известные
      // техники — общий источник в shared-schema.mjs (тот же набор у NPC-босса).
      doctrines: buildDoctrines(),

      magic: buildMagic(),

      resources: new fields.SchemaField({
        hp: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 10, min: 0 }),
          temp: new fields.NumberField({ required: true, initial: 0, min: 0 }),
          max: new fields.NumberField({ required: false, initial: 10 }) // Derived
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
          // Скорость измеряется в МЕТРАХ (см. _rules/5). Не integer: на безсеточных
          // картах и при дробном расходе значение может быть нецелым (напр. 6.5 м).
          max: new fields.NumberField({ required: false, initial: 0 }), // Derived
          value: new fields.NumberField({ required: true, initial: 0 })
        })
      }),

      senses: new fields.SchemaField({
        darkvision: new fields.NumberField({ required: false, integer: true, initial: 0, min: 0 })
      }),

      defenses: buildDefenses(),

      dr: buildDR(),

      equipment_slots: buildEquipmentSlots(),

      bonuses: getBonusesSchema(),

      // Кошелёк: счётчики монет по ключам валют из настройки мира "currencies".
      // Свободные ключи (ObjectField), т.к. список валют динамический.
      // Производные wallet.total_base и wallet.weight считаются в prepareDerivedData.
      currency: new fields.ObjectField({ required: false, initial: {} }),

      // Может ли актор быть получателем перевода денег. Фильтрует список
      // получателей в диалогах перевода, чтобы на большой сцене не всплывали
      // все сундуки/лут. По умолчанию персонажи — принимают.
      can_receive_currency: new fields.BooleanField({ required: true, initial: true }),

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
  /**
   * Обнуляем производные значения-аккумуляторы (те, что ниже считаются через `+=`)
   * в НАЧАЛЕ каждого цикла подготовки. Иначе повторный вызов prepareData() без
   * предшествующего reset() (например, ядро/модуль по хуку updateWorldTime —
   * см. active-effects-hud `_onTimeChange`) накапливает значения поверх уже
   * посчитанных и удваивает максимумы. Симптом: короткий отдых продвигает время
   * мира -> HUD эффектов вызывает actor.prepareData() -> max ОД становится 2×,
   * а performRest сохраняет value = (удвоенный) max -> на листе «2 / 1».
   * prepareBaseData идёт ДО применения Active Effects, поэтому вклад эффектов
   * не теряется (эффекты добавляются после обнуления, затем += домешивает атрибуты).
   */
  prepareBaseData() {
    super.prepareBaseData();
    // Фолбэки соответствуют initial соответствующих полей схемы (hp.max = 10).
    const getSrc = (path, dflt = 0) => foundry.utils.getProperty(this._source, path) ?? dflt;
    const res = this.resources;
    res.hp.max = getSrc("resources.hp.max", 10);
    res.luck_points.max = getSrc("resources.luck_points.max");
    res.ap_universal.max = getSrc("resources.ap_universal.max");
    res.ap_maneuver.max = getSrc("resources.ap_maneuver.max");
    res.ap_magic.max = getSrc("resources.ap_magic.max");
    res.movement.max = getSrc("resources.movement.max");
    const def = this.defenses;
    def.block = getSrc("defenses.block");
    def.dodge = getSrc("defenses.dodge");
    def.mdef = getSrc("defenses.mdef");
    this.initiative = getSrc("initiative");
    for (const key of Object.keys(this.dr)) this.dr[key] = getSrc(`dr.${key}`);
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    const attrs = this.attributes;
    const res = this.resources;
    const def = this.defenses;

    // HP Max
    res.hp.max += Math.ceil((attrs.con.rank + attrs.will.rank / 2) * 10);
    
    // HP Multiplier (applied after attributes)
    const hpMult = this.bonuses?.hp_multiplier || 0;
    if (hpMult !== 0) {
      res.hp.max = Math.max(1, Math.floor(res.hp.max * (1 + hpMult)));
    }

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

    // Ярость и подобные эффекты (system.bonuses.ignore_wound_penalty > 0):
    // штраф за ранения обнуляется, но уровень ранения сохраняется —
    // трек ран на листе и логика лечения продолжают работать.
    if ((this.bonuses?.ignore_wound_penalty || 0) > 0) {
      res.wounds.penalty = 0;
    }

    // Кошелёк: суммарная ценность (в базовых единицах) и вес монет.
    // Список валют берётся из настройки мира; при недоступности настройки
    // (ранняя инициализация) кошелёк считается нулевым и пересчитается позже.
    this.wallet = { total_base: 0, weight: 0 };
    try {
      const defs = game.settings.get("dedrel", "currencies") || [];
      const counts = this.currency || {};
      for (const def of defs) {
        const n = Number(counts[def.key]) || 0;
        this.wallet.total_base += n * (Number(def.base_value) || 0);
        this.wallet.weight += n * (Number(def.weight) || 0);
      }
    } catch (e) {
      // Настройка валют ещё не готова — оставляем нулевой кошелёк
    }

    // Luck Points Max
    res.luck_points.max += attrs.luck.rank;

    // AP Universal
    const maxConWill = Math.max(attrs.con.rank, attrs.will.rank);
    const minConWill = Math.min(attrs.con.rank, attrs.will.rank);
    const baseUniv = maxConWill > 1 ? 1 : 0;
    res.ap_universal.max += baseUniv + Math.ceil((maxConWill + minConWill / 2) / 2);

    // AP Maneuver
    const maxManeuver = Math.max(attrs.str.rank, attrs.dex.rank, attrs.rea.rank);
    const baseManeuver = maxManeuver > 1 ? 1 : 0;
    res.ap_maneuver.max += baseManeuver + Math.ceil(maxManeuver / 2);

    // AP Magic
    const maxMagic = Math.max(attrs.log.rank, attrs.int.rank);
    const baseMagic = maxMagic > 1 ? 1 : 0;
    res.ap_magic.max += baseMagic + Math.ceil(maxMagic / 2);

    // Defenses
    def.block += Math.floor(attrs.str.rank + attrs.rea.rank / 2) + 8;
    def.dodge += Math.floor(attrs.dex.rank + attrs.rea.rank / 2) + 8;
    def.mdef += Math.floor(Math.max(attrs.int.rank, attrs.log.rank) + attrs.will.rank / 2) + 8;

    // Initiative
    this.initiative += Math.max(attrs.int.rank, attrs.rea.rank);

    // Movement — запас в МЕТРАХ за раунд: (2 + Ловкость) × 2 (см. _rules/5).
    // Множитель ×2 = «метры на клетку» (1 клетка сетки Foundry = 2 м).
    res.movement.max += (2 + attrs.dex.rank) * 2;

    // DR and Armor calculation
    // this.dr is now part of the schema, so Active Effects can modify it.
    // We just need to add armor DR to it.

    if (this.parent && this.parent.items) {
      const equippedArmors = [];
      const slots = this.equipment_slots;
      for (const slotKey of ['armor_upper', 'armor_middle', 'armor_lower']) {
        if (slots[slotKey] && slots[slotKey].item_id) {
          const item = this.parent.items.get(slots[slotKey].item_id);
          if (item && item.type === "armor") equippedArmors.push(item);
        }
      }

      let maxArmorWeight = 0; // 0 = лёгкая, 1 = средняя, 2 = тяжёлая (см. гейт ниже)

      for (const armor of equippedArmors) {
        for (const [key, value] of Object.entries(armor.system.dr || {})) {
          if (this.dr[key] !== undefined) {
            this.dr[key] += (value || 0);
          }
        }
        // modifiers.* — ручная «щель» под материальные/магические добавки сверх
        // лекала. Механику свойств сюда дублировать не нужно: она выводится ниже.
        if (armor.system.modifiers) {
          def.dodge += (armor.system.modifiers.dodge || 0);
          def.block += (armor.system.modifiers.block || 0);
          res.movement.max += (armor.system.modifiers.movement || 0);
          if (this.skills?.stealth) this.skills.stealth.bonus += (armor.system.modifiers.stealth || 0);
        }

        // Свойства лекала (12. Armor §Свойства). Штрафы принадлежат предмету,
        // поэтому считаются с каждого надетого слоя и складываются — правила
        // явно разрешают это для «Жесткого» («складывается со штрафами от типа»).
        // props.encumbering здесь СОЗНАТЕЛЬНО не обрабатывается: канала для
        // штрафа к стрелковым/магическим атакам у актора нет (см. NOTES.md).
        const props = armor.system.properties || {};
        if (props.rigid) def.dodge -= 1;
        if (props.loud && this.skills?.stealth) this.skills.stealth.bonus -= 2;
        def.block += (props.deflecting || 0);

        const weightClass = armor.system.weight_class;
        if (weightClass === "heavy") maxArmorWeight = Math.max(maxArmorWeight, 2);
        else if (weightClass === "medium") maxArmorWeight = Math.max(maxArmorWeight, 1);
      }

      // Бонусы/штрафы ТИПА доспеха: определяются самым тяжёлым надетым слоем и
      // берутся только с него — не суммируются по слоям (12. Armor §Типы доспехов).
      // Без доспеха типа нет вовсе, поэтому голый персонаж не получает бонус лёгкого.
      if (equippedArmors.length) {
        if (maxArmorWeight === 0) { def.dodge += 1; def.block -= 1; }   // лёгкий
        else if (maxArmorWeight === 2) { def.dodge -= 1; def.block += 1; } // тяжёлый
        // средний (1) — без бонусов и штрафов
      }

      // Щит и «Вспомогательное» оружие в свободной руке дают Блок, пока в руке.
      const offHandId = slots.off_hand?.item_id;
      const offHand = offHandId ? this.parent.items.get(offHandId) : null;
      if (offHand && offHand.type === "weapon") {
        def.block += (offHand.system.deflecting || 0);
        if (offHand.system.is_auxiliary) def.block += 1;
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
        // Штраф за несоответствие ранга (12. Armor §Навык): −2 ко ВСЕМ проверкам
        // навыков, −2 к Инициативе, −4 м к Скорости. global_skill бьёт только
        // не-спасброски (src/dice/roll.mjs) — это и есть «проверки навыков».
        this.bonuses.global_skill -= 2;
        this.initiative -= 2;
        // −4 метра к Скорости (значение в метрах, как в правилах).
        res.movement.max = Math.max(0, res.movement.max - 4);
      }
    }

    // ==========================================
    // Перегрузка (Encumbrance)
    // ==========================================
    // Суммарный вес: физические предметы (× количество) + вес монет кошелька.
    // Пороги = (STR+CON)·5/10/15 кг, модифицируемые талантами
    // (carry_capacity_mult / carry_capacity_flat). Категория и штрафы
    // (−1/−3 ко всем броскам, −2 м / полная остановка скорости) применяются,
    // если не выставлен иммунитет ignore_encumbrance_penalty.
    // Хранится ад-хок в this.resources.encumbrance (как this.wallet) — производное,
    // в _source не пишется, миграция не нужна.
    const NON_PHYSICAL = new Set([
      "maneuver", "talent", "mutation", "condition", "spell", "exp", "countryoforigin", "mutilation", "creature_type"
    ]);
    let carriedWeight = this.wallet?.weight || 0;
    if (this.parent && this.parent.items) {
      for (const item of this.parent.items) {
        if (NON_PHYSICAL.has(item.type)) continue;
        const w = Number(item.system?.weight) || 0;
        if (w <= 0) continue;
        // Вес монет-предметов (currency) уже посчитан за всю пачку (value·weight_per_unit),
        // поэтому их количество не домножаем. У типов без поля quantity (броня,
        // торговые товары) количество считается равным 1 — ?? внутри Number(),
        // иначе Number(undefined) даёт NaN и рушит весь подсчёт веса.
        const qty = item.type === "currency" ? 1 : Number(item.system?.quantity ?? 1);
        carriedWeight += w * qty;
      }
    }

    const capBase = attrs.str.rank + attrs.con.rank;
    const capMult = 1 + (this.bonuses?.carry_capacity_mult || 0);
    const capFlat = this.bonuses?.carry_capacity_flat || 0;
    const thresholds = {
      light: capBase * 5 * capMult + capFlat,
      medium: capBase * 10 * capMult + capFlat,
      heavy: capBase * 15 * capMult + capFlat
    };

    let category = "light";
    let rollPenalty = 0;
    let stopMovement = false;
    let movePenalty = 0;
    if (carriedWeight > thresholds.heavy) {
      category = "overloaded"; rollPenalty = 3; stopMovement = true;
    } else if (carriedWeight > thresholds.medium) {
      category = "heavy"; rollPenalty = 3; movePenalty = 2; // −2 м (см. _rules/15)
    } else if (carriedWeight > thresholds.light) {
      category = "medium"; rollPenalty = 1;
    }

    const immune = (this.bonuses?.ignore_encumbrance_penalty || 0) > 0;
    if (!immune) {
      this.bonuses.global_roll -= rollPenalty;
      if (stopMovement) res.movement.max = 0;
      else res.movement.max = Math.max(0, res.movement.max - movePenalty);
    }

    this.resources.encumbrance = {
      total: Math.round(carriedWeight * 100) / 100,
      category,
      thresholds,
      immune,
      rollPenalty: immune ? 0 : rollPenalty
    };
  }
}
