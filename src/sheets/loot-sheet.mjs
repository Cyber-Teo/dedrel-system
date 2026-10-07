import { DedrelSocket } from "../socket.mjs";
import { DedrelCurrency } from "../utils/currency.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Container load limit: we don't allow adding an item if its weight would exceed
 * the container actor's capacity (mode === "container", capacity > 0). Catches all
 * paths of creating an embedded item (drag-drop, socket, macros).
 */
Hooks.on("preCreateItem", (item, data, options, userId) => {
  const actor = item.parent;
  if (!(actor instanceof Actor) || actor.type !== "loot") return true;
  if (actor.system.mode !== "container") return true;
  const cap = Number(actor.system.capacity) || 0;
  if (cap <= 0) return true; // no limit
  // ?? inside Number(): for types without quantity Number(undefined) would give NaN
  const qty = item.type === "currency" ? 1 : Number(item.system?.quantity ?? 1);
  const incoming = (Number(item.system?.weight) || 0) * qty;
  const current = Number(actor.system.load) || 0;
  if (current + incoming > cap) {
    ui.notifications.warn(game.i18n.format("DEDREL.Loot.CapacityExceeded", { cap }));
    return false;
  }
  return true;
});

/**
 * Container load limit for COINS: we block depositing new coins into
 * the container's wallet (mode container, capacity > 0) if their weight would exceed
 * capacity. Catches all paths of changing system.currency (editing on the sheet, a transfer
 * via socket, depositing a currency item).
 */
Hooks.on("preUpdateActor", (actor, changes) => {
  if (actor.type !== "loot" || actor.system.mode !== "container") return true;
  const cap = Number(actor.system.capacity) || 0;
  if (cap <= 0) return true;
  // changes may come either as flat keys ("system.currency.copper") or
  // as a nested object ("system.currency": {...}) → normalize via expandObject.
  const expanded = foundry.utils.expandObject(foundry.utils.deepClone(changes));
  const curChanges = foundry.utils.getProperty(expanded, "system.currency");
  if (!curChanges || typeof curChanges !== "object") return true;

  const defs = DedrelCurrency.defs();
  const oldCur = actor.system.currency || {};
  const newCur = foundry.utils.mergeObject(foundry.utils.deepClone(oldCur), curChanges, { inplace: false });
  let delta = 0;
  for (const d of defs) {
    const w = Number(d.weight) || 0;
    if (w <= 0) continue;
    delta += ((Number(newCur[d.key]) || 0) - (Number(oldCur[d.key]) || 0)) * w;
  }
  // actor.system.load already includes the weight of the current coins → new load = load + delta
  if (delta > 0 && (Number(actor.system.load) || 0) + delta > cap) {
    ui.notifications.warn(game.i18n.format("DEDREL.Loot.CapacityExceeded", { cap }));
    return false;
  }
  return true;
});

/**
 * Sheet for the "Loot/Merchant/Container" actor (type loot).
 * A functional minimum (design is secondary): modes, merchant economy,
 * item stock with prices and trade buttons, wallet, "divide coins",
 * stock generation from a RollTable. Trades go through DedrelSocket (executed by the GM).
 */
