import { physicalItemFields } from "./_physical.mjs";
import { craftingFields, migrateCraftingData } from "./_crafting.mjs";
import { AMMO_TYPE_ENUM } from "../../constants.mjs";

export default class AmmunitionDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      description: new fields.HTMLField({ required: false, blank: true, initial: "" }),
      key: new fields.StringField({ required: false, initial: "" }),
      // Shared physical fields (rarity/weight/price)
      ...physicalItemFields({ weight: 0.05 }),
      ...craftingFields(),
      // Ammunition type → compatible weapon class (arrow=bow, bolt=crossbow, shot=firearm)
      ammo_type: new fields.StringField({ initial: "arrow", choices: AMMO_TYPE_ENUM, label: "Ammo Type" }),
      quantity: new fields.NumberField({ initial: 20, integer: true, min: 0, label: "Quantity" }),
      stackable: new fields.BooleanField({ initial: true }),
      // Ammunition Armor Piercing: each point removes 10% of the target's DR. No cap
      // (legendary ammunition may have high piercing power).
      armor_piercing: new fields.NumberField({ initial: 0, integer: true, min: 0, label: "Armor Piercing" }),
      // Extra ammunition damage on top of the weapon's: formula + type on the Ladder
      // (any DR key, including energy ones — the "magical" damage of special arrows).
      damage_bonus: new fields.StringField({ initial: "", label: "Damage Bonus Formula" }),
      damage_bonus_type: new fields.StringField({ initial: "", label: "Damage Bonus Type" }),
      // Bonus vs creature types (potency 0-10 per type), mirrors the weapon's vs_creature.
      vs_creature: new fields.ObjectField({ initial: {} }),
      // Chance (%) to keep the ammunition after a shot for later recovery.
      // Ignored for shot (firearms) — powder can't be picked up.
      recovery_chance: new fields.NumberField({ initial: 50, integer: true, min: 0, max: 100, label: "Recovery Chance" })
    };
  }

  static migrateData(source) {
    // ammo_type became an enum (arrow|bolt|shot). The legacy value "bullet" (firearms)
    // was renamed to "shot" — otherwise choices validation would reject it.
    if (source.ammo_type === "bullet") source.ammo_type = "shot";
    migrateCraftingData(source);
    return super.migrateData(source);
  }
}
