/**
 * Wallet and pricing utilities (multi-currency).
 *
 * Working model: the wallet is treated as a single pool of "base units"
 * (each currency's base_value). Operations compute in base units and then
 * break the total down into denominations with a greedy algorithm (a currency with
 * base_value = 1 is needed for exact change; copper by default).
 */
export class DedrelCurrency {
  /** The world's currency list (safely), name/abbr already localized. */
  static defs() {
    try { return this.localizeDefs(game.settings.get("dedrel", "currencies") || []); }
    catch (e) { return []; }
  }

  /**
   * Resolves i18n keys into the name/abbr of the default currencies (DEFAULT_CURRENCIES stores
   * DEDREL.Currency.* keys, because the constants load before the dictionaries).
   * User currencies with literal text pass through unchanged.
   * Returns new objects, doesn't mutate the source array.
   */
  static localizeDefs(defs) {
    // Before i18n is initialized (early prepareDerivedData) the key stays as is.
    const loc = v => (typeof v === "string" && v.startsWith("DEDREL.")) ? (game.i18n?.localize(v) ?? v) : v;
    return (defs || []).map(d => ({ ...d, name: loc(d.name), abbr: loc(d.abbr) }));
  }

  /** Total value of the actor's wallet in base units. */
  static walletBase(actor) {
    let total = 0;
    const cur = actor?.system?.currency || {};
    for (const d of this.defs()) total += (Number(cur[d.key]) || 0) * (Number(d.base_value) || 0);
    return total;
  }

  /** Breaks an amount in base units down into denominations (greedily, top-down). */
  static collapse(baseAmount) {
    const valued = this.defs().filter(d => Number(d.base_value) > 0).sort((a, b) => b.base_value - a.base_value);
    const out = {};
    let rem = Math.round(baseAmount);
    valued.forEach((d, i) => {
      const bv = Number(d.base_value);
      if (i === valued.length - 1) out[d.key] = Math.round(rem / bv);
      else { const n = Math.floor(rem / bv); out[d.key] = n; rem -= n * bv; }
    });
    return out;
  }

  /** Sets the actor's wallet equal to baseAmount (via the breakdown). */
  static async setWalletBase(actor, baseAmount) {
    return actor.update({ "system.currency": this.collapse(Math.max(0, baseAmount)) });
  }

  /**
   * The PURCHASE price of one unit from a merchant (in base units), including the global
   * markup/discount and the player's personal discount (by userId).
   */
  static buyUnitPrice(merchant, item, userId) {
    const base = Number(item.system?.base_price) || 0;
    const mod = Number(merchant.system?.buy_modifier_pct) || 0;
    const disc = Number(merchant.system?.personal_discounts?.[userId]) || 0;
    const price = base * (1 + mod / 100) * (1 - disc / 100);
    return Math.max(0, Math.round(price));
  }

  /**
   * The BUYBACK price of one unit the merchant pays the player (in base units): a share of the base
   * price (sell_price_pct). The personal discount doesn't affect buyback.
   */
  static sellUnitPrice(merchant, item) {
    const base = Number(item.system?.base_price) || 0;
    const pct = Number(merchant.system?.sell_price_pct) || 0;
    return Math.max(0, Math.round(base * pct / 100));
  }

  /** Human-readable price string (e.g. "1 gp 20 cp") from a base amount. */
  static format(baseAmount) {
    const parts = [];
    const coins = this.collapse(baseAmount);
    for (const d of this.defs()) {
      const n = Number(coins[d.key]) || 0;
      if (n > 0) parts.push(`${n} ${d.abbr || d.key}`);
    }
    return parts.length ? parts.join(" ") : "0";
  }
}
