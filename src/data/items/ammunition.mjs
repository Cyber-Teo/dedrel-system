import { physicalItemFields } from "./_physical.mjs";
import { craftingFields, migrateCraftingData } from "./_crafting.mjs";
import { AMMO_TYPE_ENUM } from "../../constants.mjs";

export default class AmmunitionDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      description: new fields.HTMLField({ required: false, blank: true, initial: "" }),
      key: new fields.StringField({ required: false, initial: "" }),
      // Общие физические поля (редкость/вес/цена)
      ...physicalItemFields({ weight: 0.05 }),
      ...craftingFields(),
      // Тип боеприпаса → класс совместимого оружия (arrow=лук, bolt=арбалет, shot=огнестрел)
      ammo_type: new fields.StringField({ initial: "arrow", choices: AMMO_TYPE_ENUM, label: "Ammo Type" }),
      quantity: new fields.NumberField({ initial: 20, integer: true, min: 0, label: "Quantity" }),
      stackable: new fields.BooleanField({ initial: true }),
      // Бронебойность боеприпаса: каждая единица снимает 10% DR цели. Без cap
      // (легендарные боеприпасы могут иметь высокую пробивную способность).
      armor_piercing: new fields.NumberField({ initial: 0, integer: true, min: 0, label: "Armor Piercing" }),
      // Доп. урон боеприпаса поверх оружейного: формула + тип по Лестнице
      // (любой DR-ключ, включая энергетические — «магический» урон особых стрел).
      damage_bonus: new fields.StringField({ initial: "", label: "Damage Bonus Formula" }),
      damage_bonus_type: new fields.StringField({ initial: "", label: "Damage Bonus Type" }),
      // Бонус против типов существ (сила 0-10 на тип), зеркало оружейного vs_creature.
      vs_creature: new fields.ObjectField({ initial: {} }),
      // Шанс (%) сохранить боеприпас после выстрела для последующего сбора.
      // Для shot (огнестрел) игнорируется — порох не подбирается.
      recovery_chance: new fields.NumberField({ initial: 50, integer: true, min: 0, max: 100, label: "Recovery Chance" })
    };
  }

  static migrateData(source) {
    // ammo_type стал enum (arrow|bolt|shot). Легаси-значение "bullet" (огнестрел)
    // переименовано в "shot" — иначе choices-валидация отвергла бы его.
    if (source.ammo_type === "bullet") source.ammo_type = "shot";
    migrateCraftingData(source);
    return super.migrateData(source);
  }
}
