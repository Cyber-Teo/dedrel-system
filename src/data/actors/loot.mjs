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

      // Может ли актор быть получателем перевода денег (см. character.mjs).
      // Луту/контейнерам по умолчанию НЕ показываем в списке получателей —
      // иначе на большой сцене всплывают все сундуки.
      can_receive_currency: new f.BooleanField({ required: true, initial: false }),

      // Экономика торговца
      buy_modifier_pct: new f.NumberField({ required: true, initial: 0 }),        // +наценка / −скидка при покупке игроком
      can_sell_to: new f.BooleanField({ required: true, initial: true }),          // принимает ли продажу от игроков
      sell_price_pct: new f.NumberField({ required: true, initial: 50, min: 0 }),  // % базовой цены при скупке
      infinite_funds: new f.BooleanField({ required: true, initial: false }),      // безлимитная казна при скупке
      // Персональные скидки по игроку: { userId: procent }
      personal_discounts: new f.ObjectField({ required: false, initial: {} }),
      // Ссылки на RollTable (uuid или имя) для генерации случайного стока
      loot_tables: new f.ArrayField(new f.StringField(), { initial: [] }),

      // Максимальная нагрузка контейнера (кг). 0 = без лимита. Учитывается вес
      // предметов внутри + вес монет кошелька; при превышении добавление
      // предмета блокируется (хук preCreateItem, см. loot-sheet.mjs).
      capacity: new f.NumberField({ required: true, initial: 0, min: 0 })
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

    // Текущая нагрузка контейнера: вес предметов (× количество) + вес монет.
    let load = this.wallet.weight;
    if (this.parent?.items) {
      for (const it of this.parent.items) {
        const w = Number(it.system?.weight) || 0;
        if (w <= 0) continue;
        // ?? внутри Number(): у типов без quantity Number(undefined) дал бы NaN
        const qty = it.type === "currency" ? 1 : Number(it.system?.quantity ?? 1);
        load += w * qty;
      }
    }
    this.load = Math.round(load * 100) / 100;
  }
}
