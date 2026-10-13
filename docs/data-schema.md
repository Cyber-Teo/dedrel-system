# ===============================================
# === DEDREL - FOUNDRY V14 DATA SCHEMA ===
# ===============================================
# Этот документ описывает АКТУАЛЬНУЮ структуру данных для системы Dedrel в Foundry VTT v14.
# Все предметы и акторы используют TypeDataModel для строгой типизации.
#
# СТАТУС: Синхронизировано с кодом на 2026-07-09 (аудит: акторы npc/loot, аксессуары,
#         кошельки/экономика, типы существ, полные схемы всех Item-типов)
# ИСТОЧНИК ИСТИНЫ: файлы src/data/ в Dedrel for Foundry v14/

# Важные правила V14:
# 1. Фазы Active Effects: ядро исполняет "initial" (до prepareDerivedData) и "final" (после).
#    Системная фаза "apply" (для system.*-полей) регистрируется в dedrel.mjs и вызывается
#    в DedrelActor#prepareEmbeddedDocuments; хук preCreateActiveEffect проставляет её
#    system.*-изменениям автоматически. См. foundry-v14-quirks.md, раздел 12.
# 2. Вычисляемые параметры (max hp, defenses, initiative) рассчитываются в prepareDerivedData().
# 3. Для Состояний (Conditions) используются V14-нативные `duration: { units, value }` и `expiry_events: []`.
# 4. Массивы примитивов ОБЯЗАНЫ использовать `ArrayField(StringField())` — иначе Foundry превратит `[]` в `{}`.
# 5. Группы чекбоксов реализуются через SchemaField с BooleanField, НЕ через ArrayField.

# ===============================================
# --- ACTOR DATA MODEL: character ---
# Файл: src/data/actors/character.mjs
# ===============================================
type: "character"
system:
  # 1. Родословные (Bloodlines)
  bloodlines:
    human: { rank: 1 }  # min: 0, max: не ограничен в DataModel (лимит в UI)
    demon: { rank: 1 }
    dragon: { rank: 1 }
    fay: { rank: 1 }
    elf: { rank: 1 }

  # 2. Основные характеристики (Attributes)
  attributes:
    int: { rank: 1, save_bonus: 0 }  # min: 0
    dex: { rank: 1, save_bonus: 0 }
    log: { rank: 1, save_bonus: 0 }
    rea: { rank: 1, save_bonus: 0 }
    str: { rank: 1, save_bonus: 0 }
    will: { rank: 1, save_bonus: 0 }
    con: { rank: 1, save_bonus: 0 }
    luck: { rank: 1, save_bonus: 0 }
    cha: { rank: 1, save_bonus: 0 }

  # 3. Навыки (Skills) — ПЛОСКАЯ СТРУКТУРА (без вложенных категорий)
  # Категории (combat/intellectual/practical/social) существуют ТОЛЬКО в UI (_prepareContext),
  # а в DataModel навыки хранятся единым плоским списком.
  skills:
    # rank — уровень тренировки (min: 0 → AE-штрафы клампятся в 0, в минус НЕ уходят).
    # bonus — модификатор броска БЕЗ нижней границы; применяется и к проверкам навыка,
    #   и к атакам оружием/заклинаниями (src/chat.mjs передаёт skillId в бросок атаки).
    # ⚠ Для штрафов/бонусов к броску всегда используйте bonus, а не rank (см. effect-keys.md §1.5).
    # Боевые
    crossbows: { rank: 0, specialization: "", bonus: 0 }
    unarmed_combat: { rank: 0, specialization: "", bonus: 0 }
    pole_weapons: { rank: 0, specialization: "", bonus: 0 }
    blunt_weapons: { rank: 0, specialization: "", bonus: 0 }
    artillery: { rank: 0, specialization: "", bonus: 0 }
    firearms: { rank: 0, specialization: "", bonus: 0 }
    throwing: { rank: 0, specialization: "", bonus: 0 }
    exotic_weapons: { rank: 0, specialization: "", bonus: 0 }
    magical_attacks: { rank: 0, specialization: "", bonus: 0 }
    bows: { rank: 0, specialization: "", bonus: 0 }
    bladed_weapons: { rank: 0, specialization: "", bonus: 0 }
    armor_use: { rank: 0, specialization: "", bonus: 0 }
    # Интеллектуальные
    cultural_awareness: { rank: 0, specialization: "", bonus: 0 }
    knowledge: { rank: 0, specialization: "", bonus: 0 }
    logic_reasoning: { rank: 0, specialization: "", bonus: 0 }
    interpretation: { rank: 0, specialization: "", bonus: 0 }
    research: { rank: 0, specialization: "", bonus: 0 }
    # Практические
    craftsmanship: { rank: 0, specialization: "", bonus: 0 }
    stealth: { rank: 0, specialization: "", bonus: 0 }
    thievery: { rank: 0, specialization: "", bonus: 0 }
    healing: { rank: 0, specialization: "", bonus: 0 }
    survival: { rank: 0, specialization: "", bonus: 0 }
    engineering: { rank: 0, specialization: "", bonus: 0 }
    atletism: { rank: 0, specialization: "", bonus: 0 }
    perception: { rank: 0, specialization: "", bonus: 0 }
    # Социальные
    persuasion: { rank: 0, specialization: "", bonus: 0 }
    insight: { rank: 0, specialization: "", bonus: 0 }
    deception: { rank: 0, specialization: "", bonus: 0 }
    intimidation: { rank: 0, specialization: "", bonus: 0 }
    performance: { rank: 0, specialization: "", bonus: 0 }

  # 4. Ресурсы
  resources:
    hp: { value: 10, temp: 0, max: 10 }          # max = Derived: ceil((con.rank + will.rank/2) * 10)
    wounds: { level: 1, penalty: 0 }              # Derived from HP %
    ap_universal: { value: 0, max: 0 }            # max = Derived
    ap_maneuver: { value: 0, max: 0 }             # max = Derived
    ap_magic: { value: 0, max: 0 }                # max = Derived
    luck_points: { value: 0, max: 0 }             # max = Derived: luck.rank
    movement: { value: 0, max: 0 }                # МЕТРЫ (не integer). max = Derived: (2 + dex.rank) * 2

  # 4.5. Чувства (Senses)
  senses:
    darkvision: 0    # Радиус темновидения в гексах/футах. Автоматически синхронизируется с Token.visionMode

  # 4.6. Доктрины (Магический Конструктор). 18 ключей, канон: _rules/16. Magic.md.
  # Правила/группы/лимиты — CONFIG.DEDREL.magic (src/config/magic.mjs).
  # rank: source-значение, покупается за XP на странице опыта (экшн upgradeDoctrine);
  #       таланты доступа обычно добавляют +1 через Active Effect (Add, фаза apply).
  # unlocked: доступ к доктрине; выдаёт талант через AE (Override 1). Без него
  #       доктрина не видна на странице опыта и недоступна в Конструкторе.
  # paths.<key>: купленные Пути-специализации (только у двухпутёвых доктрин;
  #       hydromancy: flow|ice, ventomancy: squall|echo). Доступ к Пути открывает
  #       талант через AE (system.doctrines.<d>.paths.<p> | Override | 1).
  #       Переключаемой «стойки» active_path больше нет (реворк 2026-07):
  #       путь выбирается при сборке, при касте проверяется лишь изученность.
  doctrines:
    # Материя
    geomancy:   { rank: 0, unlocked: 0 }
    hydromancy: { rank: 0, unlocked: 0, paths: { flow: 0, ice: 0 } }
    pyromancy:  { rank: 0, unlocked: 0 }
    ventomancy: { rank: 0, unlocked: 0, paths: { squall: 0, echo: 0 } }
    # Сущность
    biomancy:     { rank: 0, unlocked: 0 }
    shadowmancy:  { rank: 0, unlocked: 0 }
    aetheromancy: { rank: 0, unlocked: 0 }
    # Беспредельное
    electromancy:  { rank: 0, unlocked: 0 }
    temporalmancy: { rank: 0, unlocked: 0 }
    astralomancy:  { rank: 0, unlocked: 0 }
    aether_song:   { rank: 0, unlocked: 0 }
    # Врождённая магия
    blood_magic:   { rank: 0, unlocked: 0 }
    chaos_magic:   { rank: 0, unlocked: 0 }
    shapeshifting: { rank: 0, unlocked: 0 }
    feral_magic:   { rank: 0, unlocked: 0 }
    # Псионика
    telekinesis: { rank: 0, unlocked: 0 }
    telepathy:   { rank: 0, unlocked: 0 }
    zero:        { rank: 0, unlocked: 0 }

  # 4.7. Известные Магические Техники (выдаются талантами через AE: Override 1)
  magic:
    techniques: { create: 0, move: 0, transform: 0, sense: 0, imbue: 0 }

  # 5. Защиты (Derived — рассчитываются в prepareDerivedData)
  defenses:
    block: 0     # Derived: floor(str.rank + rea.rank/2) + 8
    dodge: 0     # Derived: floor(dex.rank + rea.rank/2) + 8
    mdef: 0      # Derived: floor(max(int.rank, log.rank) + will.rank/2) + 8

  # 6. Слоты экипировки (общие для character и npc — buildEquipmentSlots в shared-schema.mjs)
  equipment_slots:
    main_hand: { item_id: "", type: "weapon" }
    off_hand: { item_id: "", type: "shield" }
    tail: { item_id: "", type: "" }        # слот хвоста; доступен при мутации с key, содержащим "tail"
    armor_upper: { item_id: "", type: "armor" }
    armor_middle: { item_id: "", type: "armor" }
    armor_lower: { item_id: "", type: "armor" }
    magic_item_1: { item_id: "", type: "magic_item" }
    magic_item_2: { item_id: "", type: "magic_item" }
    ammo: { item_id: "", type: "loot" }
    # Слоты аксессуаров (drag-n-drop экипировка). Предмет попадает в слот по
    # совпадению своего system.equip_slot с типом слота (head/neck/torso/hand,
    # см. ACCESSORY_SLOT_TYPES в constants.mjs). Transfer-эффекты аксессуара
    # действуют ТОЛЬКО пока он в слоте (DedrelActor#allApplicableEffects).
    head: { item_id: "", type: "head" }
    neck: { item_id: "", type: "neck" }
    torso: { item_id: "", type: "torso" }
    acc_left_1: { item_id: "", type: "hand" }
    acc_left_2: { item_id: "", type: "hand" }
    acc_right_1: { item_id: "", type: "hand" }
    acc_right_2: { item_id: "", type: "hand" }
    acc_tail: { item_id: "", type: "hand" }  # требует мутацию хвоста (как слот tail)

  # 7. Инициатива (Derived: max(int.rank, rea.rank))
  initiative: 0

  # 7.5. Кошелёк (мультивалютность)
  # Счётчики монет по ключам валют мира (настройка "currencies", меню CurrencyConfigApp).
  # Свободные ключи (ObjectField) — список валют динамический. Утилиты: src/utils/currency.mjs.
  currency: {}                 # { copper: 0, silver: 0, gold: 0, platinum: 0, ... }
  can_receive_currency: true   # показывать ли актора в списках получателей перевода денег

  # 8. Детали персонажа
  details:
    xp: 0
    level: 1
    biography: ""  # HTMLField

  # 9. Системные Бонусы (Вынесены в bonuses-schema.mjs; общие для character и npc)
  # Здесь только ПОСТОЯННЫЕ безусловные бонусы (работают и для бросков без предмета).
  bonuses:
    global_roll: 0           # Штраф = отрицательное значение (формула броска вычитает)
    global_skill: 0          # Штраф = отрицательное значение
    global_save: 0           # Штраф = отрицательное значение
    global_ap_discount: 0
    global_ap_penalty: 0     # Наценка на ОД (манёвры И заклинания стоят дороже на N)
    maneuver_ap_penalty: 0   # Наценка на ОД только для манёвров
    spell_ap_penalty: 0      # Наценка на ОД только для заклинаний
    ignore_wound_penalty: 0  # Флаг-переключатель: > 0 — штраф за ранения (wounds.penalty) обнуляется, уровень ранения сохраняется. Эффекты пишут Add 1, источники складываются.
    infinite_explode: 0      # Флаг: > 0 — d10 проверок взрывается бесконечно (x10 вместо xo10)
    damage_explode: 0        # Флаг: > 0 — кубики урона взрываются один раз (модификатор xo)
    hp_multiplier: 0         # Множитель max ХП: 0.25 = +25% (применяется после формулы)
    carry_capacity_mult: 0   # Множитель порогов переноса: 0.5 = +50% ко всем порогам
    carry_capacity_flat: 0   # Плоская прибавка к порогам переноса (кг)
    ignore_encumbrance_penalty: 0  # Флаг: > 0 — иммунитет к штрафам перегрузки (вес/категория всё равно считаются)
  # Одноразовые/условные бонусы «на следующий манёвр» (бывшие next_*) реализованы
  # через DSL на ключе Active Effect "flags.dedrel.mod" (движок: src/utils/dedrel-bonuses.mjs).
  # Формат: "ap_set:0; filter:ranged; consume:use". Операции: ap_set, ap_discount, attack, damage,
  # pierce (бронебойность урона: складывается с armor_piercing оружия, единица = -10% DR цели),
  # dice_step:N (сдвиг БАЗОВОЙ формулы урона по лестнице 1d4→1d6→2d4→2d6→2d8→3d6;
  # N может быть отрицательным — нерф; движок: src/utils/dice-ladder.mjs, CONFIG.DEDREL.diceLadder).
  # Параметры: filter (any/melee/ranged/shield/skill:<key>/key:<key>/dtype:<type>,
  # для заклинаний Конструктора — doctrine:<key>/tech:<key>/mod:<key>; OR через "|"),
  # consume (use/roll/damage/never). Эффект не сгорает при несовпадении фильтра.
  # Шаблонные self-эффекты предметов: флаг эффекта "flags.dedrel.applyTo" = "self",
  # плейсхолдеры @spentAp / @apCost / @overspent в значениях changes.
  # Полный справочник: effect-keys.md (разделы 2.2, 2.3), рецепты: system-macros.md.

  # 10. DR — поле схемы (10 типов, buildDR в shared-schema.mjs): база правится
  # эффектами/вручную, вклад экипированной брони суммируется в prepareDerivedData.
  dr: { slashing: 0, piercing: 0, bludgeoning: 0, heat: 0, cold: 0, necrotic: 0, radiant: 0, electric: 0, sonic: 0, acid: 0 }

  # 11. Производные ад-хок поля (НЕ в схеме, живут только на подготовленной модели;
  # в _source не пишутся, миграция не нужна):
  # wallet: { total_base, weight }   — суммарная ценность и вес монет кошелька
  # resources.encumbrance: { total, category, thresholds{light,medium,heavy}, immune, rollPenalty }
  #                                  — перегрузка (категории light/medium/heavy/overloaded;
  #                                    штрафы: -1/-3 к броскам через bonuses.global_roll,
  #                                    -2м скорости / полная остановка)
  # armor_penalty: boolean           — штраф за недостаточный навык ношения доспехов
  #                                    (тяжёлая броня: armor_use < 4; средняя: < 2 → -2 иниц., -4м скорости)


