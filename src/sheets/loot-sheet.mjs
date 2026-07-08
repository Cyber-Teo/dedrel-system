import { DedrelSocket } from "../socket.mjs";
import { DedrelCurrency } from "../utils/currency.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Лимит нагрузки контейнера: не даём добавить предмет, если его вес превысит
 * capacity актора-контейнера (mode === "container", capacity > 0). Ловит все
 * пути создания вложенного предмета (drag-drop, сокет, макросы).
 */
Hooks.on("preCreateItem", (item, data, options, userId) => {
  const actor = item.parent;
  if (!(actor instanceof Actor) || actor.type !== "loot") return true;
  if (actor.system.mode !== "container") return true;
  const cap = Number(actor.system.capacity) || 0;
  if (cap <= 0) return true; // без лимита
  const qty = item.type === "currency" ? 1 : (Number(item.system?.quantity) ?? 1);
  const incoming = (Number(item.system?.weight) || 0) * qty;
  const current = Number(actor.system.load) || 0;
  if (current + incoming > cap) {
    ui.notifications.warn(game.i18n.format("DEDREL.Loot.CapacityExceeded", { cap }));
    return false;
  }
  return true;
});

/**
 * Лист актора «Лут/Торговец/Контейнер» (тип loot).
 * Функциональный минимум (дизайн — вторично): режимы, экономика торговца,
 * сток предметов с ценами и кнопками сделок, кошелёк, «разделить деньги»,
 * генерация стока из RollTable. Сделки идут через DedrelSocket (ГМ-исполнение).
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
      divideCoins: DedrelLootSheet.#onDivideCoins
    }
  };

  static PARTS = {
    body: { template: "systems/dedrel/templates/actor/loot-sheet.hbs" }
  };

  get title() { return this.document.name; }

  /** Актор-покупатель для текущего пользователя. */
  get buyerActor() {
    return game.user.character || canvas.tokens?.controlled?.[0]?.actor || null;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const sys = actor.system;
    const isGM = game.user.isGM;
    const userId = game.user.id;

    // Сток предметов с ценами
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

    // Кошелёк
    const walletCurrencies = [];
    for (const d of DedrelCurrency.defs()) {
      walletCurrencies.push({ ...d, count: Number(sys.currency?.[d.key]) || 0 });
    }

    // Персональные скидки: строка на каждого не-ГМ игрока
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

  /** Конвертация текстового поля loot_tables (через ;) в массив. */
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

    // Класс режима на корне окна для отдельной стилизации каждого режима:
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

  /** Игрок бросает свой предмет на торговца → продажа; ГМ → пополнение стока. */
  async _onDrop(event) {
    let data;
    try { data = JSON.parse(event.dataTransfer.getData("text/plain")); }
    catch (e) { return super._onDrop(event); }
    if (data.type !== "Item") return super._onDrop(event);

    const item = await Item.implementation.fromDropData(data);
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
    // Персонажи активных не-ГМ игроков
    const targets = [];
    for (const u of game.users) {
      if (u.isGM || !u.active) continue;
      if (u.character) targets.push(u.character.uuid);
    }
    if (!targets.length) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NoTransferTargets"));
    await DedrelSocket.distributeCoins(this.document, targets);
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
