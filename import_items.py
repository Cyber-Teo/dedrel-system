import sys
import yaml
import json
import uuid
import os

def map_schema_field(field_value, valid_keys):
    result = {k: False for k in valid_keys}
    if not field_value:
        return result
    
    # Handle string (comma separated)
    if isinstance(field_value, str):
        values = [v.strip().lower() for v in field_value.split(',') if v.strip()]
    elif isinstance(field_value, list):
        values = [str(v).strip().lower() for v in field_value if v]
    else:
        values = []
        
    for v in values:
        if v in result:
            result[v] = True
    return result

def parse_md_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"Error reading {filepath}: {e}")
        return None
        
    if not content.startswith('---'):
        print(f"No YAML frontmatter found in {filepath}")
        return None
        
    parts = content.split('---', 2)
    if len(parts) < 3:
        print(f"Invalid YAML frontmatter in {filepath}")
        return None
        
    try:
        frontmatter = yaml.safe_load(parts[1])
    except Exception as e:
        print(f"Error parsing YAML in {filepath}: {e}")
        return None
        
    body = parts[2].strip()
    
    # Generate Foundry Item Data matching DataModel
    item_type = frontmatter.get("type", "maneuver")
    
    # Обрабатываем action_type как словарь булевых значений
    raw_action_type = frontmatter.get("action_type", [])
    action_type_obj = {
        "action": "action" in raw_action_type,
        "reaction": "reaction" in raw_action_type,
        "free": "free" in raw_action_type,
        "chain": "chain" in raw_action_type
    }
    
    # Устанавливаем иконку на основе имени файла (если это маневр)
    base_name = os.path.splitext(os.path.basename(filepath))[0]
    if item_type == "maneuver":
        img_path = f"systems/dedrel/assets/icons/maneuvers/{base_name}.svg"
    else:
        img_path = f"systems/dedrel/assets/icons/{item_type}.svg"
    
    item = {
        "name": frontmatter.get("title", "Unnamed Item"),
        "type": item_type,
        "img": img_path,
        "system": {
            "description": body,
            "source": frontmatter.get("source", "basic"),
            "action_type": action_type_obj,
            "chain_trigger_text": frontmatter.get("chain_trigger_text", ""),
            "chain_trigger_maneuvers": frontmatter.get("chain_trigger_maneuvers", []),
            "ap_cost": frontmatter.get("ap_cost", 0),
            "is_variable_cost": frontmatter.get("is_variable_cost", False),
            "variable_cost_max": frontmatter.get("variable_cost_max", 0),
            "uses_value": frontmatter.get("uses_value", 0),
            "uses_max": str(frontmatter.get("uses_max", "")),
            "uses_per": frontmatter.get("uses_per", ""),
            "req_weapon_type": map_schema_field(frontmatter.get("req_weapon_type", ""), ["melee", "ranged", "shield"]),
            "req_weapon_damage_type": map_schema_field(frontmatter.get("req_weapon_damage_type", ""), ["piercing", "bludgeoning", "slashing"]),
            "req_weapon_skill_group": frontmatter.get("req_weapon_skill_group", ""),
            "req_weapon_property": map_schema_field(frontmatter.get("req_weapon_property", ""), ["is_auxiliary", "is_fast", "is_slow", "is_twohanded", "is_thrown", "is_enchanted", "is_reloading"]),
            "prerequisites_text": frontmatter.get("prerequisites_text", ""),
            "prerequisites_attributes": frontmatter.get("prerequisites_attributes", []) or [],
            "prerequisites_skills": frontmatter.get("prerequisites_skills", []) or [],
            "prerequisites_talents": frontmatter.get("prerequisites_talents", []) or [],
            "prerequisites_mutations": frontmatter.get("prerequisites_mutations", []) or [],
            "prerequisites_bloodlines": frontmatter.get("prerequisites_bloodlines", []) or [],
            "target_type": frontmatter.get("target_type", "creature"),
            "target_range": str(frontmatter.get("target_range", "")),
            "target_value": frontmatter.get("target_value", 1),
            "template_shape": frontmatter.get("template_shape", ""),
            "template_size": frontmatter.get("template_size", 0),
            "formula_attack": str(frontmatter.get("formula_attack", "")),
            "formula_damage": str(frontmatter.get("formula_damage", "")),
            "formula_custom": str(frontmatter.get("formula_custom", "")),
            "save_attribute": frontmatter.get("save_attribute", ""),
            "save_dc_formula": str(frontmatter.get("save_dc_formula", "")),
            "forbidden_defense": frontmatter.get("forbidden_defense", "")
        },
        "flags": {},
        "_id": uuid.uuid4().hex[:16]
    }
    
    return item

def main():
    if len(sys.argv) < 2:
        print("Usage: python import_items.py <file1.md> <file2.md> ...")
        sys.exit(1)
        
    files = sys.argv[1:]
    items = []
    
    for f in files:
        if os.path.isfile(f):
            print(f"Processing {f}...")
            item = parse_md_file(f)
            if item:
                items.append(item)
        else:
            print(f"File not found: {f}")
            
    out_file = "imported_maneuvers.json"
    with open(out_file, "w", encoding="utf-8") as out:
        json.dump(items, out, ensure_ascii=False, indent=2)
        
    print(f"Successfully generated {out_file} with {len(items)} items.")

if __name__ == "__main__":
    main()
