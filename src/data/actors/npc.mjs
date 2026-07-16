/**
 * Модель данных актёра «NPC / Монстр» (тип npc). Один тип с полем tier:
 *   peon — массовка; здоровье в «попаданиях» (hits) через порог прочности
 *          (toughness); один универсальный пул ОД; компактный лист.
 *   boss — соло-угроза; обычное ручное HP; полный контроль над боевым набором;
 *          уникальные механики (стойкость/фазы/реакции) — контентом (таланты/
 *          манёвры), не в схеме.
 *
 * Гибрид, а не «manual-first»: переиспользует боевые структуры и формулы
 * персонажа (атрибуты → сейвы/защиты, броня → DR), но даёт ручной override
 * ключевых производных (max ОД, скорость, max HP) для точной балансировки.
 * Способности носятся как обычные Item'ы (maneuver/spell/mutation/talent) и
 * работают на NPC теми же механизмами, что и у персонажа.
 *
 * ОД: единый пул лежит в resources.ap_universal (тот же ключ, что у персонажа),
 * а пулы ap_maneuver / ap_magic отсутствуют — поэтому логика списания в
 * item.mjs автоматически платит и манёвры, и заклинания с универсального пула.
 */
import { getBonusesSchema } from "./bonuses-schema.mjs";
import { buildAttributes, buildSkills, buildDefenses, buildDR, buildEquipmentSlots, buildDoctrines, buildMagic } from "./shared-schema.mjs";

