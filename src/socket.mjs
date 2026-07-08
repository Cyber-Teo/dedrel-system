import { DedrelCurrency } from "./utils/currency.mjs";

/**
 * Системный socket-брокер Dedrel (канал "system.dedrel").
 *
 * Назначение: операции, которые игрок не может выполнить сам из-за прав
 * (перевод денег, сделки с торговцами/лутом/контейнерами). Игрок эмитит запрос;
 * исполняет активный ГМ-клиент, владеющий всеми акторами. Валидацией/подтверждением
 * ГМ не занимается — операция проходит автоматически (как в loot-sheet), достаточно
 * ГМа онлайн на связи.
 *
 * Дублирование: при нескольких ГМах обрабатывает только «первый» активный.
 * Ошибки валидации возвращаются инициатору через action "notify".
 */
export class DedrelSocket {
  static CHANNEL = "system.dedrel";

  static listen() {
    game.socket.on(this.CHANNEL, (data) => this.#onMessage(data));
  }

  static get #primaryGM() {
    return game.users.find(u => u.isGM && u.active) || null;
  }

  static async #onMessage(data) {
    // "notify" адресован конкретному пользователю (обычно инициатору сделки)
    if (data?.action === "notify") {
      if (data.userId === game.user.id) ui.notifications[data.type || "warn"](data.message);
      return;
    }
    if (!game.user.isGM) return;
    if (this.#primaryGM?.id !== game.user.id) return; // операцию выполняет один ГМ
    return this.#execute(data);
  }