# ===============================================
# --- ACTOR DATA MODEL: npc ---
# Файл: src/data/actors/npc.mjs
# ===============================================
# NPC/Монстр. Один тип с полем tier: peon (массовка, здоровье в «попаданиях») |
# boss (соло-угроза, обычное HP). Переиспользует боевые структуры персонажа
# (shared-schema.mjs): attributes, skills, defenses, dr, equipment_slots,
# bonuses, doctrines, magic — структуры идентичны character (см. выше).
# Способности носятся как обычные Item'ы и работают через тот же item.use().
type: "npc"
system:
  tier: "peon"               # "peon" | "boss"

  attributes: {}             # = character (9 атрибутов, rank + save_bonus)
  skills: {}                 # = character (плоский список 28 навыков)
  defenses: {}               # = character (block/dodge/mdef, Derived)
  dr: {}                     # = character (10 типов)
  equipment_slots: {}        # = character (включая аксессуары)
  bonuses: {}                # = character (bonuses-schema.mjs)
  doctrines: {}              # = character (18 доктрин; ранги выставляются вручную)
  magic: { techniques: {} }  # = character (5 техник)

  resources:
    hp: { value: 10, temp: 0, max: 10 }   # здоровье БОССА; max = Derived / override
    hits: { value: 2, max: 2 }            # здоровье ПЕОНА в «попаданиях» (max min: 1)
    ap_universal: { value: 0, max: 0 }    # ЕДИНЫЙ пул ОД: платит и манёвры, и заклинания
                                          # (ap_maneuver/ap_magic у NPC НЕТ — item.use()
                                          #  автоматически списывает с универсального)
    movement: { value: 0, max: 0 }        # МЕТРЫ (не integer). max = Derived: (2 + dex.rank) * 2 / override
    wounds: { level: 1, penalty: 0 }      # Derived: пеон — от hits, босс — от hp

  # Порог прочности пеона: попадание снимает 1 хит, только если урон ПОСЛЕ DR >= toughness
  toughness: 0

  # Ручные переопределения производных (null = считать по формуле)
  overrides:
    ap_max: null
    movement_max: null
    hp_max: null

  senses: { darkvision: 0 }
  initiative: 0              # Derived: max(int.rank, rea.rank)
  details:
    threat: ""               # текстовая метка уровня угрозы
    biography: ""            # HTMLField


