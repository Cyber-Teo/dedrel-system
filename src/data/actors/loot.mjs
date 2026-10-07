import { DedrelCurrency } from "../../utils/currency.mjs";

/**
 * "Loot/Merchant/Container" actor (type loot). One type with modes:
 *   loot      — free taking of items and money (handouts/plunder);
 *   merchant  — merchant (buying/selling by price list);
 *   container — chest/bag (taking + "split money"; linking to a character
 *               as an item reference — Block C).
 *
 * Wallet (system.currency) and the derived this.wallet — same as the character's,
 * so that transfers/trades work uniformly (see DedrelSocket, DedrelCurrency).
 */
export default class LootDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      mode: new f.StringField({ required: true, initial: "loot", choices: ["loot", "merchant", "container"] }),
      description: new f.HTMLField({ required: false, blank: true, initial: "" }),

      // Wallet
      currency: new f.ObjectField({ required: false, initial: {} }),

      // Whether the actor can receive money transfers (see character.mjs).
      // Loot/containers are NOT shown in the recipient list by default —
      // otherwise every chest surfaces on a large scene.
      can_receive_currency: new f.BooleanField({ required: true, initial: false }),

      // Merchant economy
      buy_modifier_pct: new f.NumberField({ required: true, initial: 0 }),        // +markup / −discount when the player buys
      can_sell_to: new f.BooleanField({ required: true, initial: true }),          // whether it accepts sales from players
      sell_price_pct: new f.NumberField({ required: true, initial: 50, min: 0 }),  // % of base price when buying from players
      infinite_funds: new f.BooleanField({ required: true, initial: false }),      // unlimited treasury when buying from players
      // Personal discounts per player: { userId: percent }
      personal_discounts: new f.ObjectField({ required: false, initial: {} }),
      // RollTable references (uuid or name) for generating random stock
      loot_tables: new f.ArrayField(new f.StringField(), { initial: [] }),

      // Maximum container load (kg). 0 = no limit. Counts the weight of the
      // items inside + the weight of the wallet's coins; when exceeded, adding an
      // item is blocked (preCreateItem hook, see loot-sheet.mjs).
      capacity: new f.NumberField({ required: true, initial: 0, min: 0 })
    };
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    // Derived total wallet value/weight (for the UI)
    this.wallet = {
      total_base: DedrelCurrency.walletBase(this.parent),
      weight: 0
    };
    for (const d of DedrelCurrency.defs()) {
      this.wallet.weight += (Number(this.currency?.[d.key]) || 0) * (Number(d.weight) || 0);
    }

    // Current container load: item weight (× quantity) + coin weight.
    let load = this.wallet.weight;
    if (this.parent?.items) {
      for (const it of this.parent.items) {
        const w = Number(it.system?.weight) || 0;
        if (w <= 0) continue;
        // ?? inside Number(): for types without quantity Number(undefined) would give NaN
        const qty = it.type === "currency" ? 1 : Number(it.system?.quantity ?? 1);
        load += w * qty;
      }
    }
    this.load = Math.round(load * 100) / 100;
  }
}
