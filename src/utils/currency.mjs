/**
 * Утилиты кошелька и ценообразования (мультивалютность).
 *
 * Модель работы: кошелёк рассматривается как единый пул «базовых единиц»
 * (base_value каждой валюты). Операции считают в базовых единицах и затем
 * раскладывают итог по деноминациям жадным алгоритмом (нужна валюта с
 * base_value = 1 для точной сдачи; по умолчанию — медь).
 */
export class DedrelCurrency {
  /** Список валют мира (безопасно). */
  static defs() {
    try { return game.settings.get("dedrel", "currencies") || []; }
    catch (e) { return []; }
  }

  /** Суммарная ценность кошелька актора в базовых единицах. */
  static walletBase(actor) {
    let total = 0;
    const cur = actor?.system?.currency || {};
    for (const d of this.defs()) total += (Number(cur[d.key]) || 0) * (Number(d.base_value) || 0);
    return total;
  }

  /** Раскладывает сумму в базовых единицах по деноминациям (жадно, сверху вниз). */
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

  /** Устанавливает кошелёк актора равным baseAmount (через раскладку). */
  static async setWalletBase(actor, baseAmount) {
    return actor.update({ "system.currency": this.collapse(Math.max(0, baseAmount)) });
  }

  /**
   * Цена ПОКУПКИ единицы у торговца (в базовых единицах), с учётом глобальной
   * наценки/скидки и персональной скидки игрока (по userId).
   */
  static buyUnitPrice(merchant, item, userId) {
    const base = Number(item.system?.base_price) || 0;
    const mod = Number(merchant.system?.buy_modifier_pct) || 0;
    const disc = Number(merchant.system?.personal_discounts?.[userId]) || 0;
    const price = base * (1 + mod / 100) * (1 - disc / 100);
    return Math.max(0, Math.round(price));
  }

  /**
   * Цена СКУПКИ единицы торговцем у игрока (в базовых единицах): доля от базовой
   * цены (sell_price_pct). Персональная скидка на скупку не влияет.
   */
  static sellUnitPrice(merchant, item) {
    const base = Number(item.system?.base_price) || 0;
    const pct = Number(merchant.system?.sell_price_pct) || 0;
    return Math.max(0, Math.round(base * pct / 100));
  }

  /** Человекочитаемая строка цены (напр. "1 зл 20 мд") из базовой суммы. */
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
