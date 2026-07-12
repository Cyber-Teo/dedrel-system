/**
 * Декларативный конфиг магической системы Dedrel (Магический Конструктор).
 * Единственный источник истины для таблиц правил: Техники, Модификаторы,
 * лимиты Рангов Доктрин и свойства Доктрин (сродства/ограничения/пути).
 *
 * Канон правил: "_rules/16. Magic.md". Регистрируется как CONFIG.DEDREL.magic
 * в dedrel.mjs. Балансовые правки делаются здесь и в компендиуме Conditions
 * (состояния Модификатора "Сила" подтягиваются по ключу при касте).
 *
 * Все label/text-поля — ключи локализации (ru.json / en.json).
 */
export const DEDREL_MAGIC = {

  /**
   * Размер гекса в метрах сцены. Игра идёт БЕЗ сетки: гекс — концептуальная
   * клетка правил, все дистанции в таблицах указаны в гексах, а движок Foundry
   * (шаблоны-регионы, дальности) работает в метрах. 1 гекс = 2 м.
   */
  hexSizeMeters: 2,

  /**
   * Лимиты по Рангу Доктрины.
   * maxModCost — максимальная стоимость одного Модификатора в ОД.
   * Ранг 6 — заглушка на будущее для ультимативной магии (контента 6 ОД пока нет).
   */
  rankLimits: {
    1: { techniques: 1, modifiers: 2, maxModCost: 1 },
    2: { techniques: 2, modifiers: 2, maxModCost: 2 },
    3: { techniques: 3, modifiers: 3, maxModCost: 3 },
    4: { techniques: 4, modifiers: 4, maxModCost: 4 },
    5: { techniques: 5, modifiers: 5, maxModCost: 5 },
    6: { techniques: 5, modifiers: 5, maxModCost: 6 }
  },

  /**
   * Стоимость покупки Ранга Доктрины за XP (страница опыта, экшн upgradeDoctrine).
   * Индекс = текущий ПРОИЗВОДНЫЙ ранг (0→1 стоит rankXpCosts[0] и т.д.).
   * Шаг 0→1 обычно не используется: таланты доступа сразу дают ранг 1.
   */
  rankXpCosts: [2, 2, 4, 8, 16, 32],

  /**
   * Магические Техники. Покупаются один раз за XP как таланты
   * (талант несёт AE: system.magic.techniques.<key> | Override | 1).
   * requiresSource — техника доступна только при Масштабе Источника "any"/"abundant".
   */
  techniques: {
    create:    { ap: 2, label: "DEDREL.Magic.Techniques.create" },
    move:      { ap: 1, label: "DEDREL.Magic.Techniques.move", requiresSource: true },
    transform: { ap: 1, label: "DEDREL.Magic.Techniques.transform" },
    sense:     { ap: 1, label: "DEDREL.Magic.Techniques.sense" },
    imbue:     { ap: 1, label: "DEDREL.Magic.Techniques.imbue" }
  },

  /**
   * Масштабы Источника.
   * - none: обязательна техника create.
   * - any: доступна техника move (вместо create).
   * - abundant: как any + СНИМАЕТ лимит maxModCost (открывает модификаторы
   *   до 5-го ранга любому магу; ограничитель — пул ОД).
   * Уровень источника по доктринам задаётся ГМом флагом сцены
   * scene.flags.dedrel.sourceScale (см. план, п. 3.9).
   */
  sourceScales: {
    none:     { label: "DEDREL.Magic.SourceScales.none" },
    any:      { label: "DEDREL.Magic.SourceScales.any" },
    abundant: { label: "DEDREL.Magic.SourceScales.abundant", unlocksRank5: true, ignoresMaxModCost: true }
  },

  /**
   * Магические Модификаторы.
   * category: scale | intensity | complexity.
   * ranks: 1..5; отсутствие ранга = недоступен (например, у областей нет ранга 1).
   * exclusiveWith: взаимоисключающие модификаторы (Области ↔ Цели, Области между собой).
   * Поля внутри ranks — "выхлоп" компиляции (Фаза 2, spell-calculator):
   *   hexes/radius/targets → target_range / target_value / template_size
   *   diceCount+die       → formula_damage
   *   hp                  → прочность создаваемого объекта
   *   rounds/special      → длительность эффектов
   *   attackBonus         → system.attack_bonus
   *   forbidDefense       → system.forbidden_defense ("block"/"dodge")
   *   damageType          → тип урона в formula_damage ("4d6[heat]")
   *   saveDc              → system.save_dc_formula
   *   bonus/conditions    → эффект "Силы": табличный бонус/штраф ИЛИ состояние
   *                         (выбор игрока; состояния — ключи condition-предметов
   *                         компендиума Conditions)
   */
  modifiers: {
    // --- Масштаб ---
    range: {
      category: "scale",
      label: "DEDREL.Magic.Modifiers.range",
      ranks: {
        1: { touch: true, hexes: 1 },
        2: { hexes: 5 },
        3: { hexes: 10 },
        4: { hexes: 20 },
        5: { hexes: 30 }
      }
    },
    targets: {
      category: "scale",
      label: "DEDREL.Magic.Modifiers.targets",
      exclusiveWith: ["area_cone", "area_circle", "area_line"],
      ranks: {
        1: { targets: 1 },
        2: { targets: 2 },
        3: { targets: 3 },
        4: { targets: 4 },
        5: { targets: 5 }
      }
    },
    // Конус всегда кастуется от клетки заклинателя; Дальность неприменима.
    area_cone: {
      category: "scale",
      label: "DEDREL.Magic.Modifiers.area_cone",
      template: "cone",
      noRange: true,
      exclusiveWith: ["targets", "area_circle", "area_line"],
      ranks: {
        2: { farRowHexes: 3 },
        3: { farRowHexes: 5 },
        4: { farRowHexes: 7 },
        5: { farRowHexes: 9 }
      }
    },
    area_circle: {
      category: "scale",
      label: "DEDREL.Magic.Modifiers.area_circle",
      template: "circle",
      exclusiveWith: ["targets", "area_cone", "area_line"],
      ranks: {
        2: { radius: 1 },
        3: { radius: 2 },
        4: { radius: 3 },
        5: { radius: 4 }
      }
    },
    area_line: {
      category: "scale",
      label: "DEDREL.Magic.Modifiers.area_line",
      template: "ray",
      exclusiveWith: ["targets", "area_cone", "area_circle"],
      ranks: {
        1: { hexes: 4 },
        2: { hexes: 6 },
        3: { hexes: 8 },
        4: { hexes: 10 },
        5: { hexes: 12 }
      }
    },

    // --- Интенсивность ---
    // Ранги 3-5: игрок выбирает ЛИБО табличный бонус/штраф, ЛИБО состояние из списка.
    // durationMode: "instant" | "rounds:1" | "doctrineRank" (на [Ранг Доктрины] раундов).
    power: {
      category: "intensity",
      label: "DEDREL.Magic.Modifiers.power",
      ranks: {
        1: { saveDc: 10, bonus: 1, durationMode: "instant" },   // +1/-1 к следующему броску
        2: { saveDc: 12, bonus: 2, durationMode: "rounds:1" },  // +2/-2 на 1 раунд
        3: { saveDc: 14, durationMode: "doctrineRank",
             conditions: ["disoriented", "blind", "fear"] },
        4: { saveDc: 16, bonus: 3, durationMode: "doctrineRank",
             conditions: ["suffocating", "pain", "partial_paralysis", "burning", "poisoned", "bleeding"] },
        5: { saveDc: 18, durationMode: "rounds:1",
             conditions: ["fatigued", "stunned", "knockout", "terror", "full_paralysis", "rage"] }
      }
    },
    damage: {
      category: "intensity",
      label: "DEDREL.Magic.Modifiers.damage",
      ranks: {
        1: { diceCount: 1 },
        2: { diceCount: 2 },
        3: { diceCount: 4 },
        4: { diceCount: 6 },
        5: { diceCount: 8 }
      },
      die: "d6" // базовый дайс; доктрина/путь может переопределить (Путь Эха: d4)
    },
    durability: {
      category: "intensity",
      label: "DEDREL.Magic.Modifiers.durability",
      ranks: {
        1: { hp: 5 },
        2: { hp: 10 },
        3: { hp: 15 },
        4: { hp: 20 },
        5: { hp: 25 }
      }
    },

    // --- Сложность ---
    duration: {
      category: "complexity",
      label: "DEDREL.Magic.Modifiers.duration",
      ranks: {
        1: { special: "instant" },
        2: { rounds: 6 },
        3: { rounds: 10 },
        4: { special: "concentration" }, // пока игрок не отменит; потеря сознания обрывает
        5: { special: "day" }            // до календаря — напоминалка, снимается вручную
      }
    },
    accuracy: {
      category: "complexity",
      label: "DEDREL.Magic.Modifiers.accuracy",
      ranks: {
        1: { attackBonus: 1 },
        2: { attackBonus: 2 },
        3: { attackBonus: 3 },
        4: { attackBonus: 4 },
        5: { attackBonus: 5 }
      }
    },
    form: {
      category: "complexity",
      label: "DEDREL.Magic.Modifiers.form",
      textRanks: true, // в UI ячейки рангов показывают текст (Дробящий...), а не цену
      ranks: {
        1: { damageType: "" },            // бесформенная
        2: { damageType: "bludgeoning" }, // дробящий
        3: { damageType: "slashing" },    // режущий
        4: { damageType: "piercing" },    // колющий
        5: { damageType: "complex" }      // любая сложная форма
      }
    },
    // Если не выбран — обычное действие (action).
    actionType: {
      category: "complexity",
      label: "DEDREL.Magic.Modifiers.actionType",
      textRanks: true,
      ranks: {
        1: { chain: true },    // В цепи: можно действовать сразу после этого заклинания
        2: { reaction: true }  // Реакция: кастуется вне хода за ОД, сбережённые в прошлый ход
      }
    },
    // Запрет защиты: цель лишается выбранного способа защиты против этого
    // заклинания (компилируется в system.forbidden_defense, как у манёвра "Финт").
    // Единственный ранг 4 (канон: _rules/16. Magic.md) — гейт по рангу доктрины
    // через maxModCost; блок/уклонение выбирается опцией (механика как у "Силы").
    forbidDefense: {
      category: "complexity",
      label: "DEDREL.Magic.Modifiers.forbidDefense",
      textRanks: true,
      ranks: {
        4: { forbidDefenseChoice: ["block", "dodge"] }
      }
    }
  },

  /**
   * Группы доктрин (для страницы опыта и заголовков UI).
   * Полный список из 18 ключей — канон в "_rules/16. Magic.md".
   */
  doctrineGroups: {
    matter:    ["geomancy", "hydromancy", "pyromancy", "ventomancy"],
    essence:   ["biomancy", "shadowmancy", "aetheromancy"],
    boundless: ["electromancy", "temporalmancy", "astralomancy", "aether_song"],
    innate:    ["blood_magic", "chaos_magic", "shapeshifting", "feral_magic"],
    psionics:  ["telekinesis", "telepathy", "zero"]
  },

  /**
   * Конфиг доктрин для Конструктора. Заполнены только доктрины с описанными
   * правилами (v1 — Материя); доктрина без записи здесь видна на странице опыта,
   * но НЕ появляется в Конструкторе (UI строится от этого объекта).
   *
   * Формат сродств/ограничений: { target, delta } — дельта к цене в ОД.
   *   target: "mod:<ключ модификатора>" | "tech:<ключ техники>"
   * Итоговая цена компонента клампится снизу нулём (Math.max(0, ...)).
   * forbidden: true — компонент недоступен; maxRank — потолок ранга модификатора.
   * paths: у "двухпутёвых" доктрин; активный путь — actor.system.doctrines.<key>.active_path.
   */
  doctrines: {
    pyromancy: {
      label: "DEDREL.Magic.Doctrines.pyromancy",
      baseDamageType: "heat",
      affinity:    [{ target: "mod:damage", delta: -1 }],
      restriction: [
        { target: "mod:accuracy", delta: 1 },
        { target: "mod:form", forbidden: true }
      ],
      // Поджигание: может оставлять состояние "Горение" (burning), способное распространяться
      unique: { ignite: "burning" }
    },

    geomancy: {
      label: "DEDREL.Magic.Doctrines.geomancy",
      baseDamageType: "",
      affinity: [
        { target: "mod:duration", delta: -1 },
        { target: "mod:durability", delta: -1 },
        { target: "tech:imbue", delta: -1 }
      ],
      restriction: [
        { target: "mod:range", delta: 1 },
        { target: "mod:area_cone", delta: 1 },
        { target: "mod:area_circle", delta: 1 }
      ],
      // Контроль Территории: созданные эффекты (стены, ямы) повышают Масштаб
      // Источника для геомантии. v1 — ГМ поднимает уровень источника вручную.
      unique: { territoryControl: true }
    },

    hydromancy: {
      label: "DEDREL.Magic.Doctrines.hydromancy",
      baseDamageType: "",
      // Сродства/ограничения по умолчанию отсутствуют — всё в путях
      paths: {
        flow: {
          label: "DEDREL.Magic.Paths.flow",
          affinity: [
            { target: "mod:area_circle", delta: -1 },
            { target: "tech:move", delta: -1 }
          ],
          caps: [
            { target: "mod:durability", maxRank: 2 },
            { target: "mod:form", maxRank: 2 }
          ]
        },
        ice: {
          label: "DEDREL.Magic.Paths.ice",
          affinity: [
            { target: "mod:durability", delta: -1 },
            { target: "mod:form", delta: -1 }
          ]
        }
      }
    },

    ventomancy: {
      label: "DEDREL.Magic.Doctrines.ventomancy",
      baseDamageType: "",
      restriction: [
        { target: "mod:durability", delta: 1 },
        { target: "mod:accuracy", delta: 1 }
      ],
      // Формы: только бесформенная (1), дробящий (2), режущий (3);
      // колющий и сложная форма недоступны.
      caps: [{ target: "mod:form", allowedRanks: [1, 2, 3] }],
      paths: {
        squall: {
          label: "DEDREL.Magic.Paths.squall",
          affinity: [
            { target: "mod:area_cone", delta: -1 },
            { target: "mod:area_circle", delta: -1 }
          ]
        },
        echo: {
          label: "DEDREL.Magic.Paths.echo",
          // Фокус Эха — концептуально музыкальный инструмент. Отдельной проверки
          // нет: фокус (weapon с типом "магическое") обязателен для ЛЮБОЙ магии.
          affinity: [
            { target: "mod:power", delta: -1 },
            { target: "mod:targets", delta: -1 }
          ],
          // Психоакустика: imbue применяется к существам (наложение состояний "Силы").
          // Звуковой урон: базовый дайс d4, тип sonic (не резистится физическим DR).
          special: { psychoacoustics: true, damageDie: "d4", damageType: "sonic" }
        }
      }
    }
  }
};
