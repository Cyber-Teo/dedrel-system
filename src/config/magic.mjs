/**
 * Декларативный конфиг магической системы Dedrel (Магический Конструктор).
 * Единственный источник истины для таблиц правил: Техники, Модификаторы,
 * лимиты Рангов Доктрин и свойства Доктрин (сродства/ограничения/пути).
 *
 * Канон правил: "_rules/16. Magic.md". Регистрируется как CONFIG.DEDREL.magic
 * в dedrel.mjs. Балансовые правки делаются здесь и в компендиуме Conditions
 * (состояния доктринных Модификаторов подтягиваются по ключу при касте).
 *
 * Все label/text-поля — ключи локализации (ru.json / en.json).
 * Все дистанции — СРАЗУ в метрах сцены (правила переведены на метры, 2026-07).
 */
export const DEDREL_MAGIC = {

  /**
   * Лестница урона (расширенная, ступени II–VII; канон — "_rules/13. Weapons.md").
   * Оружие ограничено ступенью V; ступени VI–VII — только магия.
   * Ранг Модификатора "damage" задаёт ступень (ranks[N].step), доктрина может
   * сдвигать её (ladderShift Пиромантии), Изобильный Источник добавляет +1.
   * Выше VII сдвиг не идёт (кламп в компиляторе).
   */
  damageLadder: {
    2: "2d4",
    3: "2d6",
    4: "2d8",
    5: "3d6",
    6: "3d8",
    7: "4d8"
  },

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
   * requiresSource — техника доступна только при Масштабе Источника "any"/"abundant"
   * (для доктрин с ignoresSource проверка снимается).
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
   *   до 5-го ранга любому магу; ограничитель — пул ОД) + поднимает урон
   *   заклинания на одну ступень Лестницы (damageStepBonus, кап VII).
   * Уровень источника по доктринам задаётся ГМом флагом сцены
   * scene.flags.dedrel.sourceScale (виджет «Источники сцены» в левой колонке).
   * Доктрины с ignoresSource (Биомантия, позже Электромантия) концепцию
   * Источника игнорируют целиком.
   */
  sourceScales: {
    none:     { label: "DEDREL.Magic.SourceScales.none" },
    any:      { label: "DEDREL.Magic.SourceScales.any" },
    abundant: { label: "DEDREL.Magic.SourceScales.abundant", unlocksRank5: true, ignoresMaxModCost: true, damageStepBonus: 1 }
  },

  /**
   * Уровень Источника на сцене, которую ГМ не настраивал.
   * Воздух и земля есть почти везде — их отсутствие это редкое исключение
   * (подземелье без воздуха, помост над пропастью), поэтому дефолт "any".
   * Доктрины без записи считаются "none": огонь, вода и тьма в кадре должны
   * появиться осознанно. Ключ читается ТОЛЬКО через utils/magic-source.mjs.
   */
  defaultSourceScales: {
    ventomancy: "any",
    geomancy:   "any"
  },

  /**
   * Магические Модификаторы.
   * category: scale | intensity | complexity.
   * ranks: 1..5; отсутствие ранга = недоступен (например, у областей нет ранга 1).
   * exclusiveWith: взаимоисключающие модификаторы (Области ↔ Цели, Области между собой).
   *
   * doctrinal: true — ДОКТРИННЫЙ модификатор: не входит в общий каталог, доступен
   *   только доктрине/пути, объявившим его в своём списке modifiers: [...].
   *   Сложность спасброска доктринных модификаторов = 8 + 2 × ранг.
   * requiresTechnique: "<ключ>" — модификатор легален только вместе с техникой.
   * requiresArea: true — требует Модификатора Области в сборке.
   * requiresForms: true — доступен только доктрине/пути с непустым списком forms.
   *
   * Поля внутри ranks — "выхлоп" компиляции (spell-calculator):
   *   meters/lengthMeters/radiusMeters/targets → target_range / target_value / template_size
   *   step                → ступень Лестницы урона → formula_damage
   *   heal                → formula_heal
   *   hp                  → прочность создаваемого объекта
   *   rounds/special      → длительность эффектов
   *   attackBonus         → system.attack_bonus
   *   forbidDefense       → system.forbidden_defense ("block"/"dodge")
   *   saveDc/penalty/bonus/conditions → эффект доктринного модификатора
   *   pushMeters          → принудительное перемещение (текстовый факт карточки)
   *   imbueValue          → величина Насыщения (эффект под кнопку «Применить»)
   *   hintFact: true      → строка RankHints попадает в описание заклинания
   */
  modifiers: {
    // --- Масштаб ---
    range: {
      category: "scale",
      label: "DEDREL.Magic.Modifiers.range",
      ranks: {
        1: { touch: true, meters: 2 },
        2: { meters: 10 },
        3: { meters: 20 },
        4: { meters: 40 },
        5: { meters: 60 }
      }
    },
    // Без Модификатора — одна цель (дефолт, ранг 1 удалён из правил).
    targets: {
      category: "scale",
      label: "DEDREL.Magic.Modifiers.targets",
      exclusiveWith: ["area_cone", "area_circle", "area_line"],
      ranks: {
        2: { targets: 2 },
        3: { targets: 3 },
        4: { targets: 4 },
        5: { targets: 5 }
      }
    },
    // Конус всегда кастуется от клетки заклинателя; Дальность неприменима.
    // priceDelta: Области стоят Ранг+1 ОД (баланс 2026-07-16: чтобы «Цели» имели
    // нишу); лимит maxModCost и гейт 5-го ранга считаются по РАНГУ, не по цене.
    area_cone: {
      category: "scale",
      label: "DEDREL.Magic.Modifiers.area_cone",
      template: "cone",
      noRange: true,
      priceDelta: 1,
      exclusiveWith: ["targets", "area_circle", "area_line"],
      ranks: {
        2: { lengthMeters: 4 },
        3: { lengthMeters: 8 },
        4: { lengthMeters: 12 },
        5: { lengthMeters: 16 }
      }
    },
    area_circle: {
      category: "scale",
      label: "DEDREL.Magic.Modifiers.area_circle",
      template: "circle",
      priceDelta: 1,
      exclusiveWith: ["targets", "area_cone", "area_line"],
      ranks: {
        2: { radiusMeters: 2 },
        3: { radiusMeters: 4 },
        4: { radiusMeters: 6 },
        5: { radiusMeters: 8 }
      }
    },
    area_line: {
      category: "scale",
      label: "DEDREL.Magic.Modifiers.area_line",
      template: "ray",
      priceDelta: 1,
      exclusiveWith: ["targets", "area_cone", "area_circle"],
      ranks: {
        1: { lengthMeters: 8 },
        2: { lengthMeters: 12 },
        3: { lengthMeters: 16 },
        4: { lengthMeters: 20 },
        5: { lengthMeters: 24 }
      }
    },

    // --- Интенсивность ---
    // Урон по Лестнице: ранг = ступень II–VI; Пиромантия сдвигает на +1 (III–VII),
    // Изобильный Источник даёт ещё +1 (кап VII). Формула — damageLadder[step].
    damage: {
      category: "intensity",
      label: "DEDREL.Magic.Modifiers.damage",
      ranks: {
        1: { step: 2 },
        2: { step: 3 },
        3: { step: 4 },
        4: { step: 5 },
        5: { step: 6 }
      }
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
    // Насыщение: числовая мощность свойства, внедряемого техникой imbue
    // (само свойство обязано выводиться из стихии — "Рамка свободных эффектов",
    // 16. Magic.md §5). Ранги 1–3: выбор опцией (навык/защита, урон оружию, DR);
    // ранг 4: +1 ступень Лестницы оружию (v1 — текстом). Без Длительности — 1 раунд.
    // Правило "без стаков" в v1 социальное.
    imbuement: {
      category: "intensity",
      label: "DEDREL.Magic.Modifiers.imbuement",
      requiresTechnique: "imbue",
      ranks: {
        1: { imbueValue: 1, imbueChoice: ["skill", "weapon", "dr"] },
        2: { imbueValue: 2, imbueChoice: ["skill", "weapon", "dr"] },
        3: { imbueValue: 3, imbueChoice: ["skill", "weapon", "dr"] },
        4: { imbueLadderStep: true, hintFact: true }
      }
    },

    // --- Доктринные модификаторы (интенсивность; владельцы — см. doctrines.*.modifiers) ---
    // Сила: каталог подавления. Тенемантия — полностью; Путь Эха — ранги 1–3
    // (Психоакустика). Бонусных ветвей больше нет: только штраф ИЛИ состояние.
    // durationMode: "instant" (следующий бросок) | "rounds:1" | "doctrineRank".
    // Состав списка на каждом ранге задают ТОЛЬКО массивы conditions ниже —
    // это канон правил (16. Magic.md §4). Компендиум magic_conditions
    // (conditionsFromPack; кураторский пул, см. dedrel.mjs CONDITION_PACKS)
    // лишь подменяет имена/версии уже перечисленных состояний: селект
    // пересекает пак с массивом ранга, поэтому наполнение пака не может
    // ни расширить список, ни снести ранговый гейт.
    power: {
      category: "intensity",
      doctrinal: true,
      label: "DEDREL.Magic.Modifiers.power",
      conditionsFromPack: "dedrel.magic_conditions",
      ranks: {
        1: { saveDc: 10, penalty: 1, durationMode: "instant" },
        2: { saveDc: 12, penalty: 2, durationMode: "rounds:1" },
        3: { saveDc: 14, penalty: 2, durationMode: "doctrineRank",
             conditions: ["disoriented", "blind", "fear"] },
        // Правка 2026-09-10: изъяты ключи без предметов-состояний — `rage`
        // (состояние талантов/мутаций, см. 17. Conditions) и `poisoned`
        // (общего «Отравления» не будет: каждый яд — своя кондиция,
        // craft/Armor Rework Plan.md §8). Место в списке 4 занял `withering`.
        4: { saveDc: 16, penalty: 3, durationMode: "doctrineRank",
             conditions: ["suffocating", "pain", "partial_paralysis", "burning", "bleeding", "withering"] },
        5: { saveDc: 18, durationMode: "rounds:1",
             conditions: ["fatigued", "stunned", "knockout", "terror", "full_paralysis"] }
      }
    },
    // "Воодушевление" изъято 2026-09-15: дублировало Насыщение, у которого кривая
    // и длиннее (масштабируется Длительностью), и полнее (ранги 1-4). Командные
    // бафы Эха теперь = Насытить + Насыщение + Длительность со скидкой Пути.

    // Сковывание (Путь Льда): лёд держит на месте.
    constrain: {
      category: "intensity",
      doctrinal: true,
      label: "DEDREL.Magic.Modifiers.constrain",
      ranks: {
        2: { saveDc: 12, durationMode: "doctrineRank", hintFact: true }, // замедление −50%
        3: { saveDc: 14, durationMode: "rounds:1", conditions: ["entangled"] },
        5: { saveDc: 18, durationMode: "rounds:1", conditions: ["full_paralysis"] }
      }
    },
    // Сбивание (Вентомантия и Путь Потока): порыв ветра/волна сносят с ног.
    knockdown: {
      category: "intensity",
      doctrinal: true,
      label: "DEDREL.Magic.Modifiers.knockdown",
      ranks: {
        2: { saveDc: 12, durationMode: "instant", conditions: ["prone"] },
        3: { saveDc: 14, durationMode: "instant", conditions: ["prone"], pushMeters: 4, hintFact: true }
      }
    },
    // Пыльная завеса (Вентомантия): зона помех зрению. Требует Области;
    // v1 — текст в карточке, механизация зоны через регион отложена (NOTES).
    dust_veil: {
      category: "intensity",
      doctrinal: true,
      label: "DEDREL.Magic.Modifiers.dust_veil",
      requiresArea: true,
      ranks: {
        2: { hintFact: true }
      }
    },
    // Удушение (Вентомантия): вакуум — воздух покидает лёгкие цели.
    choke: {
      category: "intensity",
      doctrinal: true,
      label: "DEDREL.Magic.Modifiers.choke",
      ranks: {
        4: { saveDc: 16, durationMode: "doctrineRank", conditions: ["suffocating"] }
      }
    },
    // Лечение (Биомантия): зеркало Лестницы урона, конвейер formula_heal готов
    // (кнопка "Исцелить" в карточке чата).
    heal: {
      category: "intensity",
      doctrinal: true,
      label: "DEDREL.Magic.Modifiers.heal",
      exclusiveWith: ["damage"],
      ranks: {
        1: { heal: "2d4" },
        2: { heal: "2d6" },
        3: { heal: "2d8" },
        4: { heal: "3d6" },
        5: { heal: "3d8" }
      }
    },
    // Адаптация (Биомантия): временная телесная черта. Два списка (решение
    // 2026-09-10): согласной цели — адаптация из `biomancy_adaptations`,
    // несогласной — увечье из `mutilations` со спасброском. Оба пака содержат
    // предметы типа condition, поэтому черта умеет длительность, попадает
    // в реестр статусов (dedrel.mjs CONDITION_PACKS) и накладывается кнопкой
    // карточки — тем же механизмом, что состояния «Силы».
    // Ранг предмета — `flags.dedrel.rank`; селект показывает только предметы
    // ранга, равного рангу Модификатора. Копий мутаций тут нет: биоманту линии
    // крови безразличны, он лепит плоть, а не наследует её.
    adapt: {
      category: "intensity",
      doctrinal: true,
      label: "DEDREL.Magic.Modifiers.adapt",
      optionsFromPack: ["dedrel.biomancy_adaptations", "dedrel.mutilations"],
      ranks: {
        1: { saveDc: 10, durationMode: "doctrineRank", hintFact: true },
        2: { saveDc: 12, durationMode: "doctrineRank", hintFact: true },
        3: { saveDc: 14, durationMode: "doctrineRank", hintFact: true },
        4: { saveDc: 16, durationMode: "doctrineRank", hintFact: true },
        5: { saveDc: 18, durationMode: "doctrineRank", hintFact: true }
      }
    },

    // --- Сложность ---
    // Без Модификатора — эффект мгновенный (дефолт, ранг 1 удалён из правил).
    duration: {
      category: "complexity",
      label: "DEDREL.Magic.Modifiers.duration",
      ranks: {
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
    // Форма: доктринная привязка (реворк 2026-07-13). Плоская цена 2 ОД,
    // список доступных физических типов — forms доктрины/пути (путь переопределяет).
    // Выбор конкретной формы — опцией (селект в UI). "Сложная форма" удалена.
    form: {
      category: "complexity",
      label: "DEDREL.Magic.Modifiers.form",
      requiresForms: true,
      textRanks: true,
      ranks: {
        2: { formChoice: true }
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
    // через maxModCost; блок/уклонение выбирается опцией.
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
   * Конфиг доктрин для Конструктора. Доктрина без записи здесь видна на странице
   * опыта, но НЕ появляется в Конструкторе (линейные доктрины — Эфиромантия,
   * Телепатия, Магия крови — живут на фикс-заклинаниях, гайд §5).
   *
   * Формат сродств/ограничений: { target, delta } — дельта к цене в ОД.
   *   target: "mod:<ключ модификатора>" | "tech:<ключ техники>"
   * Итоговая цена компонента клампится снизу нулём (Math.max(0, ...)).
   * forbidden: true — компонент недоступен; maxRank/allowedRanks — потолок ранга.
   *
   * Прочие поля доктрины:
   *   ladderShift: N        — сдвиг ступени Лестницы урона (Пиромантия: +1).
   *   ignoresSource: true   — концепция Источника неприменима (Биомантия):
   *                           селект скрыт, move доступна всегда, 5-й ранг модификаторов
   *                           открывается Рангом Доктрины 5 (через обычный maxModCost).
   *   forms: [...]          — доступные физические формы урона (Модификатор form);
   *                           путь переопределяет список целиком.
   *   modifiers: [...]      — доктринные Модификаторы, которыми доктрина владеет;
   *                           у пути список ДОБАВЛЯЕТСЯ к списку доктрины.
   *   paths: {...}          — специализации; доступ покупается талантом
   *                           (AE: system.doctrines.<key>.paths.<path> | Override | 1),
   *                           сборка без пути легальна всегда.
   */
  doctrines: {
    pyromancy: {
      label: "DEDREL.Magic.Doctrines.pyromancy",
      baseDamageType: "heat",
      // Испепеление: ступени Лестницы III–VII — на ступень выше всех прочих доктрин
      ladderShift: 1,
      affinity:    [{ target: "mod:damage", delta: -1 }],
      restriction: [{ target: "mod:accuracy", delta: 1 }],
      // Форм нет: Пиромантия жжёт чистым теплом (модификатор form недоступен)
      forms: [],
      // Поджигание — умолчание: уронное заклинание поджигает цель (состояние burning);
      // v1 — кнопка "Наложить: Горение" в карточке (авто-наложение — вопрос BALANCE.md)
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
      forms: ["bludgeoning"],
      // Контроль Территории: созданные эффекты (стены, ямы) повышают Масштаб
      // Источника для геомантии. v1 — ГМ поднимает уровень источника вручную.
      unique: { territoryControl: true }
    },

    hydromancy: {
      label: "DEDREL.Magic.Doctrines.hydromancy",
      baseDamageType: "",
      forms: ["bludgeoning", "slashing"],
      // Сродства/ограничения по умолчанию отсутствуют — всё в путях
      paths: {
        flow: {
          label: "DEDREL.Magic.Paths.flow",
          affinity: [
            { target: "mod:area_circle", delta: -1 },
            { target: "tech:move", delta: -1 }
          ],
          caps: [{ target: "mod:durability", maxRank: 2 }], // вода не держит форму
          modifiers: ["knockdown"]
        },
        ice: {
          label: "DEDREL.Magic.Paths.ice",
          affinity: [
            { target: "mod:durability", delta: -1 },
            { target: "mod:form", delta: -1 }
          ],
          forms: ["piercing"], // сосульки, ледяные клинки (переопределяет формы воды)
          modifiers: ["constrain"]
        }
      }
    },

    ventomancy: {
      label: "DEDREL.Magic.Doctrines.ventomancy",
      baseDamageType: "",
      // Ветер и звук бьют по площади и по чувствам, а не остриём: прямой урон —
      // не их работа. Налога на "Прочность" нет, потому что доктрина её не
      // касается вовсе — воздух не держит форму и конструктов не создаёт.
      restriction: [
        { target: "mod:damage", delta: 1 },
        { target: "mod:accuracy", delta: 1 }
      ],
      forms: ["slashing"],
      // Доктринные модификаторы доступны любому вентоманту (пути наследуют)
      modifiers: ["knockdown", "dust_veil", "choke"],
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
          // "Длительность" — ниша командных бафов Эха ("Долгая песня"): бард
          // насыщает союзника звуком на 6-10 раундов дешевле прочих доктрин.
          // На "Силу" скидка не влияет: её длительность задана рангом (durationMode).
          affinity: [
            { target: "mod:power", delta: -1 },
            { target: "mod:targets", delta: -1 },
            { target: "mod:duration", delta: -1 }
          ],
          // Психоакустика: "Сила" рангов 1–3 (полный каталог — у Тенемантии),
          // imbue применяется к существам.
          modifiers: ["power"],
          caps: [{ target: "mod:power", allowedRanks: [1, 2, 3] }],
          // Звуковой урон: обычная Лестница II–VI, тип sonic (DR к нему крайне редок)
          special: { psychoacoustics: true, damageType: "sonic" }
        }
      }
    },

    // Телекинез ИЗЪЯТ из Конструктора (решение 2026-07-16): доктрина будет
    // разложена фиксированными заклинаниями/манёврами (роадмап §3.1).

    // --- Сущность ---
    shadowmancy: {
      label: "DEDREL.Magic.Doctrines.shadowmancy",
      baseDamageType: "necrotic",
      // Проклятия висят: скидка на Длительность; урон — со штрафом (ниша дебафера).
      // Области закрыты целиком (хотфикс 2026-07-16): Тень бьёт таргетно.
      affinity:    [{ target: "mod:duration", delta: -1 }],
      restriction: [
        { target: "mod:damage", delta: 1 },
        { target: "mod:area_cone", forbidden: true },
        { target: "mod:area_circle", forbidden: true },
        { target: "mod:area_line", forbidden: true }
      ],
      forms: [],
      // Полный каталог "Силы" принадлежит Тенемантии (Эхо — только ранги 1–3)
      modifiers: ["power"],
      // TODO (роадмап §3.2): modifierOverrides — Прочность → ХП нежити,
      // Форма → тип/облик нежити ("Поднятие"); ждёт механику спавна (NOTES.md).
      // Источник (трупы и тьма) поднимает ГМ макросом "Источники сцены".
      unique: {}
    },

    biomancy: {
      label: "DEDREL.Magic.Doctrines.biomancy",
      baseDamageType: "",
      // Живое тело и есть источник
      ignoresSource: true,
      // Конституция доктрины: прямой урон запрещён целиком (утверждено 2026-07-13).
      // Области закрыты целиком (хотфикс 2026-07-16): Био работает таргетно.
      restriction: [
        { target: "mod:damage", forbidden: true },
        { target: "mod:area_cone", forbidden: true },
        { target: "mod:area_circle", forbidden: true },
        { target: "mod:area_line", forbidden: true },
        // Биомантия не творит плоть из ниоткуда — она перелепливает уже живое
        // (то же основание, что у ignoresSource: тело и есть источник).
        // Остаются: Переместить, Преобразовать, Почуять (искать следы ваяния),
        // Внедрить. Форма и так недоступна — у доктрины пустой список forms.
        { target: "tech:create", forbidden: true }
      ],
      forms: [],
      // Лечение — единственное прямое в системе; Адаптация — временные мутации
      modifiers: ["heal", "adapt"],
      // Биомантия контактна: работает руками, вблизи (правила §7.1 "Касание").
      // Без Пути палитра урезана: Лечение и Адаптация только рангов 1-3 —
      // Путь снимает свой потолок (caps пути мержатся ПОВЕРХ caps доктрины).
      caps: [
        { target: "mod:range", maxRank: 2 },
        { target: "mod:heal", maxRank: 3 },
        { target: "mod:adapt", maxRank: 3 }
      ],
      // Пути (правила 2026-09-11): Врачевание работает С образцом тела, Ваяние — ПРОТИВ
      // него. Отсюда вся разница: Врачевание мгновенно и дотягивается через строй,
      // Ваяние требует касания, часов и ткани донора (ступень расхождения 2,
      // `flags.dedrel.divergence` на предметах адаптаций).
      paths: {
        mending: {
          label: "DEDREL.Magic.Paths.mending",
          affinity: [
            { target: "mod:heal", delta: -1 },
            { target: "mod:targets", delta: -1 }
          ],
          // Снимает потолок Лечения; Адаптация и дальность остаются доктринными
          caps: [{ target: "mod:heal", maxRank: 5 }]
          // TODO (роадмап §3.3 п.5): доктринный модификатор `mend` — снятие
          // физических состояний. Требует нового выхлопа в compile().
        },
        sculpting: {
          label: "DEDREL.Magic.Paths.sculpting",
          affinity: [
            { target: "mod:adapt", delta: -1 },
            { target: "mod:duration", delta: -1 }
          ],
          // Снимает потолок Адаптации, но ужимает дальность до касания
          caps: [
            { target: "mod:adapt", maxRank: 5 },
            { target: "mod:range", maxRank: 1 }
          ],
          // Монополия на длинные касты Ваяния (`_rules/16.1 Rituals.md`);
          // сами длинные касты — фикс-заклинания с is_fixed, не сборка
          special: { longCast: true }
        }
      }
    }
  }
};
