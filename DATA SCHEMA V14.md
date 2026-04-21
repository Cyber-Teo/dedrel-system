# ===============================================
# === DEDREL - FOUNDRY V14 DATA SCHEMA ===
# ===============================================
# Этот документ описывает, как оригинальная механика преобразуется 
# в форматы данных для Foundry VTT v14 и шаблонов Obsidian.
#
# Главные отличия от старой архитектуры:
# 1. Изменение структуры Active Effects (массивы changes).
# 2. Использование встроенных событий истечения срока (expiry) вместо самописных таймеров.
# 3. Данные строже типизированы. Элементы, которые можно вычислить 
#    (вес инвентаря, скор. движения), теперь высчитываются движком, 
#    а не хранятся статично.

# ===============================================
# --- 1. АКТИВНЫЕ ЭФФЕКТЫ (ACTIVE EFFECTS) ---
# ===============================================
# Раньше массив changes выглядел так:
# changes: [{ key: "system.attributes.str.bonus", value: "2", mode: 2 }]
#
# Теперь (V14) ТРЕБУЕТСЯ указывать ФАЗУ применения (phase):
# changes: 
#   - key: "system.attributes.str.bonus"
#     value: "2"
#     mode: 2
#     phase: "APPLY" # или "PREPARE" (в зависимости от приоритета расчета)

# ===============================================
# --- 2. УСЛОВИЯ И СОСТОЯНИЯ (CONDITIONS) ---
# ===============================================
type: "condition"
system:
  description: "" 
  category: "negative" 
  is_technical: false  
  stackable: false     
  max_stacks: 1        
  
  # === ИЗМЕНЕНИЯ V14 (Управление временем) ===
  # УСТАРЕЛО: duration_type, duration_value, removal_triggers
  # ТЕПЕРЬ ОНО ВЫГЛЯДИТ ТАК:
  duration:
    units: "rounds" # "rounds", "turns", "seconds", "minutes", "hours", "days"
    value: 0
  expiry_events: [] # Нативный массив триггеров: ["turnStart", "onTakeDamage", "onAttack"]
  
  application_text: "" 
  removal_text: ""     
  is_removable_by_skill: false 
  skill_to_remove: "" 
  remove_dc: 0        
  
  system_flags: {} 
  changes: [] # (Требует phase, см. выше)

# ===============================================
# --- 3. МАНЕВРЫ И ЗАКЛИНАНИЯ ---
# ===============================================
# Структура этих сущностей практически не меняется в YAML. 
# Вся магия "строгой типизации" произойдет "под капотом" в JS-файлах.
type: "maneuver" # (то же самое для "spell")
system:
  description: "" 
  source: "basic"
  action_type: ["action"] 
  chain_trigger_text: ""
  chain_trigger_maneuvers: [] 
  
  ap_cost: 0
  is_variable_cost: false
  variable_cost_max: 0
  uses_value: 0
  uses_max: "0"  
  uses_per: ""
  
  req_weapon_type: "any"         
  req_weapon_damage_type: "any"  
  req_weapon_skill_group: "any"  
  req_weapon_property: ""        
  
  prerequisites_text: ""
  prerequisites_attributes: []
  prerequisites_skills: []
  prerequisites_talents: []
  prerequisites_mutations: []
  prerequisites_bloodlines: []
  
  target_type: "creature"
  target_range: 0         
  target_value: 1
  template_shape: ""      
  template_size: 0
  
  formula_attack: ""      
  formula_damage: ""      
  formula_custom: ""
  save_attribute: ""
  save_dc_formula: ""
  forbidden_defense: ""
  
  changes: [] # (Требует phase, см. выше)

# ===============================================
# --- 4. ПЕРСОНАЖ (ACTOR) ---
# ===============================================
# Данную структуру можно оставить без изменений в Obsidian.
# Foundry V14 будет использовать формулы на лету.
type: "character"
system:
  bloodlines: { human: { rank: 1, max: 6 }, ... }
  doctrines: { ... }
  attributes: { ... }
  
  equipment_slots:
    main_hand: { item_id: "", type: "" } 
    # V14 начнет сам жестко связывать item_id с DocumentUUIDField.
    
  saves:
    int: { value: 0, bonus: 0, formula: "1d10 + @attributes.int.rank" } 
    
  resources:
    hp: { value: 10, max: 10, temp: 0 }
    movement: { value: 0, formula: "Math.floor(2 + @attributes.dex.rank)" } 
    encumbrance: { total: 0, category: "light", thresholds: {...} }
    # Total будет автоматически перерасчитываться классом TypeDataModel 
    # в методе prepareDerivedData().
    
  defenses: ...
  skills: ...
    
# ===============================================
# --- ЧТО В ИТОГЕ НУЖНО СДЕЛАТЬ С ВАШИМИ ШАБЛОНАМИ ---
# ===============================================
# 1. Во всех шаблонах, где есть блок `changes:` добавьте ключ `phase: "APPLY"`.
# 2. В `Шаблон Состояния.md` замените старые duration-переменные на блок 
#    `duration: { units: "...", value: ... }` и `expiry_events: []`.
