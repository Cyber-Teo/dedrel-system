import { DedrelCurrency } from "./utils/currency.mjs";

/**
 * Dedrel system socket broker (channel "system.dedrel").
 *
 * Purpose: operations a player can't perform themselves due to permissions
 * (money transfers, trades with merchants/loot/containers). The player emits a request;
 * it is executed by the active GM client, which owns all actors. The GM doesn't
 * validate/confirm anything — the operation goes through automatically (as in loot-sheet), it's enough
 * for a GM to be online.
 *
 * Duplication: with several GMs only the "first" active one handles it.
 * Validation errors are returned to the initiator via the "notify" action.
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
    // "notify" is addressed to a specific user (usually the trade's initiator)
    if (data?.action === "notify") {
      if (data.userId === game.user.id) ui.notifications[data.type || "warn"](data.message);
      return;
    }
    if (!game.user.isGM) return;
    if (this.#primaryGM?.id !== game.user.id) return; // a single GM performs the operation
    return this.#execute(data);
  }

  /** GM side: routing operations. */
  static async #execute(data) {
    switch (data?.action) {
      case "transferCurrency": return this._applyTransfer(data.sourceUuid, data.targetUuid, data.changes);
      case "buy":              return this._applyBuy(data);
      case "sell":             return this._applySell(data);
      case "take":             return this._applyTake(data);
      case "buyService":       return this._applyBuyService(data);
      case "distributeCoins":  return this._applyDistribute(data);
      default: console.warn("Dedrel | Unknown socket action:", data?.action);
    }
  }

  /** Sends an operation: locally (if GM) or through the active GM. */
  static async #dispatch(packet) {
    if (game.user.isGM) return this.#execute(packet);
    if (!this.#primaryGM) {
      ui.notifications.error(game.i18n.localize("DEDREL.Notifications.NoActiveGM"));
      return false;
    }
    game.socket.emit(this.CHANNEL, packet);
    return true;
  }

  /** Notification to the initiator (or locally, if the GM is the initiator). */
  static #notify(userId, message, type = "warn") {
    if (userId === game.user.id) { ui.notifications[type](message); return; }
    game.socket.emit(this.CHANNEL, { action: "notify", userId, message, type });
  }

  // ========================================================================
  // Currency transfer between actors (wallet → wallet)
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
  // Public helpers for sheets (emit/execute operations)
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
  // GM side: applying trades
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

    // Apply the service's effects to the buyer (if any)
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
  // Internal item movement helpers
  // ========================================================================
  /** Limits the quantity to the available stock (for items with quantity). */
  static #clampQty(item, requested) {
    const q = Math.max(1, Number(requested) || 1);
    if (item.system?.quantity !== undefined) return Math.min(q, Math.max(1, Number(item.system.quantity) || 1));
    return 1; // items without quantity count as single
  }

  /** Creates a copy of the item at the recipient in the amount of qty. */
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

  /** Reduces the item's stock at the source by qty (deletes it when it hits zero). */
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
