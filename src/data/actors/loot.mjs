import { DedrelCurrency } from "../../utils/currency.mjs";

/**
 * Актор «Лут/Торговец/Контейнер» (тип loot). Один тип с режимами:
 *   loot      — свободный забор предметов и денег (раздача/добыча);
 *   merchant  — торговец (купля/продажа по прайсу);
 *   container — сундук/сумка (забор + «разделить деньги»; привязка к персонажу
 *               как предмет-ссылка — Блок C).
 *
 * Кошелёк (system.currency) и производный this.wallet — как у персонажа,
 * чтобы переводы/сделки работали единообразно (см. DedrelSocket, DedrelCurrency).
 */
export default class LootDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      mode: new f.StringField({ required: true, initial: "loot", choices: ["loot", "merchant", "container"] }),
      description: new f.HTMLField({ required: false, blank: true, initial: "" }),

      // Кошелёк
      currency: new f.ObjectField({ required: false, initial: {} }),

      // Экономика торговца
      buy_modifier_pct: new f.NumberField({ required: true, initial: 0 }),        // +наценка / −скидка при покупке игроком
      can_sell_to: new f.BooleanField({ required: true, initial: true }),          // принимает ли продажу от игроков
      sell_price_pct: new f.NumberField({ required: true, initial: 50, min: 0 }),  // % базовой цены при скупке
      infinite_funds: new f.BooleanField({ required: true, initial: false }),      // безлимитная казна при скупке
      // Персональные скидки по игроку: { userId: procent }
      personal_discounts: new f.ObjectField({ required: false, initial: {} }),
      // Ссылки на RollTable (uuid или имя) для генерации случайного стока
      loot_tables: new f.ArrayField(new f.StringField(), { initial: [] })
    };
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    // Производная суммарная ценность/вес кошелька (для UI)
    this.wallet = {
      total_base: DedrelCurrency.walletBase(this.parent),
      weight: 0
    };
    for (const d of DedrelCurrency.defs()) {
      this.wallet.weight += (Number(this.currency?.[d.key]) || 0) * (Number(d.weight) || 0);
    }
  }
}