# ===============================================
# --- ACTOR DATA MODEL: loot ---
# Файл: src/data/actors/loot.mjs
# ===============================================
# Лут/Торговец/Контейнер. Один тип с режимами (mode). Сделки исполняет
# socket-брокер DedrelSocket (src/socket.mjs) на клиенте активного ГМа;
# цены считает DedrelCurrency (src/utils/currency.mjs).
type: "loot"
system:
  mode: "loot"               # "loot" (свободный забор) | "merchant" (торговец) | "container" (сундук/сумка)
  description: ""            # HTMLField

  currency: {}               # кошелёк — как у character
  can_receive_currency: false  # по умолчанию НЕ показывать в получателях переводов

  # Экономика торговца (mode: merchant)
  buy_modifier_pct: 0        # +наценка / -скидка к базовой цене при покупке игроком
  can_sell_to: true          # принимает ли продажу от игроков
  sell_price_pct: 50         # % базовой цены при скупке у игрока (min: 0)
  infinite_funds: false      # безлимитная казна при скупке
  personal_discounts: {}     # ObjectField: { <userId>: процент скидки }
  loot_tables: []            # ArrayField(StringField): uuid или имена RollTable для генерации стока

  # Контейнер (mode: container)
  capacity: 0                # макс. нагрузка (кг); 0 = без лимита. Превышение блокирует
                             # добавление предмета/монет (хуки preCreateItem/preUpdateActor
                             # в loot-sheet.mjs). Привязка к персонажу — предметом-ссылкой
                             # с flags.dedrel.linkedActorUuid (см. раздел флагов ниже).

  # Производные ад-хок: wallet { total_base, weight }, load (кг, вес предметов + монет)


# ===============================================
# --- ITEM DATA MODELS ---
# ===============================================
# Зарегистрированные типы (system.json → documentTypes.Item):
#   currency, loot, trade_good, potion, scroll, craft_material, quest_item, service,
#   mutilation, countryoforigin, mutation, talent, maneuver, weapon, armor, magic_item,
#   exp, condition, ammunition, spell, creature_type
#
# НЕ РЕАЛИЗОВАННЫЕ типы (есть в правилах, но НЕТ в коде):
#   ritual, doctrine — НЕ ПЛАНИРУЮТСЯ на текущем этапе
#   (доктрины — НЕ Item: они живут полями актора system.doctrines.*, см. выше)
#
# --- КОНВЕНЦИЯ КЛЮЧЕЙ (system.key) ---
# Ключ всегда snake_case и только латиница: [a-z0-9_]. Кириллица живёт в name
# и описаниях. Префикс отвечает на вопрос «что это», чтобы ключ читался без
# открытия карточки, а дубликаты между типами не сливались в один файл экспорта.
#
#   Тип         | Префикс          | Пример
#   ------------|------------------|--------------------------------
#   maneuver    | maneuver_        | maneuver_feint_attack
#   condition   | БЕЗ префикса     | entangled   (ключ служит id статуса)
#   potion      | potion_          | potion_healing_common
#   scroll      | scroll_          | scroll_stone_skin
#   magic_item  | mi_ | seal_      | mi_wizard_hat / seal_guard
#               | effectlib_       | effectlib_torch — ТЕХНИЧЕСКИЙ носитель
#               |                  | из пака dedrel.active_effects, не предмет
#   talent, mutation, spell, craft_material, weapon, armor — без префикса
#
# Редкость/ступень пишется СУФФИКСОМ, а не префиксом (potion_healing_common,
# seal_explosive_lesser): так вся линейка предмета стоит рядом при сортировке.
# У magic_item три легальных префикса: mi_ — чудесная вещь, seal_ — печать
# Начертания (INSCRIPTION_PLAN.md §2), effectlib_ — носитель библиотеки эффектов.
# Тип один, ниши разные.
#
# Проверяет конвенцию data_validation_macro.js (WARN на нарушение префикса,
# ERROR на пустой ключ, не-snake_case и дубликаты). Пустой ключ обязателен
# к заполнению у типов: talent, mutation, maneuver, condition, spell, potion,
# scroll, magic_item.
#
# ВАЖНО при переименовании: ключи ищутся не только в adds_items и
# chain_trigger_maneuvers, но и в DSL-строках flags.dedrel.mod (filter:key:...),
# в spell_key, req_weapon_keys — и в копиях предметов НА АКТОРАХ.
# См. effect-keys.md §2.2 (прецедент молчаливо сломанного фильтра).

# -----------------------------------------------
# Item Type: maneuver
# Файл: src/data/items/maneuver.mjs
# -----------------------------------------------
type: "maneuver"
system:
  description: ""             # HTMLField
  key: ""                     # Системный идентификатор (snake_case)
  source: "basic"             # "basic" | "talent" | "mutation"

  # ВНИМАНИЕ: action_type — это SchemaField с BooleanField, НЕ массив!
  # Миграция из массива в объект реализована в ManeuverDataModel.migrateData()
  action_type:
    action: false
    reaction: false
    free: false
    chain: false

  chain_trigger_text: ""
  chain_trigger_maneuvers: []  # ArrayField(StringField) — имена/ключи манёвров-триггеров;
                               # спец-значение "any" — цепь срабатывает после ЛЮБОГО
                               # манёвра (chain-maneuvers-hud.mjs, isAny)

  ap_cost: 0
  is_variable_cost: false
  variable_cost_max: 0
  is_reload_action: false   # Манёвр-перезарядка: заряжает выбранное перезаряжаемое оружие
                            # (loaded=true), цену ОД берёт из оружия (reload_cost), боеприпас
                            # не тратит и не блокируется состоянием заряда. См. maneuver_reload
  is_scroll_read: false     # Манёвр чтения свитка (16. Magic §10): диалог предлагает выбрать
                            # свиток из инвентаря, цена ОД — system.ap_cost выбранного свитка
                            # (производная от редкости), оплата ТОЛЬКО универсальными ОД,
                            # каст вшитого заклинания + расход свитка. См. maneuver_read_scroll

  uses_value: 0
  uses_max: "0"               # StringField — может содержать формулу
  uses_per: ""                # "short_rest" | "long_rest" | "day" | ""

  # Требования к оружию — SchemaField с BooleanField.
  # СЕМАНТИКА (src/documents/item.mjs, Item#use): ВНУТРИ каждой категории
  # (тип оружия / тип урона / свойства / req_weapon_keys) достаточно ЛЮБОЙ
  # из отмеченных галочек (ИЛИ); МЕЖДУ категориями — «И» (оружие должно пройти
  # каждую заполненную категорию). is_twohanded в свойствах — требование
  # двуручного ХВАТА: истинно двуручное проходит всегда, вариативный хват
  # (is_variable_grip) — при свободной второй руке (src/utils/grip.mjs).
  req_weapon_type:
    melee: false
    ranged: false
    shield: false
  req_weapon_damage_type:
    piercing: false
    bludgeoning: false
    slashing: false
  req_weapon_skill_group: "any"
  req_weapon_property:
    is_auxiliary: false
    is_fast: false
    is_slow: false
    is_twohanded: false
    is_thrown: false
    is_reloading: false
    is_variable_grip: false
    is_paired: false          # парное оружие (катары/когти): занимает обе руки,
                              # но двуручным ХВАТОМ не считается (см. grip.mjs)
  req_weapon_keys: []       # ArrayField(StringField) — гейт по КОНКРЕТНОМУ оружию:
                            # подстроки, ищутся в system.key И имени оружия без регистра,
                            # достаточно совпадения одной (OR). Пример: ["greatsword"]
                            # пускает и "adamantine_greatsword", и «Адамантиновый двуручный меч».
                            # На листе вводится строкой через ";" (как chain_trigger_maneuvers).
  attack_bonus: 0           # NumberField — вшитый бонус к броску атаки манёвра (читается
                            # в src/dice/roll.mjs, как «Точность» у заклинаний). Для манёвров
                            # со встроенным прицеливанием («Выстрел с упора») — без статусов.
  weapon_dice_step: 0       # NumberField — собственный сдвиг урона манёвра по Лестнице
                            # кубов (1d4→1d6→2d4→2d6→2d8→3d6): бросок урона с карточки
                            # манёвра двигает кубы оружия на N ступеней (N<0 — нерф).
                            # Складывается с DSL-модами dice_step (см. flags.dedrel.mod)
                            # и +1 двуручного хвата, но СУММАРНЫЙ ПОДЪЁМ капится на +1
                            # ступень («правило одной ступени», см. _rules/13. Weapons.md);
                            # сдвиг вниз не ограничен.
                            # Пример: Стальная инерция = 1 (бьёт двуручом на ступень выше).

  prerequisites_text: ""
  prerequisites_attributes: []   # ArrayField(StringField) — формат: "str 3"
  prerequisites_skills: []       # ArrayField(StringField) — формат: "bladed_weapons 2"
  prerequisites_talents: []      # ArrayField(StringField) — имена талантов
  prerequisites_mutations: []    # ArrayField(StringField) — имена мутаций
  prerequisites_bloodlines: []   # ArrayField(StringField) — формат: "Human", "3"
  # Логика проверки (src/utils/prerequisites.mjs, checkPrerequisites):
  #  - элементы одного массива объединяются по И;
  #  - внутри элемента `|` задаёт альтернативы по ИЛИ (в пределах одного типа):
  #      "@attributes.log.rank 3 | @attributes.int.rank 3"
  #  - для атрибутов/навыков принимаются обе записи: "str 3" и "@attributes.str.rank 3";
  #  - таланты/мутации ищутся по system.key ИЛИ по отображаемому имени;
  #  - при невыполнении требований дроп на лист не блокируется жёстко —
  #    Мастер подтверждает добавление через DialogV2.confirm.

  target_type: "creature"    # "self" | "creature" | "point" | "area"
  target_range: ""
  target_value: 1
  template_shape: ""         # "" | "square" | "circle" | "cone" | "line"
  template_size: 0

  formula_attack: ""
  formula_damage: ""
  formula_heal: ""
  formula_temp_hp: ""        # Выдача временных хитов: число, дайсы или "N%" от макс. ХП цели; складываются, сгорают на отдыхе
  formula_custom: ""
  save_attribute: ""         # "" | "int" | "dex" | "str" | etc.
  save_dc_formula: ""
  forbidden_defense: ""
  hide_combat_buttons: false # Если true, в чате не выводятся кнопки Атаки и Урона
  on_use_macro: ""

