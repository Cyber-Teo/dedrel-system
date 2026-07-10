import { physicalItemFields } from "./_physical.mjs";
import { craftingFields } from "./_crafting.mjs";
import { ACCESSORY_SLOT_TYPES } from "../../constants.mjs";

export default class MagicItemDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      description: new fields.HTMLField({ label: "Description" }),
      key: new fields.StringField({ initial: "" }),
      // Магические предметы по умолчанию как минимум необычные
      ...physicalItemFields({ rarity: "uncommon" }),
      ...craftingFields(),
      // Аксессуарный слот (диадема→head, кольцо/браслет→hand, ожерелье→neck, ...)
      equip_slot: new fields.StringField({ required: false, blank: true, initial: "", choices: ACCESSORY_SLOT_TYPES }),
      stackable: new fields.BooleanField({ initial: false }),
      consumable: new fields.BooleanField({ initial: false, label: "Consumable" }),
      quantity: new fields.NumberField({ initial: 1, integer: true, label: "Quantity" }),
      formula_heal: new fields.StringField({ initial: "", label: "Healing Formula" })
    };
  }
}