  /** GM-сторона: маршрутизация операций. */
  static async #execute(data) {
    switch (data?.action) {
      case "transferCurrency": return this._applyTransfer(data.sourceUuid, data.targetUuid, data.changes);
      case "buy":              return this._applyBuy(data);
      case "sell":             return this._applySell(data);
      case "take":             return this._applyTake(data);
      case "buyService":       return this._applyBuyService(data);
      case "distributeCoins":  return this._applyDistribute(data);
      default: console.warn("Dedrel | Неизвестное socket-действие:", data?.action);
    }
  }

  /** Отправляет операцию: локально (если ГМ) или через активного ГМа. */
  static async #dispatch(packet) {
    if (game.user.isGM) return this.#execute(packet);
    if (!this.#primaryGM) {
      ui.notifications.error(game.i18n.localize("DEDREL.Notifications.NoActiveGM"));
      return false;
    }
    game.socket.emit(this.CHANNEL, packet);
    return true;
  }

  /** Уведомление инициатору (или локально, если ГМ сам инициатор). */
  static #notify(userId, message, type = "warn") {
    if (userId === game.user.id) { ui.notifications[type](message); return; }
    game.socket.emit(this.CHANNEL, { action: "notify", userId, message, type });
  }

  // ========================================================================
  // Перевод валюты между акторами (кошелёк → кошелёк)
  // ========================================================================
  static async transferCurrency(source, target, changes) {
    if (!source || !target) return false;
    const srcCur = source.system.currency || {};
    for (const [k, amt] of Object.entries(changes)) {
      const a = Number(amt) || 0;
      if (a > 0 && (Number(srcCur[k]) || 0) < a) {
        ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NotEnoughFunds"));
        return false;
      }
    }
    if (game.user.isGM || (source.isOwner && target.isOwner)) {
      return this._applyTransfer(source.uuid, target.uuid, changes);
    }
    if (!this.#primaryGM) {
      ui.notifications.error(game.i18n.localize("DEDREL.Notifications.NoActiveGM"));
      return false;
    }
    game.socket.emit(this.CHANNEL, { action: "transferCurrency", sourceUuid: source.uuid, targetUuid: target.uuid, changes });
    ui.notifications.info(game.i18n.localize("DEDREL.Notifications.TransferRequested"));
    return true;
  }

  static async _applyTransfer(sourceUuid, targetUuid, changes) {
    const source = await fromUuid(sourceUuid);
    const target = await fromUuid(targetUuid);
    if (!source || !target) return false;
    const srcCur = foundry.utils.deepClone(source.system.currency || {});
    const tgtCur = foundry.utils.deepClone(target.system.currency || {});
    for (const [k, amt] of Object.entries(changes)) {
      const a = Number(amt) || 0;
      if (a <= 0) continue;
      const have = Number(srcCur[k]) || 0;
      if (have < a) { ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NotEnoughFunds")); return false; }
      srcCur[k] = have - a;
      tgtCur[k] = (Number(tgtCur[k]) || 0) + a;
    }
    await source.update({ "system.currency": srcCur });
    await target.update({ "system.currency": tgtCur });
    this.#chat(source, game.i18n.format("DEDREL.Notifications.TransferDone", {
      source: foundry.utils.escapeHTML(source.name), target: foundry.utils.escapeHTML(target.name)
    }));
    return true;
  }

  // ========================================================================
  // Публичные помощники для листов (эмитят/исполняют операции)
  // ========================================================================
  static buy(buyer, merchant, itemId, quantity = 1) {
    return this.#dispatch({ action: "buy", buyerUuid: buyer.uuid, merchantUuid: merchant.uuid, itemId, quantity, userId: game.user.id });
  }
  static sell(seller, merchant, itemId, quantity = 1) {
    return this.#dispatch({ action: "sell", sellerUuid: seller.uuid, merchantUuid: merchant.uuid, itemId, quantity, userId: game.user.id });
  }
  static take(taker, loot, itemId, quantity = 1) {
    return this.#dispatch({ action: "take", takerUuid: taker.uuid, lootUuid: loot.uuid, itemId, quantity, userId: game.user.id });
  }
  static buyService(buyer, merchant, itemId) {
    return this.#dispatch({ action: "buyService", buyerUuid: buyer.uuid, merchantUuid: merchant.uuid, itemId, userId: game.user.id });
  }
  static distributeCoins(loot, targetUuids) {
    return this.#dispatch({ action: "distributeCoins", lootUuid: loot.uuid, targetUuids, userId: game.user.id });
  }

  // ========================================================================
  // GM-сторона: применение сделок
  // ========================================================================
  static async _applyBuy(data) {
    const buyer = await fromUuid(data.buyerUuid);
    const merchant = await fromUuid(data.merchantUuid);
    const item = merchant?.items.get(data.itemId);
    if (!buyer || !merchant || !item) return false;

    const qty = this.#clampQty(item, data.quantity);
    const total = DedrelCurrency.buyUnitPrice(merchant, item, data.userId) * qty;
    const buyerBase = DedrelCurrency.walletBase(buyer);
    if (buyerBase < total) {
      this.#notify(data.userId, game.i18n.localize("DEDREL.Notifications.NotEnoughFunds"));
      return false;
    }

    await DedrelCurrency.setWalletBase(buyer, buyerBase - total);
    await DedrelCurrency.setWalletBase(merchant, DedrelCurrency.walletBase(merchant) + total);
    await this.#giveItem(buyer, item, qty);
    await this.#reduceStock(merchant, item, qty);

    this.#chat(buyer, game.i18n.format("DEDREL.Loot.BoughtMsg", {
      buyer: foundry.utils.escapeHTML(buyer.name), qty, item: foundry.utils.escapeHTML(item.name),
      merchant: foundry.utils.escapeHTML(merchant.name), price: DedrelCurrency.format(total)
    }));
    return true;
  }

  static async _applySell(data) {
    const seller = await fromUuid(data.sellerUuid);
    const merchant = await fromUuid(data.merchantUuid);
    const item = seller?.items.get(data.itemId);
    if (!seller || !merchant || !item) return false;

    if (!merchant.system.can_sell_to) {
      this.#notify(data.userId, game.i18n.localize("DEDREL.Loot.SellRefused")); return false;
    }
    if (item.system.can_be_sold === false) {
      this.#notify(data.userId, game.i18n.localize("DEDREL.Loot.ItemNotSellable")); return false;
    }

    const qty = this.#clampQty(item, data.quantity);
    const total = DedrelCurrency.sellUnitPrice(merchant, item) * qty;

    if (!merchant.system.infinite_funds) {
      const mBase = DedrelCurrency.walletBase(merchant);
      if (mBase < total) { this.#notify(data.userId, game.i18n.localize("DEDREL.Loot.MerchantNoFunds")); return false; }
      await DedrelCurrency.setWalletBase(merchant, mBase - total);
    }
    await DedrelCurrency.setWalletBase(seller, DedrelCurrency.walletBase(seller) + total);
    await this.#giveItem(merchant, item, qty);
    await this.#reduceStock(seller, item, qty);

    this.#chat(seller, game.i18n.format("DEDREL.Loot.SoldMsg", {
      seller: foundry.utils.escapeHTML(seller.name), qty, item: foundry.utils.escapeHTML(item.name),
      merchant: foundry.utils.escapeHTML(merchant.name), price: DedrelCurrency.format(total)
    }));
    return true;
  }

  static async _applyTake(data) {
    const taker = await fromUuid(data.takerUuid);
    const loot = await fromUuid(data.lootUuid);
    const item = loot?.items.get(data.itemId);
    if (!taker || !loot || !item) return false;
    const qty = this.#clampQty(item, data.quantity);
    await this.#giveItem(taker, item, qty);
    await this.#reduceStock(loot, item, qty);
    this.#chat(taker, game.i18n.format("DEDREL.Loot.TookMsg", {
      taker: foundry.utils.escapeHTML(taker.name), qty, item: foundry.utils.escapeHTML(item.name),
      loot: foundry.utils.escapeHTML(loot.name)
    }));
    return true;
  }

  static async _applyBuyService(data) {
    const buyer = await fromUuid(data.buyerUuid);
    const merchant = await fromUuid(data.merchantUuid);
    const item = merchant?.items.get(data.itemId);
    if (!buyer || !merchant || !item) return false;

    const price = DedrelCurrency.buyUnitPrice(merchant, item, data.userId);
    const buyerBase = DedrelCurrency.walletBase(buyer);
    if (buyerBase < price) { this.#notify(data.userId, game.i18n.localize("DEDREL.Notifications.NotEnoughFunds")); return false; }

    await DedrelCurrency.setWalletBase(buyer, buyerBase - price);
    await DedrelCurrency.setWalletBase(merchant, DedrelCurrency.walletBase(merchant) + price);

    // Применяем эффекты услуги покупателю (если есть)
    if (item.effects.size > 0) {
      const effects = item.effects.map(e => {
        const d = e.toObject(); delete d._id; d.origin = buyer.uuid; d.transfer = false; return d;
      });
      await buyer.createEmbeddedDocuments("ActiveEffect", effects);
    }

    this.#chat(buyer, game.i18n.format("DEDREL.Loot.ServiceMsg", {
      buyer: foundry.utils.escapeHTML(buyer.name), item: foundry.utils.escapeHTML(item.name),
      merchant: foundry.utils.escapeHTML(merchant.name), price: DedrelCurrency.format(price)
    }));
    return true;
  }

  static async _applyDistribute(data) {
    const loot = await fromUuid(data.lootUuid);
    if (!loot) return false;
    const targets = (await Promise.all((data.targetUuids || []).map(u => fromUuid(u)))).filter(Boolean);
    if (!targets.length) { this.#notify(data.userId, game.i18n.localize("DEDREL.Notifications.NoTransferTargets")); return false; }

    const total = DedrelCurrency.walletBase(loot);
    const share = Math.floor(total / targets.length);
    if (share <= 0) { this.#notify(data.userId, game.i18n.localize("DEDREL.Loot.NothingToDivide")); return false; }

    for (const t of targets) await DedrelCurrency.setWalletBase(t, DedrelCurrency.walletBase(t) + share);
    await DedrelCurrency.setWalletBase(loot, total - share * targets.length);

    this.#chat(loot, game.i18n.format("DEDREL.Loot.DividedMsg", {
      loot: foundry.utils.escapeHTML(loot.name), share: DedrelCurrency.format(share), n: targets.length
    }));
    return true;
  }

  // ========================================================================
  // Внутренние помощники перемещения предметов
  // ========================================================================
  /** Ограничивает количество доступным стоком (для предметов с quantity). */
  static #clampQty(item, requested) {
    const q = Math.max(1, Number(requested) || 1);
    if (item.system?.quantity !== undefined) return Math.min(q, Math.max(1, Number(item.system.quantity) || 1));
    return 1; // предметы без quantity считаются единичными
  }

  /** Создаёт копию предмета у получателя в количестве qty. */
  static async #giveItem(actor, item, qty) {
    const data = item.toObject();
    delete data._id;
    if (data.system?.quantity !== undefined) {
      data.system.quantity = qty;
      await actor.createEmbeddedDocuments("Item", [data]);
    } else {
      const copies = Array.from({ length: qty }, () => foundry.utils.deepClone(data));
      await actor.createEmbeddedDocuments("Item", copies);
    }
  }

  /** Уменьшает сток предмета у источника на qty (удаляет при обнулении). */
  static async #reduceStock(actor, item, qty) {
    if (item.system?.quantity !== undefined) {
      const left = (Number(item.system.quantity) || 0) - qty;
      if (left <= 0) await item.delete();
      else await item.update({ "system.quantity": left });
    } else {
      await item.delete();
    }
  }

  static #chat(speakerActor, html) {
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: speakerActor }),
      content: `<div class="dedrel-item-chat"><p>${html}</p></div>`
    });
  }
}