# -----------------------------------------------
# Item Type: spell (собранное заклинание Магического Конструктора)
# Файл: src/data/items/spell.mjs
# -----------------------------------------------
# Схема = manеuver-совместимое ядро (питает конвейер use()/чата) + блок Конструктора.
# Конструктор — «компилятор»: хранит исходник сборки (doctrine, chosen_*) И пишет
# скомпилированные исполняемые поля (ap_cost, formula_damage, template_* и т.д.).
# Трата ОД: сначала ap_magic, добор из ap_universal (item.mjs use()).
type: "spell"
system:
  description: ""             # HTMLField
  key: ""
  source: "basic"

  # --- Исходник сборки (Магический Конструктор) ---
  doctrine: ""                # ключ доктрины (pyromancy, geomancy, ... — 18 ключей)
  doctrine_rank_req: 0        # мин. ранг доктрины для каста (ре-валидация при use())
  is_fixed: false             # фиксированное заклинание доктрины: сборки Конструктора нет,
                              #   при касте проверяется ТОЛЬКО Ранг Доктрины. Обязателен для
                              #   длинных кастов Тенемантии/Биомантии — без него ре-валидация
                              #   прогонит пустую сборку и завалит каст на no_techniques.
                              #   Линейным доктринам (Эфиромантия и пр.) не нужен: их нет
                              #   в конфиге Конструктора, проверка обрывается сама.
  doctrine_path: ""           # путь, с которым собрано ("flow", "echo", ...)
  source_scale: "none"        # none | any | abundant
  chosen_techniques: []       # ArrayField(StringField): ["create", "imbue"]
  chosen_modifiers: []        # ArrayField(SchemaField): [{ key, rank, ap, option }]
                              #   ap — цена ПОСЛЕ сродств/ограничений;
                              #   option — выбор внутри ранга: "bonus"/"penalty"/ключ состояния
  total_cost_breakdown: ""    # человекочитаемая расшифровка стоимости (для карточки)

  # --- Скомпилированные исполняемые поля (пишет Конструктор) ---
  skill: ""                   # навык броска атаки; конструктор ставит "magical_attacks"
  attack_bonus: 0             # Модификатор "Точность" (учитывается в chat.mjs rollAttack)

  # --- Manеuver-совместимое ядро (тот же конвейер, что у манёвров) ---
  action_type: { action: false, reaction: false, free: false, chain: false }
  chain_trigger_text: ""
  chain_trigger_maneuvers: []
  ap_cost: 0                  # итоговая стоимость в ОД Магии
  is_variable_cost: false
  variable_cost_max: 0
  uses_value: 0
  uses_max: "0"
  uses_per: ""
  req_weapon_type: { melee: false, ranged: false, shield: false, magic: false }
                              # magic: true — требуется фокус (напр., муз. инструмент Пути Эха)
  req_weapon_damage_type: { piercing: false, bludgeoning: false, slashing: false }
  req_weapon_skill_group: "any"
  req_weapon_property: { is_auxiliary: false, is_fast: false, is_slow: false, is_twohanded: false, is_thrown: false, is_reloading: false, is_variable_grip: false }
  prerequisites_text: ""
  prerequisites_attributes: []
  prerequisites_skills: []
  prerequisites_talents: []
  prerequisites_mutations: []
  prerequisites_bloodlines: []
  target_type: "creature"
  target_range: ""
  target_value: 1
  template_shape: ""          # "" | circle | cone | ray (Области Модификаторов Масштаба)
  template_size: 0
  formula_attack: ""
  formula_damage: ""          # "4d6[heat]" — тип урона в скобках, парсится в chat.mjs
  formula_heal: ""
  formula_temp_hp: ""        # Выдача временных хитов: число, дайсы или "N%" от макс. ХП цели; складываются, сгорают на отдыхе
  formula_custom: ""
  save_attribute: ""
  save_dc_formula: ""         # Сложность спасброска Модификатора "Сила" (10/12/14/16/18)
  forbidden_defense: ""
  on_use_macro: ""

# -----------------------------------------------
# Item Type: talent
# Файл: src/data/items/talent.mjs
# -----------------------------------------------
type: "talent"
system:
  description: ""           # HTMLField
  key: ""
  subtype: "passive"        # "passive" | "narrative" | "active"
  xp_cost: 0

  has_situational_bonus: false  # BooleanField: талант показывается подсказкой в диалоге
                                # броска (текст условия берётся из description)

  prerequisites_text: ""
  prerequisites_attributes: []
  prerequisites_skills: []
  prerequisites_talents: []
  prerequisites_mutations: []
  prerequisites_bloodlines: []

  uses_value: 0
  uses_max: ""              # StringField — может содержать формулу
  uses_per: ""

  adds_items: []            # ArrayField(StringField) — имена/ключи предметов из компендиумов;
                            # добавленные предметы получают flags.dedrel.parentItemId и
                            # удаляются вместе с талантом (см. DedrelItem._onCreate/_onDelete)
  formula_heal: ""
  formula_temp_hp: ""        # Выдача временных хитов: число, дайсы или "N%" от макс. ХП цели; складываются, сгорают на отдыхе
  on_add_macro: ""
  on_use_macro: ""

# -----------------------------------------------
# Item Type: mutation
# Файл: src/data/items/mutation.mjs
# -----------------------------------------------
type: "mutation"
system:
  description: ""           # HTMLField
  key: ""
  mutation_type: "useful"   # "useful" | "neutral" | "harmful"
  starting: false           # Стартовая мутация при создании персонажа
  subtype: "passive"        # "passive" | "narrative" | "active"
  xp_cost: 0

  has_situational_bonus: false  # BooleanField (как у talent)

  prerequisites_text: ""
  prerequisites_attributes: []
  prerequisites_skills: []
  prerequisites_talents: []
  prerequisites_mutations: []
  prerequisites_bloodlines: []

  uses_value: 0
  uses_max: ""
  uses_per: ""

  adds_items: []
  on_add_macro: ""

# -----------------------------------------------
# Item Type: condition
# Файл: src/data/items/condition.mjs
# -----------------------------------------------
type: "condition"
system:
  description: ""           # HTMLField
  key: ""                   # Системный идентификатор (StringField)
  category: "negative"      # "negative" | "neutral" | "positive" | "technical"
  is_technical: false
  stackable: false          # Повторное наложение добавляет стак: ЛКМ в HUD токена +1, ПКМ -1 (см. src/apps/token-hud.mjs)
  max_stacks: 1             # Лимит стаков. Счётчик живёт на ActiveEffect во flags.dedrel.stacks; ADD-изменения умножаются на число стаков
  refresh_on_stack: false   # true — новый стак сбрасывает таймер длительности; false — длительность идёт от первого наложения

  tick:                     # Периодический урон/лечение в бою (DedrelCombat#_onStartTurn/_onEndTurn, src/combat.mjs)
    formula: ""             # Формула за тик, поддерживает @stacks: "(@stacks)d4" — дайс за каждый стак, "2 * @stacks" — плоско; пустая — тика нет
    is_heal: false          # true — формула лечит (кап по max ХП, DR не применяется)
    damage_type: ""         # Ключ system.dr ("heat", "acid"...) для снижения урона; "" — чистый урон; при is_heal игнорируется
    trigger: "turnStart"    # "turnStart" | "turnEnd"

  duration:
    units: "rounds"         # "rounds" | "turns" | "seconds" | "minutes" | "hours" | "days" | "permanent"
    value: 1
  expiry_events: ["turnEnd"]  # ArrayField(StringField)

  application_text: ""
  removal_text: ""
  system_flags: {}          # ObjectField для произвольных данных

# Флаг вне схемы (условия Модификатора «Адаптация» Биомантии):
# flags.dedrel.rank: 1..5   # ранг черты. Селект Конструктора показывает ТОЛЬКО предметы
#                           # ранга, равного рангу Модификатора (spell-constructor.mjs
#                           # #packOptions ← optionsFromPack). Условие БЕЗ этого флага
#                           # не появится в селекте Адаптации никогда.
#                           # Паки: dedrel.biomancy_adaptations (полезные черты),
#                           # dedrel.mutilations (увечья, на несогласную цель со спасброском).
#                           # Оба входят в CONDITION_PACKS (dedrel.mjs), поэтому попадают
#                           # в CONFIG.statusEffects и накладываются кнопкой карточки.