export default class DedrelLootSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["dedrel", "sheet", "actor", "loot"],
    tag: "form",
    window: { resizable: true, controls: [] },
    position: { width: 640, height: 720 },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      editImage: DedrelLootSheet.#onEditImage,
      createItem: DedrelLootSheet.#onCreateItem,
      editItem: DedrelLootSheet.#onEditItem,
      deleteItem: DedrelLootSheet.#onDeleteItem,
      buyItem: DedrelLootSheet.#onBuyItem,
      sellItemPrompt: DedrelLootSheet.#onSellPrompt,
      takeItem: DedrelLootSheet.#onTakeItem,
      buyService: DedrelLootSheet.#onBuyService,
      rollStock: DedrelLootSheet.#onRollStock,
      divideCoins: DedrelLootSheet.#onDivideCoins,
      transferMoney: DedrelLootSheet.#onTransferMoney
    }
  };

  static PARTS = {
    body: { template: "systems/dedrel/templates/actor/loot-sheet.hbs" }
  };

  get title() { return this.document.name; }

  /** The buyer actor for the current user. */
  get buyerActor() {
    return game.user.character || canvas.tokens?.controlled?.[0]?.actor || null;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const sys = actor.system;
    const isGM = game.user.isGM;
    const userId = game.user.id;

    // Item stock with prices
    const items = [];
    for (const i of actor.items) {
      const isService = i.type === "service";
      const buyPrice = DedrelCurrency.buyUnitPrice(actor, i, userId);
      const sellPrice = DedrelCurrency.sellUnitPrice(actor, i);
      items.push({
        id: i.id, name: i.name, img: i.img, type: i.type,
        quantity: i.system?.quantity,
        isService,
        buyPriceLabel: DedrelCurrency.format(buyPrice),
        sellPriceLabel: DedrelCurrency.format(sellPrice)
      });
    }

    // Wallet
    const walletCurrencies = [];
    for (const d of DedrelCurrency.defs()) {
      walletCurrencies.push({ ...d, count: Number(sys.currency?.[d.key]) || 0 });
    }

    // Personal discounts: a row for each non-GM player
    const discountRows = game.users.filter(u => !u.isGM).map(u => ({
      userId: u.id, name: u.name, pct: Number(sys.personal_discounts?.[u.id]) || 0
    }));

    Object.assign(context, {
      actor, system: sys, isGM,
      editable: this.isEditable,
      isMerchant: sys.mode === "merchant",
      isLoot: sys.mode === "loot",
      isContainer: sys.mode === "container",
      modeOptions: {
        loot: game.i18n.localize("DEDREL.Loot.ModeLoot"),
        merchant: game.i18n.localize("DEDREL.Loot.ModeMerchant"),
        container: game.i18n.localize("DEDREL.Loot.ModeContainer")
      },
      items,
      walletCurrencies,
      walletTotal: DedrelCurrency.walletBase(actor),
      discountRows,
      lootTablesText: (sys.loot_tables || []).join("; "),
      load: sys.load || 0,
      capacity: sys.capacity || 0,
      loadPct: sys.capacity > 0 ? Math.min(100, Math.round(((sys.load || 0) / sys.capacity) * 100)) : 0,
      overCapacity: sys.capacity > 0 && (sys.load || 0) > sys.capacity
    });
    return context;
  }

  /** Converting the loot_tables text field (separated by ;) into an array. */
  _prepareSubmitData(event, form, formData) {
    const data = super._prepareSubmitData(event, form, formData);
    let val = data["system.loot_tables"];
    if (Array.isArray(val)) val = val[0];
    if (typeof val === "string") {
      data["system.loot_tables"] = val.split(";").map(s => s.trim()).filter(s => s.length > 0);
    }
    return data;
  }

  _onRender(context, options) {
    super._onRender(context, options);

    // Mode class on the window root for styling each mode separately:
    // .application.loot.loot-mode-{loot|merchant|container}
    this.element.classList.remove("loot-mode-loot", "loot-mode-merchant", "loot-mode-container");
    this.element.classList.add(`loot-mode-${this.document.system.mode}`);

    for (const row of this.element.querySelectorAll(".loot-item-row")) {
      row.setAttribute("draggable", "true");
      row.addEventListener("dragstart", this.#onDragStart.bind(this));
    }
  }

  #onDragStart(event) {
    const id = event.currentTarget.dataset.itemId;
    const item = id ? this.document.items.get(id) : null;
    if (item) event.dataTransfer.setData("text/plain", JSON.stringify({ type: "Item", uuid: item.uuid }));
  }

  /** A player drops their item onto a merchant → a sale; the GM → restocking. */
  async _onDrop(event) {
    let data;
    try { data = JSON.parse(event.dataTransfer.getData("text/plain")); }
    catch (e) { return super._onDrop(event); }
    if (data.type !== "Item") return super._onDrop(event);

    const item = await Item.implementation.fromDropData(data);
    if (!item) return super._onDrop(event);

    // Coins (a currency item) dropped onto the sheet are deposited into the actor's wallet
    // rather than placed as an item. The coin weight limit is checked by the preUpdateActor hook.
    if (item.type === "currency" && this.isEditable) {
      const ok = await this.#depositCurrencyItem(item);
      if (ok) return false;
    }

    const srcActor = item?.parent;
    if (!game.user.isGM && srcActor instanceof Actor && srcActor.id !== this.document.id) {
      if (this.document.system.mode === "merchant" && this.document.system.can_sell_to) {
        return DedrelSocket.sell(srcActor, this.document, item.id, 1);
      }
      ui.notifications.warn(game.i18n.localize("DEDREL.Loot.SellRefused"));
      return;
    }
    return super._onDrop(event);
  }

  /**
   * Deposits a currency item into the container actor's wallet (without creating
   * an item). Checks that the denomination is known and the container's weight limit.
   * @returns {Promise<boolean>} true if deposited (no need to create the dropped item)
   */
  async #depositCurrencyItem(item) {
    const denom = item.system?.denomination;
    const value = Number(item.system?.value) || 0;
    const defs = DedrelCurrency.defs();
    const def = defs.find(d => d.key === denom);
    if (!def || value <= 0) return false; // unknown currency → regular item creation

    // Pre-check of the weight limit (for a container with capacity): the weight of the coins being added.
    if (this.document.system.mode === "container") {
      const cap = Number(this.document.system.capacity) || 0;
      const added = value * (Number(def.weight) || 0);
      if (cap > 0 && added > 0 && (Number(this.document.system.load) || 0) + added > cap) {
        ui.notifications.warn(game.i18n.format("DEDREL.Loot.CapacityExceeded", { cap }));
        return true; // we don't create the item, but we don't deposit it either
      }
    }

    const current = Number(this.document.system.currency?.[denom]) || 0;
    await this.document.update({ [`system.currency.${denom}`]: current + value });
    ui.notifications.info(game.i18n.format("DEDREL.Notifications.CurrencyDeposited", { value, denom }));
    return true;
  }

  // ==== Actions ====
  static async #onEditImage(event, target) {
    const current = this.document.img;
    const fp = new foundry.applications.apps.FilePicker.implementation({
      type: "image", current,
      callback: path => this.document.update({ img: path })
    });
    return fp.browse();
  }

  static async #onCreateItem(event, target) {
    const type = target.dataset.type || "loot";
    return this.document.createEmbeddedDocuments("Item", [{ name: game.i18n.format("DEDREL.Loot.NewItem", { type }), type }]);
  }
  static async #onEditItem(event, target) {
    const item = this.document.items.get(target.closest(".loot-item-row").dataset.itemId);
    if (item) item.sheet.render(true);
  }
  static async #onDeleteItem(event, target) {
    const item = this.document.items.get(target.closest(".loot-item-row").dataset.itemId);
    if (item) item.deleteDialog();
  }

  static async #onBuyItem(event, target) {
    const buyer = this.buyerActor;
    if (!buyer) return ui.notifications.warn(game.i18n.localize("DEDREL.Loot.NoBuyer"));
    const itemId = target.closest(".loot-item-row").dataset.itemId;
    await DedrelSocket.buy(buyer, this.document, itemId, 1);
  }

  static async #onTakeItem(event, target) {
    const taker = this.buyerActor;
    if (!taker) return ui.notifications.warn(game.i18n.localize("DEDREL.Loot.NoBuyer"));
    const itemId = target.closest(".loot-item-row").dataset.itemId;
    await DedrelSocket.take(taker, this.document, itemId, 1);
  }

  static async #onBuyService(event, target) {
    const buyer = this.buyerActor;
    if (!buyer) return ui.notifications.warn(game.i18n.localize("DEDREL.Loot.NoBuyer"));
    const itemId = target.closest(".loot-item-row").dataset.itemId;
    await DedrelSocket.buyService(buyer, this.document, itemId);
  }

  static async #onSellPrompt(event, target) {
    ui.notifications.info(game.i18n.localize("DEDREL.Loot.SellHint"));
  }

  static async #onDivideCoins(event, target) {
    // Characters of active non-GM players
    const targets = [];
    for (const u of game.users) {
      if (u.isGM || !u.active) continue;
      if (u.character) targets.push(u.character.uuid);
    }
    if (!targets.length) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NoTransferTargets"));
    await DedrelSocket.distributeCoins(this.document, targets);
  }

  /**
   * Transferring money from a container to a recipient actor. A player transfers to their
   * linked character (game.user.character / a controlled token) or
   * to any owned wallet actor; the GM — to any actor with the
   * can_receive_currency flag. Execution goes through DedrelSocket.transferCurrency
   * (directly if permissions suffice, otherwise through the active GM).
   */
  static async #onTransferMoney(event, target) {
    const source = this.document;
    const defs = DedrelCurrency.defs();
    if (!defs.length) return ui.notifications.warn(game.i18n.localize("DEDREL.ActorSheet.NoCurrenciesConfigured"));

    // Recipients: actors with a wallet that are allowed to receive money.
    // A player is shown only the actors they own (usually their character).
    const targets = game.actors.filter(a =>
      a.id !== source.id
      && a.system?.currency !== undefined
      && a.system?.can_receive_currency
      && (game.user.isGM || a.isOwner));
    if (!targets.length) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NoTransferTargets"));

    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
    const targetOptions = targets.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join("");
    const currencyRows = defs.map(d => {
      const have = Number(source.system.currency?.[d.key]) || 0;
      return `<div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
          <label style="flex:1;">${esc(d.name)} (${esc(d.abbr)}) — ${game.i18n.localize("DEDREL.ActorSheet.WalletHave")}: ${have}</label>
          <input type="number" class="pay-amount" data-key="${esc(d.key)}" min="0" step="1" value="0" style="width:80px;"/>
        </div>`;
    }).join("");

    const content = `
      <div class="form-group" style="margin-bottom:8px;">
        <label style="font-weight:bold;">${game.i18n.localize("DEDREL.ActorSheet.TransferTo")}</label>
        <select id="pay-target" style="width:100%;">${targetOptions}</select>
      </div>
      <div>${currencyRows}</div>`;

    const { DialogV2 } = foundry.applications.api;
    await DialogV2.wait({
      window: { title: game.i18n.localize("DEDREL.ActorSheet.TransferMoney") },
      content,
      buttons: [
        {
          action: "pay",
          icon: "fa-solid fa-hand-holding-dollar",
          label: game.i18n.localize("DEDREL.ActorSheet.TransferSend"),
          default: true,
          callback: async (event, button, dialog) => {
            const targetId = dialog.element.querySelector("#pay-target")?.value;
            const targetActor = game.actors.get(targetId);
            if (!targetActor) return;
            const changes = {};
            for (const inp of dialog.element.querySelectorAll(".pay-amount")) {
              const amt = parseInt(inp.value) || 0;
              if (amt > 0) changes[inp.dataset.key] = amt;
            }
            if (!Object.keys(changes).length) return;
            await DedrelSocket.transferCurrency(source, targetActor, changes);
          }
        },
        { action: "cancel", icon: "fa-solid fa-times", label: game.i18n.localize("DEDREL.Chat.Cancel") }
      ]
    });
  }

  static async #onRollStock(event, target) {
    const tables = this.document.system.loot_tables || [];
    if (!tables.length) return ui.notifications.warn(game.i18n.localize("DEDREL.Loot.NoLootTables"));

    const { DialogV2 } = foundry.applications.api;
    const draws = await DialogV2.prompt({
      window: { title: game.i18n.localize("DEDREL.Loot.RollStock") },
      content: `<div class="form-group"><label>${game.i18n.localize("DEDREL.Loot.DrawsCount")}</label><input type="number" name="draws" value="5" min="1" style="width:100%;"/></div>`,
      ok: {
        label: game.i18n.localize("DEDREL.Loot.RollStock"),
        callback: (event, button, dialog) => parseInt(dialog.element.querySelector('[name="draws"]').value) || 5
      }
    }).catch(() => null);
    if (!draws) return;

    const toAdd = [];
    for (const ref of tables) {
      const table = await this.#resolveTable(ref);
      if (!table) { ui.notifications.warn(game.i18n.format("DEDREL.Loot.TableNotFound", { ref })); continue; }
      for (let i = 0; i < draws; i++) {
        const roll = await table.roll();
        for (const res of roll.results) {
          const doc = await this.#resultToItem(res);
          if (doc) { const d = doc.toObject(); delete d._id; toAdd.push(d); }
        }
      }
    }
    if (toAdd.length) {
      await this.document.createEmbeddedDocuments("Item", toAdd);
      ui.notifications.info(game.i18n.format("DEDREL.Loot.StockAdded", { n: toAdd.length }));
    } else {
      ui.notifications.warn(game.i18n.localize("DEDREL.Loot.StockNone"));
    }
  }

  async #resolveTable(ref) {
    if (!ref) return null;
    try { const d = await fromUuid(ref); if (d?.documentName === "RollTable") return d; } catch (e) {}
    return game.tables?.getName?.(ref) || game.tables?.get?.(ref) || null;
  }

  async #resultToItem(result) {
    try {
      if (result.documentUuid) { const d = await fromUuid(result.documentUuid); if (d?.documentName === "Item") return d; }
    } catch (e) {}
    const collection = result.documentCollection;
    const id = result.documentId;
    if (collection && id) {
      const pack = game.packs.get(collection);
      if (pack) { try { const d = await pack.getDocument(id); if (d?.documentName === "Item") return d; } catch (e) {} }
      const world = game.items.get(id);
      if (world) return world;
    }
    return null;
  }
}