export default class NpcDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    // Ручной override производной: null → считается по формуле; число → перекрывает.
    const overrideField = () => new fields.NumberField({ required: false, integer: true, nullable: true, initial: null });

    return {
      tier: new fields.StringField({ required: true, initial: "peon", choices: ["peon", "boss"] }),

      attributes: buildAttributes(),
      skills: buildSkills(),
      defenses: buildDefenses(),
      dr: buildDR(),
      equipment_slots: buildEquipmentSlots(),
      bonuses: getBonusesSchema(),

      // Магия: доктрины и техники — те же, что у персонажа. Позволяют боссу
      // кастовать заклинания-предметы по правилам Магического Конструктора
      // (проверка ранга доктрины, известные техники). Ранги выставляются вручную.
      doctrines: buildDoctrines(),
      magic: buildMagic(),

      resources: new fields.SchemaField({
        // Здоровье босса (и запас на случай прямого урона по HP).
        hp: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 10, min: 0 }),
          temp: new fields.NumberField({ required: true, initial: 0, min: 0 }),
          max: new fields.NumberField({ required: false, initial: 10 }) // Derived / override
        }),
        // Здоровье пеона в «попаданиях». Служит и треком ран (штрафы), и
        // индикатором морали (бегство/озверение — текстом в описании).
        hits: new fields.SchemaField({
          value: new fields.NumberField({ required: true, integer: true, initial: 2, min: 0 }),
          max: new fields.NumberField({ required: true, integer: true, initial: 2, min: 1 })
        }),
        // Единый универсальный пул ОД (платит манёвры и заклинания).
        ap_universal: new fields.SchemaField({
          max: new fields.NumberField({ required: false, integer: true, initial: 0 }), // Derived / override
          value: new fields.NumberField({ required: true, integer: true, initial: 0 })
        }),
        movement: new fields.SchemaField({
          max: new fields.NumberField({ required: false, integer: true, initial: 0 }), // Derived / override
          value: new fields.NumberField({ required: true, integer: true, initial: 0 })
        }),
        // Производный трек ран (для пеона считается из hits, для босса — из hp).
        wounds: new fields.SchemaField({
          level: new fields.NumberField({ required: false, integer: true, initial: 1 }),
          penalty: new fields.NumberField({ required: false, integer: true, initial: 0 })
        })
      }),

      // Порог прочности пеона: попадание снимает 1 хит, только если урон
      // (после вычета DR) ≥ toughness. Слабые задевания игнорируются.
      toughness: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),

      // Ручные переопределения производных (в обход формул). null = по формуле.
      overrides: new fields.SchemaField({
        ap_max: overrideField(),
        movement_max: overrideField(),
        hp_max: overrideField()
      }),

      senses: new fields.SchemaField({
        darkvision: new fields.NumberField({ required: false, integer: true, initial: 0, min: 0 })
      }),

      initiative: new fields.NumberField({ required: false, integer: true, initial: 0 }), // Derived

      details: new fields.SchemaField({
        threat: new fields.StringField({ required: false, blank: true, initial: "" }),
        biography: new fields.HTMLField({ required: false, blank: true, initial: "" })
      })
    };
  }

  /**
   * Обнуляем производные значения-аккумуляторы (считаются ниже через `+=`)
   * в начале каждого цикла подготовки. Без этого повторный prepareData() без
   * reset() (например, ядро/модуль на updateWorldTime — см. active-effects-hud
   * `_onTimeChange`) накапливает поверх уже посчитанного и удваивает максимумы:
   * короткий отдых продвигает время мира -> HUD зовёт actor.prepareData() ->
   * max ОД становится 2× -> сохранённый value = max даёт «2 / 1» на листе.
   * Идёт ДО применения Active Effects, поэтому их вклад не теряется.
   * Фолбэки соответствуют initial соответствующих полей схемы (hp.max = 10).
   */
  prepareBaseData() {
    super.prepareBaseData();
    const getSrc = (path, dflt = 0) => foundry.utils.getProperty(this._source, path) ?? dflt;
    const res = this.resources;
    res.hp.max = getSrc("resources.hp.max", 10);
    res.ap_universal.max = getSrc("resources.ap_universal.max");
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
    const ov = this.overrides || {};

    // === Защиты (та же формула, что у персонажа) ===
    def.block += Math.floor(attrs.str.rank + attrs.rea.rank / 2) + 8;
    def.dodge += Math.floor(attrs.dex.rank + attrs.rea.rank / 2) + 8;
    def.mdef += Math.floor(Math.max(attrs.int.rank, attrs.log.rank) + attrs.will.rank / 2) + 8;

    // === Единый пул ОД: база от лучшего из CON/WILL (как universal у персонажа) ===
    const maxConWill = Math.max(attrs.con.rank, attrs.will.rank);
    const minConWill = Math.min(attrs.con.rank, attrs.will.rank);
    const baseUniv = maxConWill > 1 ? 1 : 0;
    res.ap_universal.max += baseUniv + Math.ceil((maxConWill + minConWill / 2) / 2);

    // === Инициатива и скорость ===
    this.initiative += Math.max(attrs.int.rank, attrs.rea.rank);
    res.movement.max += Math.floor(2 + attrs.dex.rank);

    // === HP босса (та же формула, что у персонажа) ===
    res.hp.max += Math.ceil((attrs.con.rank + attrs.will.rank / 2) * 10);
    const hpMult = this.bonuses?.hp_multiplier || 0;
    if (hpMult !== 0) res.hp.max = Math.max(1, Math.floor(res.hp.max * (1 + hpMult)));

    // === Броня: DR, модификаторы защит/скорости, штраф навыка ношения ===
    if (this.parent && this.parent.items) {
      const slots = this.equipment_slots;
      const equippedArmors = [];
      for (const slotKey of ["armor_upper", "armor_middle", "armor_lower"]) {
        if (slots[slotKey]?.item_id) {
          const item = this.parent.items.get(slots[slotKey].item_id);
          if (item && item.type === "armor") equippedArmors.push(item);
        }
      }

      let maxArmorWeight = 0; // 0 лёгкая, 1 средняя, 2 тяжёлая (см. гейт ниже)
      for (const armor of equippedArmors) {
        for (const [key, value] of Object.entries(armor.system.dr || {})) {
          if (this.dr[key] !== undefined) this.dr[key] += (value || 0);
        }
        // modifiers.* — ручная «щель» сверх лекала; механику свойств выводим ниже.
        if (armor.system.modifiers) {
          def.dodge += (armor.system.modifiers.dodge || 0);
          def.block += (armor.system.modifiers.block || 0);
          res.movement.max += (armor.system.modifiers.movement || 0);
          if (this.skills?.stealth) this.skills.stealth.bonus += (armor.system.modifiers.stealth || 0);
        }
        // Свойства лекала — см. подробный разбор в character.mjs (включая то,
        // почему encumbering здесь не обрабатывается).
        const props = armor.system.properties || {};
        if (props.rigid) def.dodge -= 1;
        if (props.loud && this.skills?.stealth) this.skills.stealth.bonus -= 2;
        def.block += (props.deflecting || 0);

        const wc = armor.system.weight_class;
        if (wc === "heavy") maxArmorWeight = Math.max(maxArmorWeight, 2);
        else if (wc === "medium") maxArmorWeight = Math.max(maxArmorWeight, 1);
      }

      // Тип берётся только с самого тяжёлого слоя; без доспеха типа нет.
      if (equippedArmors.length) {
        if (maxArmorWeight === 0) { def.dodge += 1; def.block -= 1; }
        else if (maxArmorWeight === 2) { def.dodge -= 1; def.block += 1; }
      }

      const offHandId = slots.off_hand?.item_id;
      const offHand = offHandId ? this.parent.items.get(offHandId) : null;
      if (offHand && offHand.type === "weapon") {
        def.block += (offHand.system.deflecting || 0);
        if (offHand.system.is_auxiliary) def.block += 1;
      }

      const armorUseRank = this.skills?.armor_use?.rank || 0;
      let hasArmorPenalty = false;
      if (maxArmorWeight === 2 && armorUseRank < 4) hasArmorPenalty = true;
      if (maxArmorWeight === 1 && armorUseRank < 2) hasArmorPenalty = true;
      this.armor_penalty = hasArmorPenalty;
      if (hasArmorPenalty) {
        this.bonuses.global_skill -= 2;
        this.initiative -= 2;
        res.movement.max = Math.max(0, res.movement.max - 4);
      }
    }

    // === Ручные override (перекрывают формулы) ===
    if (ov.ap_max !== null && ov.ap_max !== undefined) res.ap_universal.max = ov.ap_max;
    if (ov.movement_max !== null && ov.movement_max !== undefined) res.movement.max = ov.movement_max;
    if (ov.hp_max !== null && ov.hp_max !== undefined) res.hp.max = ov.hp_max;
    res.movement.max = Math.max(0, res.movement.max);

    // === Трек ран / индикатор морали ===
    // Пеон считает от hits, босс — от hp. Пороги те же, что у персонажа.
    let hpPercent;
    if (this.tier === "peon") {
      const hm = Math.max(1, res.hits.max);
      hpPercent = (res.hits.value / hm) * 100;
    } else {
      const hm = Math.max(1, res.hp.max);
      hpPercent = (res.hp.value / hm) * 100;
    }
    if (hpPercent > 75) { res.wounds.level = 1; res.wounds.penalty = 0; }
    else if (hpPercent > 50) { res.wounds.level = 2; res.wounds.penalty = -1; }
    else if (hpPercent > 25) { res.wounds.level = 3; res.wounds.penalty = -3; }
    else { res.wounds.level = 4; res.wounds.penalty = -5; }
    if ((this.bonuses?.ignore_wound_penalty || 0) > 0) res.wounds.penalty = 0;
  }
}