# -----------------------------------------------
# ОБЩИЙ БЛОК: system.crafting — встроенный «чертёж» (craftingFields,
# src/data/items/_crafting.mjs). Есть у ВСЕХ физических типов: weapon, armor,
# ammunition, magic_item, loot, trade_good, potion, scroll, craft_material,
# quest_item. Решение плана крафта §2.1: состав и наценка живут на самом
# предмете-продукте; item type recipe (будет) — тонкое «знание», генерируется.
# На листе — отдельная вкладка «Крафт», видна ТОЛЬКО ГМу (item-crafting.hbs /
# details-crafting.hbs, context.showCrafting).
# -----------------------------------------------
# crafting:
#   craftable: false        # предмет создаётся крафтом (гейт рецептов/цен)
#   discipline: ""          # choices: "", alchemy, smithing, inscription, tailoring,
#                           # carpentry, jewelry, engineering (CRAFT_DISCIPLINE_ENUM)
#   ingredients: []         # [{ uuid, name, amount }] — uuid компендиумный,
#                           # name — fallback; заполняется drag&drop на листе
#   markup_pct: 50          # наценка в % к себестоимости
#   cost_price: 0           # себестоимость — ЗАПЕКАЕТСЯ кнопкой «Пересчитать цену»
#                           # (base_price = cost_price × (1 + markup_pct/100));
#                           # вручную не правится
#   output_quantity: 1      # выход за один цикл крафта (3 склянки и т.п.)
#   time_override: 0        # явные часы; 0 = стандартное время по редкости

# -----------------------------------------------
# Item Type: weapon
# Файл: src/data/items/weapon.mjs
# -----------------------------------------------
type: "weapon"
system:
  description: ""           # HTMLField
  key: ""
  # Физические поля (physicalItemFields, src/data/items/_physical.mjs)
  rarity: "common"          # choices: common, uncommon, rare, very_rare, legendary (ITEM_RARITY_ENUM)
  weight: 0
  base_price: 0
  # + общий блок crafting (см. выше)

  weapon_type:              # SchemaField — тип оружия
    melee: false
    ranged: false
    shield: false
    magic: false            # магический фокус (посох/жезл) — требуется заклинаниям
  damage_type:              # SchemaField — тип урона
    piercing: false
    bludgeoning: false
    slashing: false
  skill: ""                 # Ключ навыка: "bladed_weapons", "bows", etc.
  damage_formula: ""        # БАЗОВАЯ формула ("1d6+2") — фолбэк для типов без своей формулы
  damage_formulas:          # Формулы урона ПО ТИПАМ. Манёвр с req_weapon_damage_type
    slashing: ""            # берёт формулу своего типа; пустая строка = damage_formula.
    piercing: ""            # Пример (глефа): slashing "1d8", piercing "1d4" — выбор
    bludgeoning: ""         # режима удара делается выбором манёвра (Взмах/Выпад/Удар).
  formula_heal: ""
  formula_temp_hp: ""        # Выдача временных хитов: число, дайсы или "N%" от макс. ХП цели; складываются, сгорают на отдыхе
  equipped: false           # ВАЖНО: transfer-эффекты оружия действуют ТОЛЬКО пока
                            # equipped (DedrelActor#allApplicableEffects); фильтр
                            # оружия в item.use() тоже требует equipped
  range: ""

  # Свойства-«галочки» на листе оружия живут ПЛОСКО (is_*), НЕ в properties!
  # По ним же гейтятся манёвры (req_weapon_property). is_enchanted УДАЛЁН.
  is_auxiliary: false
  is_fast: false            # Темп: −1 ОД на атакующие реакции (Рипост, Карающий промах,
                            # Атака по возможности, Упреждающий укол), пока оружие
                            # экипировано. Считает движок, не эффекты:
                            # DedrelBonuses.applyWeaponTempo, список манёвров —
                            # TEMPO_MANEUVERS в dedrel-bonuses.mjs
  is_slow: false            # Тот же темп в минус: +1 ОД на те же реакции
  is_twohanded: false
  is_thrown: false
  is_reloading: false
  reload_cost: 1            # Цена ОД одного манёвра «Перезарядка» (1-3). Диктуется оружием:
                            # мушкет 2, аркебуза 3, прочее 1. Манёвр с is_reload_action
                            # игнорирует свой ap_cost и берёт эту цену. Виден на листе
                            # только при is_reloading: true
  loaded: true             # Заряжено ли оружие. Выстрел (атакующий манёвр перезаряжаемым
                            # стволом) ставит false и блокируется, если уже false; манёвр
                            # is_reload_action ставит true. Карточка выстрела показывает
                            # напоминание о перезарядке (item.mjs). Виден на листе при is_reloading
  is_point_blank: false     # В упор: выстрел не провоцирует АпВ (флаг без автоматики)
  is_scatter: false         # Картечь: конус ~6 м, один бросок на все цели (флаг без автоматики)
  is_variable_grip: false   # Вариативный хват: 1 или 2 руки; в двух руках ступень дайса растёт
  is_paired: false          # Парное: занимает оба слота рук, но двуручным хватом не считается

  properties:               # прочие свойства (SchemaField)
    natural: false          # естественное оружие (когти/укус с мутации): экипировано,
                            # но НЕ занимает слот руки — руки свободны. Показывается
                            # отдельным блоком на листе (выпустить/спрятать = equipped),
                            # в слоты рук не кладётся даже перетаскиванием (character-sheet.mjs)
    armor_piercing: false   # ЛЕГАСИ-галочка: даёт бронебойность 1; новое поле — armor_piercing (число) ниже
    misfire_chance: 0
    consumed_on_use: false
    can_be_sold: false
    can_be_dropped: false

  quantity: 1
  consume_target: ""        # ID предмета-боеприпаса на акторе
  consume_amount: 1

  uses_value: 0
  uses_max: ""
  uses_per: ""
  on_use_macro: ""

  prerequisites_attributes: []  # Пререквизиты владения, формат "str 2" (блок «Пререквизиты» на листе)
  prerequisites_skills: []      # формат "atletism 2"

  control_zone: 0           # 0-3, зона контроля в клетках
  armor_piercing: 0         # 0-10, уровень бронебойности (единица гасит 10% DR цели; 10 = игнор DR)
  cleaving: 0               # 0-10, Рассекание N: отменяет N Твёрдости (cohesion)
                            # брони цели. ПОКА ДЕКОРАТИВНО — см. NOTES.md
  deflecting: 0             # Отражающий N: +N к Блоку, пока оружие в off_hand.
                            # Валюта щита (12. Armor §Базовые щиты): средний 1,
                            # ростовой 2. Актор читает ТОЛЬКО из off_hand;
                            # is_auxiliary там же даёт +1 к Блоку

  # Бонусы против типов существ: { <ключ типа>: potency 0-10 }. Если цель несёт
  # Item creature_type с этим ключом, урон умножается на (1 + potency*0.1) ДО DR.
  # Ключи — из CONFIG.DEDREL.creatureTypes; свободный ObjectField (новые типы без миграции).
  vs_creature: {}

  # Вскрыватель типа: { <ключ типа>: true }. Против цели такого типа при применении
  # урона из её DR вычитается вклад совпавшего типа (сумма его эффектов по типу удара) —
  # существо бьётся «как обычная плоть», броня/природный базовый DR остаются.
  # Свободный ObjectField. Сейчас — ручной чекбокс на листе; при крафте переедет на
  # зачарования/материалы (см. NOTES.md). Правило: _rules/18. Enemies.md §Вскрыватель типа.
  bypass_creature: {}

