// Редкость предметов (см. "_rules/15. Inventory.md"). Канонические ключи —
// с подчёркиванием (very_rare). Порядок = возрастание ценности/редкости.
export const ITEM_RARITY_ENUM = ["common", "uncommon", "rare", "very_rare", "legendary"];

export const ITEM_RARITY_LABELS = {
  common: "DEDREL.Rarity.common",
  uncommon: "DEDREL.Rarity.uncommon",
  rare: "DEDREL.Rarity.rare",
  very_rare: "DEDREL.Rarity.very_rare",
  legendary: "DEDREL.Rarity.legendary"
};

// Категории слотов аксессуаров (значения поля предмета system.equip_slot).
// head — шлем/диадема; neck — ожерелье; torso — пояс; hand — кольца/браслеты
// (подходят в любой слот кисти/хвоста). Пустая строка = не аксессуар.
export const ACCESSORY_SLOT_TYPES = ["head", "neck", "torso", "hand"];

// Деноминации валют по умолчанию. Реальный список валют мира задаётся в
// настройке "currencies" (меню настроек); это лишь дефолтный набор/фолбэк.
export const CURRENCY_DENOMINATION_ENUM = ["copper", "silver", "gold", "platinum"];

// Дефолтный список валют мира (настройка "currencies"). Каждая валюта:
//   key        — машинный ключ (латиница), ключ в кошельке актора system.currency.<key>
//   name       — отображаемое название; у дефолтов это ключ i18n (DEDREL.Currency.*),
//                который резолвится в DedrelCurrency.defs() — константы грузятся до словарей
//   abbr       — короткая аббревиатура для UI кошелька (у дефолтов тоже ключ i18n)
//   base_value — ценность в общих «базовых единицах» (механизм конвертации:
//                медь=1, серебро=10, золото=100, платина=1000)
//   weight     — вес одной монеты (кг), влияет на перегрузку
//   color      — цвет-акцент в UI
export const DEFAULT_CURRENCIES = [
  { key: "copper",   name: "DEDREL.Currency.Copper",   abbr: "DEDREL.Currency.CopperAbbr",   base_value: 1,    weight: 0.01, color: "#b87333" },
  { key: "silver",   name: "DEDREL.Currency.Silver",   abbr: "DEDREL.Currency.SilverAbbr",   base_value: 10,   weight: 0.01, color: "#c0c0c0" },
  { key: "gold",     name: "DEDREL.Currency.Gold",     abbr: "DEDREL.Currency.GoldAbbr",     base_value: 100,  weight: 0.01, color: "#ffd700" },
  { key: "platinum", name: "DEDREL.Currency.Platinum", abbr: "DEDREL.Currency.PlatinumAbbr", base_value: 1000, weight: 0.01, color: "#e5e4e2" }
];

// Функциональные ремёсла системы крафта (craft/New Craft.md): значения поля
// system.crafting.discipline и дисциплина рецептов. Пустая строка = не задано.
export const CRAFT_DISCIPLINE_ENUM = ["alchemy", "smithing", "inscription", "tailoring", "carpentry", "jewelry", "engineering"];

// Классы ремесленных материалов (system.material_class у craft_material).
// Семь канонических типов СЫРЬЯ из правил крафта (19. Crafting §Материалы) плюс
// восьмой класс "processed" — ОБРАБОТАННЫЕ материалы: вторая ступень экономики,
// то есть сами продукты крафта (чернила, бумага, склянки, слитки, порох, спирт).
// У обработанных нет сигнатур и слотов: в оружие и доспех они не ложатся, они
// живут только в рецептах как обычные ингредиенты.
export const MATERIAL_CLASS_ENUM = ["metal", "mineral", "wood", "herb", "leather", "cloth", "creature_part", "processed"];

// Тиры слотов улучшений оружия/брони (без legendary: очень редкий — максимум).
export const SLOT_TIER_ENUM = ["common", "uncommon", "rare", "very_rare"];

// Типы боеприпасов (system.ammo_type у ammunition) и их привязка к классу
// дальнобойного оружия. Порядок в RANGED_CLASS_KEYS важен: firearm и crossbow
// проверяются ДО bow, т.к. подстрока "bow" содержится в "crossbow".
export const AMMO_TYPE_ENUM = ["arrow", "bolt", "shot"];

export const AMMO_TYPE_LABELS = {
  arrow: "DEDREL.Ammo.Type.arrow",
  bolt: "DEDREL.Ammo.Type.bolt",
  shot: "DEDREL.Ammo.Type.shot"
};

// Класс дальнобойного оружия определяется по ключу/названию (подстрока).
// ammo — совместимый тип боеприпаса; consumable_recovery=false → боеприпас
// нельзя подобрать после выстрела (порох огнестрела).
export const RANGED_CLASS_KEYS = [
  { class: "firearm",  ammo: "shot",  keys: ["musket", "pistol", "arquebus"], recoverable: false },
  { class: "crossbow", ammo: "bolt",  keys: ["crossbow"], recoverable: true },
  { class: "bow",      ammo: "arrow", keys: ["bow"], recoverable: true }
];

export const DR_KEY_LABELS = {
  "piercing": "DEDREL.ItemSheet.Piercing",
  "bludgeoning": "DEDREL.ItemSheet.Bludgeoning",
  "slashing": "DEDREL.ItemSheet.Slashing",
  "heat": "DEDREL.ItemSheet.Fire",
  "cold": "DEDREL.ItemSheet.Cold",
  "necrotic": "DEDREL.ItemSheet.Necrotic",
  "radiant": "DEDREL.ItemSheet.Radiant",
  "electric": "DEDREL.ItemSheet.Lightning",
  "sonic": "DEDREL.ItemSheet.Thunder",
  "acid": "DEDREL.ItemSheet.Acid"
};

/**
 * Ступени сопротивлений и уязвимостей (_rules/18. Enemies.md §Уязвимости и
 * особенности типов). value — единицы DR (1 единица = 10% урона); отрицательные
 * applyDamage() читает как уязвимость (усиление входящего урона).
 *
 * Это комбинаторика (6 ступеней × 10 типов урона), поэтому такие эффекты
 * собираются генератором в пикере «Из библиотеки», а не лежат готовыми записями
 * в компендиуме active_effects — иначе список пикера распухает до 60 строк.
 */
export const DR_TIERS = {
  weak_resist: { value: 2, label: "DEDREL.EffectLib.Tier.WeakResist", img: "icons/svg/shield.svg" },
  strong_resist: { value: 5, label: "DEDREL.EffectLib.Tier.StrongResist", img: "icons/svg/mage-shield.svg" },
  immunity: { value: 10, label: "DEDREL.EffectLib.Tier.Immunity", img: "icons/svg/holy-shield.svg" },
  vulnerability: { value: -2, label: "DEDREL.EffectLib.Tier.Vulnerability", img: "icons/svg/downgrade.svg" },
  strong_vulnerability: { value: -5, label: "DEDREL.EffectLib.Tier.StrongVulnerability", img: "icons/svg/downgrade.svg" },
  extreme_vulnerability: { value: -10, label: "DEDREL.EffectLib.Tier.ExtremeVulnerability", img: "icons/svg/degen.svg" }
};