# -----------------------------------------------
# Item Type: armor
# Файл: src/data/items/armor.mjs
# -----------------------------------------------
# ВНИМАНИЕ: у armor НЕТ поля quantity — броня единична; в расчётах веса
# количество считается равным 1.
type: "armor"
system:
  description: ""           # HTMLField
  key: ""
  rarity: "common"          # choices: common, uncommon, rare, very_rare, legendary
                            # (легаси "very rare" с пробелом нормализуется миграцией)
  base_price: 0
  weight: 0
  # Аксессуарный слот: если задан (напр. "head" для шлема), броня надевается в
  # слот аксессуара, а НЕ в слои тела (slot ниже игнорируется). "" = броня тела.
  equip_slot: ""            # "" | head | neck | torso | hand (ACCESSORY_SLOT_TYPES)
  slot: "middle"            # choices: lower, middle, upper, universal
  weight_class: "light"     # choices: light, medium, heavy — ТИП доспеха.
                            # Актор берёт его ТОЛЬКО с самого тяжёлого надетого
                            # слоя и выводит ±1 Уклонение/Блок сам (12. Armor
                            # §Типы доспехов): light +1 Укл/−1 Блок, medium 0,
                            # heavy −1 Укл/+1 Блок. Без доспеха типа нет вовсе

  dr:
    slashing: 0
    piercing: 0
    bludgeoning: 0
    heat: 0
    cold: 0
    necrotic: 0
    radiant: 0
    electric: 0
    sonic: 0
    acid: 0
  # modifiers — «щель» под добавки СВЕРХ лекала (материал, зачарование). Механику
  # типа и свойств актор выводит сам, дублировать её сюда НЕ нужно. Складываются
  # со всех надетых слоёв (в отличие от бонусов типа).
  modifiers:
    dodge: 0
    block: 0
    stealth: 0                # ложится в skills.stealth.bonus
    ranged_attack: 0          # НЕ ПРИМЕНЯЕТСЯ: у актора нет канала (см. NOTES.md)
    magic_attack: 0           # НЕ ПРИМЕНЯЕТСЯ: там же
    movement: 0               # штраф/бонус Скорости в МЕТРАХ (ложится в movement.max)
  # Свойства лекала (12. Armor §Свойства). Механику выводит актор с КАЖДОГО
  # надетого слоя и складывает — правила разрешают это явно для «Жесткого».
  properties:
    exclusive_slot: false     # Эксклюзивный: поверх нельзя надеть другие слои
                              # (character-sheet.mjs #onEquipArmor / #equipArmorToSlot)
    light_layers_only: false  # Только поверх лёгкого: не надевается, если в другом
                              # слое лежит `средний`/`тяжёлый` доспех, и наоборот
                              # (character-sheet.mjs #checkLightLayers). Носитель —
                              # мантия. Вместе с exclusive_slot это ЕДИНСТВЕННЫЕ два
                              # свойства, влияющие на экипировку; в расчёт защиты
                              # (character.mjs/npc.mjs) ни одно из них не входит
    rigid: false              # Жесткий: −1 Уклонение сверх штрафа типа
    loud: false               # Громкий: −2 Скрытность
    encumbering: false        # Отягощающий: −2 стрелк. (кроме огнестрела) и маг.
                              # атаки. ПОКА ДЕКОРАТИВНО — см. NOTES.md
    weak_point_protection: false  # ЛЕГАСИ: в правилах отсутствует, никто не читает
    deflecting: 0             # Отражающий N: +N к Блоку
    cohesion: 0               # Твёрдость N: гасит N входящей Бронебойности до
                              # сравнения AP с DR; Рассекание N на оружии отменяет.
                              # ПОКА ДЕКОРАТИВНО (в правилах не зафиксировано) —
                              # см. NOTES.md и Armor Rework Plan §5

  uses_value: 0
  uses_max: ""
  uses_per: ""
  formula_heal: ""
  formula_temp_hp: ""        # Выдача временных хитов: число, дайсы или "N%" от макс. ХП цели; складываются, сгорают на отдыхе
  on_use_macro: ""

  prerequisites_text: ""
  prerequisites_attributes: []
  prerequisites_skills: []
  prerequisites_talents: []
  prerequisites_mutations: []
  prerequisites_bloodlines: []

  equipped: false

# -----------------------------------------------
# Item Type: ammunition
# Файл: src/data/items/ammunition.mjs
# -----------------------------------------------
type: "ammunition"
system:
  description: ""
  key: ""
  # + физические поля (rarity, weight initial 0.05, base_price) + crafting-поля
  ammo_type: "arrow"        # enum: arrow | bolt | shot (лук | арбалет | огнестрел)
  quantity: 20
  stackable: true
  armor_piercing: 0         # бронебойность боеприпаса (без cap); суммируется с AP оружия в броске урона
  damage_bonus: ""          # формула доп. урона поверх оружейного (напр. "1d6")
  damage_bonus_type: ""     # тип доп. урона (DR-ключ Лестницы; пусто = тип оружия). Другой тип = отдельный пакет урона
  vs_creature: {}           # карта "тип существа": сила 0-10 (зеркало оружейного), складывается с оружейным
  recovery_chance: 50       # шанс (%) уцелеть после выстрела для сбора; у shot игнорируется (порох не подбирается)
# Привязка к оружию: на дальнобойном оружии (weapon.system.consume_target) через вкладку «Боеприпасы».
# Совместимость arrow/bolt/shot определяется классом оружия (getRangedClass по ключу: bow/crossbow/firearm).
# Расход и снапшот бонусов (AP/урон/vs_creature) — в момент манёвра-выстрела (см. src/documents/item.mjs, chat.mjs).

# -----------------------------------------------
# Item Type: magic_item
# Файл: src/data/items/magic_item.mjs
# -----------------------------------------------
type: "magic_item"
system:
  description: ""
  key: ""
  # + физические поля (rarity initial "uncommon", weight, base_price); quantity — отдельным полем
  equip_slot: ""            # Аксессуарный слот (head/hand/neck/... из ACCESSORY_SLOT_TYPES); "" = не аксессуар
  stackable: false
  consumable: false         # Расходуется (уничтожается) при использовании; по умолчанию НЕТ
  quantity: 1
  effect_description: ""    # Краткое описание срабатывания для игрока
  # Нагрузка при использовании (разрешается в Item#use, как у зелья/свитка):
  spell_id: ""              # Вшитое заклинание (жезл-кастер): id предмета на акторе/в мире/UUID
  spell_key: ""             # system.key заклинания для поиска в компендиуме dedrel.spells
  formula_heal: ""          # Формула лечения при использовании (кнопка в карточке чата)
  on_use_macro: ""          # Аварийный люк: макрос для нестандартных срабатываний
  # Перезаряжаемые заряды (в отличие от зелий/свитков НЕ уничтожают предмет):
  uses_value: 0             # Текущие заряды (0 = без зарядов)
  uses_max: ""              # Максимум зарядов; >0 включает механику (has_charges)
  uses_per: ""              # Период восстановления на отдыхе: "" | short_rest | long_rest | day
  requirements: { text: "", attribute: { key: "", rank: 0 } }

# -----------------------------------------------
# Item Type: potion (Фаза 3 — расходуемое зелье)
# Файл: src/data/items/potion.mjs
# -----------------------------------------------
# Эффекты реализуются через Active Effects на самом предмете (transfer: false),
# накладываемые кнопкой «Применить эффекты» в карточке чата, либо через библиотеку
# эффектов (CONFIG.DEDREL.effectLibrary, см. ниже). Мгновенное лечение — formula_heal.
type: "potion"
system:
  description: ""
  key: ""
  # + физические поля (weight initial 0.1, rarity, base_price); quantity — отдельным полем
  quantity: 1
  stackable: true
  effect_description: ""    # Краткое описание эффекта для игрока
  consumable: true          # Списывается quantity в Item#use()
  uses_value: 0             # Заряды для многодозовых склянок (0 = без зарядов)
  uses_max: ""
  uses_per: ""
  formula_heal: ""          # Формула лечения (мгновенно)
  on_use_macro: ""
  requirements: { text: "", attribute: { key: "", rank: 0 } }

# -----------------------------------------------
# Item Type: scroll (Фаза 3 — свиток разового каста)
# Файл: src/data/items/scroll.mjs
# -----------------------------------------------
# При использовании кастует привязанное заклинание мимо доктрины/ОД Магии владельца:
# эфемерная копия spell на акторе + postToChat (см. DedrelItem#castBoundSpell,
# общий с magic_item-жезлом).
# Чтение (16. Magic §10): system.ap_cost — ПРОИЗВОДНОЕ от rarity
# (2/3/4/5 ОД common→very_rare, legendary 6; prepareDerivedData, не хранится).
# Оплата ТОЛЬКО универсальными ОД (свиток не входит в ветки спец-пулов
# #resolveApPools). Требования в use(): экипированный магический фокус
# (weapon_type.magic, через #collectWeaponRequirements) + свободная конечность
# (слоты рук резолвятся в живые предметы; двуручное оружие занимает обе руки).
type: "scroll"
system:
  description: ""
  key: ""
  # + физические поля (weight initial 0.01, rarity initial "uncommon", base_price); quantity — отдельным полем
  quantity: 1
  stackable: true
  spell_id: ""              # id встроенного/мирового заклинания-предмета (или UUID)
  spell_key: ""             # system.key заклинания для поиска в компендиуме dedrel.spells
  consumable: true
  uses_value: 1
  uses_max: "1"
  uses_per: ""
  on_use_macro: ""
  requirements: { text: "", attribute: { key: "", rank: 0 } }

# -----------------------------------------------
# Item Type: exp
# Файл: src/data/items/exp.mjs
# -----------------------------------------------
type: "exp"
system:
  description: ""           # HTMLField
  key: ""
  value: 10                 # Количество опыта при перетаскивании на актора
                            # (предмет не создаётся: xp зачисляется, копилка — flags.dedrel.total_xp)

# -----------------------------------------------
# Item Type: currency
# Файл: src/data/items/currency.mjs
# -----------------------------------------------
# «Рыхлая» пачка монет-предмет. В инвентарь персонажа не попадает: при дропе на
# лист зачисляется в кошелёк (system.currency актора) и удаляется. Деноминация
# должна совпадать с ключом валюты мира (настройка "currencies").
type: "currency"
system:
  description: ""
  key: ""
  denomination: "copper"    # ключ валюты мира
  value: 0                  # количество монет в пачке
  weight_per_unit: 0.01     # вес одной монеты (кг)
  weight: 0                 # ПРОИЗВОДНОЕ: value * weight_per_unit (prepareDerivedData);
                            # в расчёте перегрузки пачка считается как quantity=1 (вес уже за всю пачку)
  base_price: 0
  exchange_rate_modifiers: {}  # ObjectField (зарезервировано)
  properties: {}               # ObjectField (зарезервировано)

# -----------------------------------------------
# Item Type: loot
# Файл: src/data/items/loot.mjs
# -----------------------------------------------
# Обычный предмет инвентаря / «безделушка». Предмет loot с флагом
# flags.dedrel.linkedActorUuid — ссылка на актора-контейнер (см. раздел флагов).
type: "loot"
system:
  description: ""
  key: ""
  rarity: "common"
  equip_slot: ""            # аксессуарный слот для безделушек (пояс→torso и т.п.); "" = обычный предмет
  weight: 0
  base_price: 0
  stackable: true
  quantity: 1
  formula_heal: ""
  formula_temp_hp: ""        # Выдача временных хитов: число, дайсы или "N%" от макс. ХП цели; складываются, сгорают на отдыхе

# -----------------------------------------------
# Item Type: trade_good
# Файл: src/data/items/trade_good.mjs
# -----------------------------------------------
# ВНИМАНИЕ: у trade_good НЕТ поля quantity (единичный лот); в расчётах веса
# и сделках количество считается равным 1.
type: "trade_good"
system:
  description: ""
  key: ""
  rarity: "common"
  weight: 0
  base_price: 0
  unit_type: "item"         # свободный тег единицы измерения (item, barrel, bundle, ...)
  stackable: true

# -----------------------------------------------
# Item Type: mutilation
# Файл: src/data/items/mutilation.mjs
# -----------------------------------------------
type: "mutilation"
system:
  description: ""
  key: ""
  changes: []               # ArrayField(ObjectField) — сырые change-объекты (легаси-поле)

# -----------------------------------------------
# Item Type: countryoforigin
# Файл: src/data/items/countryoforigin.mjs
# -----------------------------------------------
type: "countryoforigin"
system:
  description: ""
  key: ""
  skill_points: 2
  skill_list: []            # ArrayField(StringField)
  feature_name: ""
  feature_description: ""   # HTMLField
  default_languages: []     # ArrayField(StringField)

# -----------------------------------------------
# Item Type: craft_material
# Файл: src/data/items/craft_material.mjs
# -----------------------------------------------
# Ремесленное сырьё (руда, травы, шкуры, эссенции); потребитель — система крафта (Фаза 4).
type: "craft_material"
system:
  description: ""
  key: ""
  # + физические поля (rarity, weight, base_price) и общий блок crafting
  # (обработанные материалы — слитки, выделанная кожа — сами продукты крафта)
  quantity: 1               # количество МЕР материала
  stackable: true
  material_type: "ore"      # ЛЕГАСИ свободный тег (ore | herb | ...); канон — material_class.
                            # migrateData маппит ore→metal, skin→leather и т.д.
  material_class: "metal"   # choices: metal, mineral, wood, herb, leather, cloth,
                            # creature_part, processed (MATERIAL_CLASS_ENUM) — 8 классов
                            # из правил крафта: 7 сырьевых + "processed" (обработанные:
                            # чернила, бумага, склянки, слитки, порох). У обработанных
                            # НЕТ грамматики четырёх осей — slots/applicable_to/
                            # weight_class/signature пусты и скрыты на листе
                            # (isProcessedMaterial в item-sheet.mjs)
  special_rules: ""         # текст особых свойств; у материалов из materials.csv
                            # очищен реворком — их содержимое живёт в signature
  applicable_to:            # к каким изделиям применим как ОСНОВНОЙ материал лекала
    weapon: false
    armor: false
    shield: false
    jewelry: false
  # --- Грамматика материала (реворк 2026-07-15, craft/Armor Rework Plan.md §2) ---
  # Четыре оси, одинаковые у всех материалов: качество (rarity, см. физические
  # поля), магоёмкость (slots), вес/хват (weight_class), сигнатура (signature).
  # Источник истины по значениям — tables/materials.csv; в компендиум их заливает
  # макрос «Реворк материалов» (генерируется scripts/gen_material_rework_macro.py).
  weight_class: "normal"    # свободный текст (normal | heavy | light): механика
                            # сдвига весового класса не зафиксирована, enum рано.
                            # ВНИМАНИЕ: НЕ путать с armor.system.weight_class —
                            # там это класс самого доспеха (light|medium|heavy)
  slots: []                 # магоёмкость: по записи на слот, значение — тир из
                            # SLOT_TIER_ENUM (common, uncommon, rare, very_rare).
                            # Лесенка §6 в цветах CSV: White|Green|Blue|Violet.
                            # [] = материал магию не держит (железо). Счётчик
                            # выражается повтором тира; лист правит только 0/1
  signature:                # ОДНА качественная штука на область, свободный текст.
    armor: ""               # "Cold DR +1" | "Cohesion 2" | "One step of lightness"
    weapon: ""              # "Cleaving 2, 1d6 vs Constructs"
    magic: ""               # "Action Cost discount -1 for chosen technique"
  # СНЯТО реворком: grants[] (варианты «+1 И слот ИЛИ слот»). Плоского +N материал
  # больше не даёт — мощность живёт в лекалах и слотах. migrateData переносит
  # grants→slots (бонус отбрасывается); значения затем выравнивает макрос по CSV.

# -----------------------------------------------
# Item Type: quest_item
# Файл: src/data/items/quest_item.mjs
# -----------------------------------------------
# Квестовый предмет: по умолчанию не продаётся и не выбрасывается — торговцы
# (socket.mjs проверяет can_be_sold) и логика сброса обязаны уважать флаги.
type: "quest_item"
system:
  description: ""
  key: ""
  # + физические поля (rarity, weight, base_price)
  quantity: 1
  stackable: false
  quest_id: ""              # id/название задания
  can_be_sold: false
  can_be_dropped: false

# -----------------------------------------------
# Item Type: service
# Файл: src/data/items/service.mjs
# -----------------------------------------------
# Услуга — НЕматериальный покупаемый предмет (аренда, телепорт, еда, ночлег).
# Без веса и quantity, в инвентарь не попадает. При покупке списываются деньги;
# если на предмете есть Active Effects — они применяются покупателю (socket.mjs).
type: "service"
system:
  description: ""
  key: ""
  rarity: "common"
  base_price: 0
  service_type: ""          # свободный тег: rental | teleport | meal | lodging | toll | ...

# -----------------------------------------------
# Item Type: creature_type
# Файл: src/data/items/creature_type.mjs
# -----------------------------------------------
# Тег «тип существа» (à la D&D creature types) + носитель врождённых бонусов вида.
# Кладётся в инвентарь NPC/персонажа; актор может нести несколько типов.
# По system.key работает механика «против типа»: weapon.vs_creature и
# DedrelActor#creatureTypeKeys (урон *= 1 + potency*0.1 ДО вычета DR).
# Пресеты ключей — CONFIG.DEDREL.creatureTypes (src/config/creature-types.mjs):
# beast, magical_beast, plant, ooze, elemental, ethereal, astral, spirit, shade,
# fey, demon, dragon, elf, human, undead, cosmic, construct.
# human вешается только на людей-NPC (стражники, бандиты); персонажи игроков
# creature_type не несут — «против типа human» по ним не матчится.
# Планарные типы (ethereal, astral) часто парные: актор несёт два creature_type
# (например ethereal + shade — «эфирный шейд»), «против типа» матчит каждый.
# Бонусы вида (DR, защиты, скорость) вешаются штатными Active Effects этого Item'а.
type: "creature_type"
system:
  key: ""                   # стабильный ключ типа (расширяемо: можно произвольный)
  description: ""           # HTMLField

# ===============================================
# --- АУРЫ (flags.dedrel.aura на Active Effect) ---
# Файлы: src/canvas/aura-regions.mjs, src/data/region-behaviors/aura.mjs
# ===============================================
# Аура НЕ является полем схемы предмета: она задаётся флагом на Active Effect
# (эффект-МАРКЕР). Обычно это transfer-эффект предмета (талант, мутация,
# magic_item и т.д.), но флаг работает и на эффекте, созданном прямо на актёре.
#
# Пока маркер активен (не disabled, не подавлен экипировкой), у каждого токена
# актёра на текущей сцене существует регион-эманация (V14 attachment к токену),
# который двигается за токеном и вешает/снимает payload-эффекты на входящие токены.
# Автоматика исполняется на клиенте активного ГМа; рассинхрон без ГМа лечится
# сверкой на canvasReady.

# --- Флаг маркера ---
# Маркер — "чистый" эффект: transfer: false, сам он ни на кого не действует и не
# показывает статус-иконку. Аура активна, пока маркер существует и не disabled
# (и не подавлен). Носитель получает payload ТОЛЬКО через includeSelf — тем же
# region-путём, что и остальные получатели. Диалог настройки на листе предмета
# сам выставляет transfer: false и содержит переключатель "Аура активна" (disabled).
# Игровые тумблеры: кнопка "Вкл/выкл ауру" на карточке предмета в чате
# (action "toggleAura" в src/chat.mjs) и ПКМ по иконке маркера в HUD статусов
# (выключает ауру, настройки сохраняются). Радиус 0 в диалоге удаляет ауру насовсем.
flags:
  dedrel:
    aura:
      radius: 3                # > 0, в единицах дистанции сцены (метры)
      disposition: "all"       # "all" | "friendly" | "hostile" (относительно disposition токена-носителя)
      includeSelf: false       # вешать ли payload и на носителя
      effects: []              # (опционально) явные UUID эффектов-payload; иначе см. ниже
      color: null              # (опционально) CSS-цвет региона

# --- Payload (что вешается на цели) ---
# 1. Sibling-эффекты ТОГО ЖЕ предмета с flags.dedrel.applyTo = "aura" и transfer: false
#    (по аналогии с applyTo: "self"). Кнопка чата "Применить эффекты" их игнорирует.
# 2. FALLBACK (одноэффектный авторинг): если payload-эффектов нет, аура раздаёт
#    изменения (system.changes) САМОГО маркера. Так как маркер transfer: false,
#    напрямую на носителя он не действует — носитель управляется исключительно
#    флагом includeSelf. ВНИМАНИЕ: если маркер создан прямо на актёре (не на
#    предмете), его changes применяются к актёру как обычный актёрный эффект —
#    в этом случае держите changes на маркере пустыми или includeSelf выключенным.
# Настраивается на листе предмета (вкладка Эффекты): иконка "мишень" — пометить
# payload, иконка "точка в круге" — диалог настройки маркера ауры.
# Форма региона — круг от центра токена (radius в метрах, gridBased),
# как у шаблонов предметов; регион движется за токеном через attachment.token.

# --- Служебные ключи (проставляются кодом, вручную не задавать) ---
# Регион ауры:      flags.dedrel.aura = { effectUuid, tokenId, params }
# Behavior региона: type "dedrelAura", system: { sourceEffectUuid, disposition, includeSelf }
# Эффект на цели:   origin = uuid behavior'а (ключ идемпотентности и очистки),
#                   flags.dedrel.auraApplied = uuid маркера.
# Пересекающиеся ауры разных носителей дают НЕЗАВИСИМЫЕ экземпляры эффектов (стекаются).

# ===============================================
# --- БИБЛИОТЕКА ЭФФЕКТОВ ---
# Источник истины: компендиум "dedrel.active_effects" (пак Item-носителей)
# ===============================================
# UI: кнопка «Из библиотеки» на вкладке Эффекты листа предмета. У пикера два режима:
#  1) «Готовый эффект из библиотеки» — список записей компендиума; чтобы эффект там
#     появился, достаточно завести Item-носитель со встроенным AE, код не трогаем.
#  2) «Сопротивление/уязвимость» — генератор: DR-эффект собирается на лету из типа
#     урона (DR_KEY_LABELS) и ступени (DR_TIERS, src/constants.mjs). Комбинаторный
#     контент (6 ступеней × 10 типов) НЕ хранится записями — иначе список пикера
#     распухает и выбирать в нём нечего. Чистка старого засева — purge_dr_library_macro.js.
# Копир эффекта между документами — copy_active_effect_macro.js.
# (Компендиумов «голых» ActiveEffect в Foundry нет — эффекты embedded, поэтому склад
#  реализован как пак Item-носителей, каждый несёт свой AE.)
# Легаси: src/config/effect-library.mjs (CONFIG.DEDREL.effectLibrary + game.dedrel.effects.build)
# — кодовый сид пресетов, потребителя больше нет; живые оттуда только хелперы токен-света.

# --- Флаги пресетных эффектов ---
flags:
  dedrel:
    effectLibrary: "poison"    # ключ пресета-источника (проставляет buildEffectData)
    tick: { formula: "1d4", trigger: "turnStart", damage_type: "", is_heal: false }
                               # периодический урон/лечение (см. Item Type: condition, combat.mjs)
    stacks: 1                  # масштабирование тика (@stacks в формуле)

# ===============================================
# --- СВЕТ ТОКЕНА (change-строки token.light.* на Active Effect) ---
# Файлы: src/config/effect-library.mjs (пресет light + хелперы), src/sheets/item-sheet.mjs (диалог)
# ===============================================
# Свет хранится ОБЫЧНЫМИ change-строками эффекта с ключами token.light.*
# (нативный механизм V14, см. foundry-v14-quirks.md §18): ядро применяет их к
# токенам носителя эфемерно, на каждом клиенте, без записи в документ токена и
# без участия ГМа; снятие/подавление/истечение эффекта гасит свет само.
system:
  changes:
    - { key: "token.light.dim",    type: "override", value: "8" }      # тусклый радиус (метры сцены)
    - { key: "token.light.bright", type: "override", value: "4" }      # яркий радиус
    - { key: "token.light.color",  type: "override", value: "#ff9329" } # CSS-цвет
    - { key: "token.light.alpha",  type: "override", value: "0.5" }     # насыщенность 0..1
    - { key: "token.light.animation.type", type: "override", value: "torch" } # из CONFIG.Canvas.lightAnimations
    - { key: "token.light.animation.speed", type: "override", value: "3" }
    - { key: "token.light.animation.intensity", type: "override", value: "4" }
# Значения — строки; фаза "initial" (дефолт; кастомную фазу "apply" токен не исполняет).
# Кастомизация — диалог «Настроить свет» (кнопка-лампочка) на вкладке Эффекты листа;
# хелперы build/read/strip/hasTokenLightChanges — в src/config/effect-library.mjs.
# Тумблер: DedrelItem#use у magic_item/loot/trade_good с transfer-эффектом света
# переключает effect.disabled (не стакает копии). Гейтинг экипировки действует и на свет.
# ЛЕГАСИ: маркер flags.dedrel.tokenLight и token.flags.dedrel.baseLight конвертирует
# миграция DedrelMigration.migrateEffectData (v0.1.1).

# ===============================================
# --- ЭФЕМЕРНЫЕ ЗАКЛИНАНИЯ (flags.dedrel.ephemeral) ---
# Файлы: src/apps/spell-constructor.mjs (каст на лету), src/documents/item.mjs (свитки), combat.mjs (очистка)
# ===============================================
# Каст «на лету» (конструктор) и каст со свитка создают РЕАЛЬНЫЙ embedded spell-Item
# на акторе (кнопки карточки чата ищут предмет по id), помеченный флагом:
flags:
  dedrel:
    ephemeral: true            # временный спелл; удаляется в конце боя (combat.mjs) или макросом
    fromScroll: "Свиток огня"  # (свитки) имя свитка-источника; каст идёт мимо доктрины и ОД

# ===============================================
# --- ПРОЧИЕ СЛУЖЕБНЫЕ ФЛАГИ (flags.dedrel.*) ---
# ===============================================
# На ПРЕДМЕТАХ (Item):
#   linkedActorUuid: "Actor.XXX"  # предмет-ссылка на актора-контейнер (сумка/сундук);
#                                 # лист персонажа показывает его отдельной секцией,
#                                 # system.weight предмета = вклад контейнера в перегрузку
#   parentItemId: "itemId"        # предмет добавлен талантом/мутацией через adds_items;
#                                 # удаляется вместе с родителем (DedrelItem._onDelete)
#   isFavorite: true              # избранное: квик-слоты инвентаря, панель манёвров,
#                                 # УЧАСТИЕ В ЦЕПНЫХ МАНЁВРАХ (chain-HUD показывает только избранные)
#
# На АКТОРАХ (Actor):
#   itemsLocked: true             # замок удаления предметов на листе (default: true)
#   creationLocked: false         # замок блока создания персонажа
#   showCreation: false           # показать блок создания персонажа
#   favoriteSkills: ["stealth"]   # избранные навыки (панель быстрого доступа)
#   total_xp: 0                   # накопительный счётчик всего полученного опыта
#
# На ЭФФЕКТАХ (ActiveEffect) — помимо описанных выше aura/tick/mod:
#   condition: true               # эффект — кондиция из реестра статусов
#   is_technical: false           # техническая кондиция (не показывается в HUD)
#   category: "negative"          # категория кондиции
#   stackable / max_stacks / refresh_on_stack / stacks  # стаки (см. Item Type: condition)
#   applyTo: "self" | "aura"      # self-эффект (Item#_applySelfEffects) / payload ауры
#   auraApplied: "uuid"           # копия, навешенная аурой (uuid эффекта-маркера)
#   concentration: "Имя спелла"   # маркер концентрации (Длительность 4 ранга)
#   effectLibrary: "poison"       # ключ пресета-источника из библиотеки эффектов
#
# На СЦЕНАХ (Scene):
#   sourceScale: { pyromancy: "abundant", ... }
#                                 # Масштаб Источника по доктринам: "none" | "any" | "abundant".
#                                 # Пишет ГМ виджетом «Источники сцены» (src/apps/source-hud.mjs)
#                                 # или макросом scene_sources_macro.js. Доктрина без записи
#                                 # получает дефолт из CONFIG.DEDREL.magic.defaultSourceScales
#                                 # (воздух и земля — "any", остальные — "none"), а НЕ «без
#                                 # ограничений». Единственная точка чтения — функции
#                                 # src/utils/magic-source.mjs: и виджет, и Конструктор
#                                 # заклинаний ходят туда, иначе показ и разрешения разъедутся.
