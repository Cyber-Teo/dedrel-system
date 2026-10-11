import { DedrelItemSheet } from "../sheets/item-sheet.mjs";
import { DedrelBonuses } from "../utils/dedrel-bonuses.mjs";
import { heldTwoHanded } from "../utils/grip.mjs";
import { SpellCalculator } from "../utils/spell-calculator.mjs";
import { hasTokenLightChanges } from "../config/effect-library.mjs";
import { ActionEconomy } from "../utils/action-economy.mjs";
import { CompendiumTranslation } from "../l10n/compendium-translation.mjs";
const { DialogV2 } = foundry.applications.api;

/**
 * Extended Item class for the Dedrel system.
 * Overrides the item's standard methods and adds custom logic,
 * such as using items (spending AP) and posting to chat with attack/damage buttons.
 */
export default class DedrelItem extends Item {

  /**
   * Translation of documents from the system's packs (src/l10n/compendium-translation.mjs).
   * Embedded actor items from packs learn their pack through the parent.
   * @override
   */
  _initializeSource(data, options = {}) {
    const source = super._initializeSource(data, options);
    return CompendiumTranslation.translateSource(source, options.pack ?? this.parent?.pack,
      { creation: options.creation });
  }

  /** Don't let English text be written into the pack's Russian source. @override */
  async _preUpdate(changes, options, user) {
    const allowed = await super._preUpdate(changes, options, user);
    if (allowed === false) return false;
    CompendiumTranslation.stripTranslatedChanges(this, changes);
  }

  async _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    
    if (userId !== game.user.id) return;
    if (!this.isEmbedded || !(this.parent instanceof Actor)) return;

    const addsItems = this.system.adds_items;
    if (!addsItems || !addsItems.length) return;

    const itemsToAdd = [];
    let itemNamesToFind = [];
    for (const item of addsItems) {
      if (item.includes(";")) {
        itemNamesToFind.push(...item.split(";").map(s => s.trim()).filter(s => s.length > 0));
      } else {
        if (item.trim().length > 0) itemNamesToFind.push(item.trim());
      }
    }
    
    if (itemNamesToFind.length === 0) return;
    
    for (const pack of game.packs) {
      if (pack.documentName !== "Item") continue;
      
      const index = await pack.getIndex({ fields: ["system.key"] });
      for (let i = itemNamesToFind.length - 1; i >= 0; i--) {
        const itemName = itemNamesToFind[i];
        const entry = index.find(idx => idx.system?.key === itemName || idx.name === itemName);
        if (entry) {
          const itemDoc = await pack.getDocument(entry._id);
          const itemData = itemDoc.toObject();
          foundry.utils.setProperty(itemData, "flags.dedrel.parentItemId", this.id);
          itemsToAdd.push(itemData);
          itemNamesToFind.splice(i, 1);
        }
      }
      if (itemNamesToFind.length === 0) break;
    }
    
    if (itemNamesToFind.length > 0) {
      ui.notifications.warn(game.i18n.format("DEDREL.Notifications.ItemsNotFound", {names: itemNamesToFind.join(", ")}));
    }
    
    if (itemsToAdd.length > 0) {
      await this.parent.createEmbeddedDocuments("Item", itemsToAdd);
      ui.notifications.info(game.i18n.format("DEDREL.Notifications.LinkedItemsAdded", {names: itemsToAdd.map(i => i.name).join(", ")}));
    }
  }

  async _onDelete(options, userId) {
    super._onDelete(options, userId);
    
    if (userId !== game.user.id) return;
    if (!this.isEmbedded || !(this.parent instanceof Actor)) return;
    
    const childItems = this.parent.items.filter(i => i.getFlag("dedrel", "parentItemId") === this.id);
    if (childItems.length > 0) {
      await this.parent.deleteEmbeddedDocuments("Item", childItems.map(i => i.id));
      ui.notifications.info(game.i18n.format("DEDREL.Notifications.DependentItemsRemoved", {names: childItems.map(i => i.name).join(", ")}));
    }
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    const usesMaxStr = this.system.uses_max || "0";
    const usesMax = parseInt(usesMaxStr, 10) || 0;
    this.system.has_charges = usesMax > 0;
  }

  /**
   * Item activation/use method (called on clicking the item or on a roll).
   * Flow orchestrator: gates by type → effective cost → weapon and resource
   * requirements → early return for passives → confirmation dialog.
   * Dialog assembly — #buildUseDialogContent, execution — #confirmUse.
   */
  async use(options = {}) {
    const actor = this.actor;
    if (!actor) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ItemNotOwned"));

    if (!["maneuver", "talent", "mutation", "spell", "magic_item", "weapon", "armor", "loot", "trade_good", "potion", "scroll"].includes(this.type)) {
      return this.postToChat();
    }

    if (await this.#toggleLightEffects()) return;

    // A scroll without a bound spell can't be used — open the sheet
    // so the GM can set spell_id/spell_key (don't waste the scroll).
    if (this.type === "scroll" && !this.system.spell_id && !this.system.spell_key) {
      ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ScrollNoSpell"));
      return this.sheet.render(true);
    }

    // Reading a scroll (16. Magic §10): the scroll is held in a free limb.
    // Hand slots are resolved to live items (a dead reference doesn't occupy a hand);
    // a true two-handed weapon occupies both hands regardless of the slots.
    // The check is shared by a direct click on the scroll and the reading maneuver.
    if (this.type === "scroll" || (this.type === "maneuver" && this.system.is_scroll_read)) {
      const slots = actor.system.equipment_slots || {};
      const handItem = (s) => actor.items.get(slots[s]?.item_id);
      const main = handItem("main_hand");
      const off = handItem("off_hand");
      const noFreeHand = (main && off) || main?.system?.is_twohanded || off?.system?.is_twohanded;
      if (noFreeHand) {
        return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ScrollNoFreeHand"));
      }
    }

    // Re-validation of a built spell (Spell Constructor): the doctrine rank
    // may have changed since saving, the build's path must be known to the caster,
    // and the item fields may have been edited by hand. For linear doctrines
    // (a doctrine is set but it isn't in the Constructor config — Aetheromancy, Telepathy,
    // etc.) only the rank gate is checked. Spells without a doctrine — no check.
    if (this.type === "spell" && this.system.doctrine) {
      const proceed = await this.#validateSpellCast(actor);
      if (!proceed) return;
    }

    // Effective cost with DSL modifiers and the global discount applied.
    // apModApplied matters below: if a buff made the maneuver free, we must not
    // return early — we have to go through the flow to burn the buff and post the card.
    let { cost: apCost, modApplied: apModApplied } = DedrelBonuses.effectiveApCost(actor, this);

    // Extension point: macros and modules can adjust the cost before the dialog
    const hookCtx = { actor, item: this, apCost };
    Hooks.callAll("dedrelPreUseItem", hookCtx);
    apCost = hookCtx.apCost;

    // Charges check
    const usesMaxStr = this.system.uses_max || "0";
    const usesMax = parseInt(usesMaxStr, 10) || 0;
    const usesValue = this.system.uses_value || 0;
    const hasCharges = usesMax > 0;

    // Weapon requirement check
    const { requiresWeapon, validWeapons } = this.#collectWeaponRequirements(actor);

    // Reload: the AP cost is dictated by the weapon itself (system.reload_cost 1-3), not
    // the maneuver. For display in the dialog we take the first valid weapon; in #confirmUse
    // the cost is recomputed for the weapon actually selected (the actor may have
    // several reloadable ones). This way the player can't reload an arquebus cheaply.
    const isReloadAction = this.type === "maneuver" && this.system.is_reload_action;
    if (isReloadAction && validWeapons.length > 0) {
      apCost = validWeapons[0].system.reload_cost || 1;
    }

    // Weapon tempo (Fast −1 AP / Slow +1 AP on attacking reactions,
    // 13. Weapons). Like reloading, it depends on the specific weapon: for
    // the dialog we compute it from the first valid one, in #confirmUse the cost is recomputed
    // for the one actually selected. We keep the base in the context, otherwise the recomputation
    // would apply the shift a second time on top of the already shifted cost.
    const apCostNoTempo = apCost;
    if (validWeapons.length > 0) {
      apCost = DedrelBonuses.applyWeaponTempo(apCost, this, validWeapons[0]);
    }

    // Reading a scroll: the AP cost is dictated by the selected scroll (derived from rarity),
    // just as reloading takes its cost from the weapon. For the dialog — the first scroll's cost,
    // in #confirmUse it is recomputed for the one actually selected.
    const isScrollRead = this.type === "maneuver" && this.system.is_scroll_read;
    let validScrolls = [];
    if (isScrollRead) {
      validScrolls = actor.items.filter(i =>
        i.type === "scroll" && (i.system.quantity || 0) > 0
        && (i.system.spell_id || i.system.spell_key)
      );
      if (!validScrolls.length) {
        return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NoScrollsToRead"));
      }
      apCost = validScrolls[0].system.ap_cost || 0;
    }

    // Digging the item out of the pack (15. Inventory §2). For the reading maneuver it
    // depends on the selected scroll: the dialog marks such scrolls, #confirmUse recomputes.
    const retrieval = this.#retrievalFor(this);

    // Consumable items check.
    // IMPORTANT: the weapon's ammunition (consume_target) is NOT touched here — a weapon by
    // itself doesn't "fire". A shot = a maneuver with req_weapon; the selected weapon's
    // ammunition is spent in #confirmUse. Otherwise clicking a weapon in the inventory
    // (item.use → sheet) would turn into an ammunition consumption dialog.
    let consumeAmount = this.system.consume_amount || 1;
    let isSelfConsume = false;
    let hasEnoughAmmo = true;
    let consumesResources = false;

    if (this.system.properties?.consumed_on_use || this.system.consumable || this.type === "ammunition") {
      isSelfConsume = true;
      consumesResources = true;
      if ((this.system.quantity || 0) < consumeAmount) {
        hasEnoughAmmo = false;
      }
    }

    // Having self effects also blocks the early return:
    // they have to be applied through the full use flow.
    const hasSelfEffects = this.effects.some(e => e.getFlag("dedrel", "applyTo") === "self");

    // An active payload (bound spell / healing) also requires the full flow,
    // otherwise a wand/amulet without charges and AP would just open the sheet instead of firing.
    const hasBoundSpell = (this.type === "scroll" || this.type === "magic_item")
      && (this.system.spell_id || this.system.spell_key);
    const hasActivePayload = hasBoundSpell || !!this.system.formula_heal || !!this.system.formula_temp_hp;

    // If the item is fully passive, just open its window (so as not to spam the chat)
    const isPassiveSubtype = (this.type === "talent" || this.type === "mutation") && this.system.subtype === "passive";
    if (apCost === 0 && !hasCharges && !requiresWeapon && !consumesResources && !hasSelfEffects && !hasActivePayload && (isPassiveSubtype || this.type === "weapon" || this.type === "magic_item" || this.type === "armor" || this.type === "loot" || this.type === "trade_good" || this.type === "ammunition")) {
      return this.sheet.render(true);
    }

    // IMPORTANT: if a bonus made the maneuver free (apModApplied), we do NOT return early.
    // The flow has to continue in order to: 1) burn the buff, 2) post the card to chat.
    if (apCost === 0 && !apModApplied && !hasCharges && !requiresWeapon && !consumesResources && !hasSelfEffects && !hasActivePayload) {
      return this.sheet.render(true);
    }

    // AP pools are computed once: they're needed both by the dialog (available AP, the cap
    // on a variable cost) and by #confirmUse (spending from the special/universal pool).
    const isVariable = this.system.is_variable_cost;
    const minAp = apCost;
    const pools = (apCost > 0 || isVariable)
      ? this.#resolveApPools()
      : { currentAp: 0, apSpecific: 0, specificApKey: "" };

    // The usage mode (Action / Chain / Reaction) is decided here, not by the card's
    // flags: a maneuver can be marked with several types at once.
    const actionMode = (this.type === "maneuver" || this.type === "spell")
      ? ActionEconomy.resolveMode(actor, this, options.mode)
      : "free";

    const ctx = {
      actor, apCost, apCostNoTempo, isVariable, minAp, ...pools, actionMode,
      hasCharges, usesValue, usesMax,
      requiresWeapon, validWeapons, isReloadAction,
      isScrollRead, validScrolls, retrieval,
      isSelfConsume, consumeAmount, hasEnoughAmmo
    };

    await DialogV2.wait({
      window: { title: game.i18n.format("DEDREL.Chat.UseItem", {name: this.name}) },
      content: this.#buildUseDialogContent(ctx),
      buttons: [
        {
          action: "confirm",
          icon: "fa-solid fa-check",
          label: game.i18n.localize("DEDREL.Chat.Confirm"),
          callback: (event, button, dialog) => this.#confirmUse(dialog, ctx)
        },
        {
          action: "cancel",
          icon: "fa-solid fa-times",
          label: game.i18n.localize("DEDREL.Chat.Cancel")
        }
      ]
    });
  }

  /**
   * Light-source toggle: for an item with its own light transfer effect
   * (torch, lamp), using it TOGGLES the light (the effect's disabled), rather than
   * stacking copies onto the actor. Light is native token.light.* change rows,
   * core applies/clears them itself.
   *
   * Equippable types (weapons, armor) also end up here: a torch occupies a hand and
   * so is made a weapon, and their use by itself isn't an attack (attacks go through a maneuver
   * with req_weapon); without the toggle clicking a torch would just open the sheet. An item
   * without a light transfer effect passes by and behaves as before.
   * Potions and scrolls are left alone — they're consumables.
   * @returns {Promise<boolean>} true — the item turned out to be a light source and was toggled.
   */
  async #toggleLightEffects() {
    if (!["magic_item", "loot", "trade_good", "weapon", "armor"].includes(this.type)) return false;
    const lightEffects = this.effects.filter(e => e.transfer && hasTokenLightChanges(e));
    if (!lightEffects.length) return false;

    const enable = lightEffects.some(e => e.disabled);
    for (const effect of lightEffects) await effect.update({ disabled: !enable });

    // An equippable light source only shines from a slot: the transfer effect
    // of an unequipped item is suppressed (Actor#itemEffectsActive), so
    // when a torch is "lit" in the backpack, we honestly warn that the token won't light up.
    if (enable && !this.actor.itemEffectsActive(this)) {
      ui.notifications.warn(game.i18n.format("DEDREL.Notifications.LightOnUnequipped", { name: this.name }));
      return true;
    }
    ui.notifications.info(game.i18n.format(
      enable ? "DEDREL.Notifications.LightOn" : "DEDREL.Notifications.LightOff",
      { name: this.name }
    ));
    return true;
  }

  /**
   * Determines whether the maneuver/spell requires a weapon and picks the suitable
   * equipped weapons. Requirement categories combine with "AND"; within a
   * category ANY of the marked ones is enough ("OR").
   * @returns {{requiresWeapon: boolean, validWeapons: Item[]}}
   */
  #collectWeaponRequirements(actor) {
    // Reading a scroll (16. Magic §10): always requires an equipped magic
    // focus — like casting magic. A free second hand is checked in use().
    if (this.type === "scroll") {
      const validWeapons = actor.items.filter(i =>
        i.type === "weapon" && i.system.equipped && i.system.weapon_type?.magic
      );
      return { requiresWeapon: true, validWeapons };
    }

    if (this.type !== "maneuver" && this.type !== "spell") {
      return { requiresWeapon: false, validWeapons: [] };
    }

    const wType = this.system.req_weapon_type || {};
    const wDmg = this.system.req_weapon_damage_type || {};
    const wProp = this.system.req_weapon_property || {};
    const reqSkill = this.system.req_weapon_skill_group || "";
    // Gate on a specific weapon: substrings are searched in system.key AND in the name
    // (case-insensitive), a match on any substring is enough. Magical and
    // material variants pass as long as they inherit the base key/name
    // ("adamantine_greatsword", "Adamantine Greatsword").
    const reqKeys = (this.system.req_weapon_keys || []).filter(k => k && k.trim());

    const requiresWeapon = !!(
      wType.melee || wType.ranged || wType.shield || wType.magic ||
      wDmg.piercing || wDmg.bludgeoning || wDmg.slashing ||
      Object.values(wProp).some(Boolean) ||
      (reqSkill && reqSkill !== "any") ||
      reqKeys.length > 0
    );
    if (!requiresWeapon) return { requiresWeapon: false, validWeapons: [] };

    const validWeapons = actor.items.filter(i => {
      if (i.type !== "weapon" || !i.system.equipped) return false;

      if (reqSkill && reqSkill !== "any" && i.system.skill !== reqSkill) return false;

      if (reqKeys.length > 0) {
        const wKey = (i.system.key || "").toLowerCase();
        const wName = i.name.toLowerCase();
        const matchKey = reqKeys.some(k => {
          const needle = k.trim().toLowerCase();
          return wKey.includes(needle) || wName.includes(needle);
        });
        if (!matchKey) return false;
      }

      const hasReqType = wType.melee || wType.ranged || wType.shield || wType.magic;
      if (hasReqType) {
        const wt = i.system.weapon_type || {};
        let matchType = (wt.melee && wType.melee) || (wt.ranged && wType.ranged) ||
                        (wt.shield && wType.shield) || (wt.magic && wType.magic);
        if (!matchType) return false;
      }

      const hasReqDmg = wDmg.piercing || wDmg.bludgeoning || wDmg.slashing;
      if (hasReqDmg) {
        const wd = i.system.damage_type || {};
        let matchDmg = (wd.piercing && wDmg.piercing) || (wd.bludgeoning && wDmg.bludgeoning) ||
                       (wd.slashing && wDmg.slashing);
        if (!matchDmg) return false;
      }

      // Required weapon properties (two-handed, fast, thrown, etc.):
      // weapon property flags lie flat in system (is_twohanded, is_fast, ...).
      // is_twohanded — a two-handed GRIP requirement: a true two-handed weapon always
      // passes, a variable grip (is_variable_grip) — with a free second hand.
      const requiredProps = Object.entries(wProp).filter(([, req]) => req).map(([p]) => p);
      if (requiredProps.length > 0) {
        const matchProp = requiredProps.some(p =>
          p === "is_twohanded" ? heldTwoHanded(actor, i) : !!i.system[p]
        );
        if (!matchProp) return false;
      }
      return true;
    });

    return { requiresWeapon: true, validWeapons };
  }

  /**
   * Quick slots (15. Inventory §2): in combat a potion or scroll that isn't in a quick
   * slot (not starred) has to be dug out of the pack with the Interact maneuver first —
   * its AP and the turn's Action. Out of combat, or for a starred item, it's at hand.
   * Whether the GM rules digging impossible right now (a tight passage, a clinch) is decided
   * at the table; the automation only charges the price.
   * @param {Item|null} item - the potion/scroll being used (for reading — the selected scroll)
   * @returns {{cost: number, name: string}|null} null — the item is at hand
   */
  #retrievalFor(item) {
    const actor = this.actor;
    if (!item || !["potion", "scroll"].includes(item.type)) return null;
    if (item.getFlag("dedrel", "isFavorite")) return null;
    if (!ActionEconomy.isInCombat(actor)) return null;
    const interact = actor.items.find(i => i.type === "maneuver" && i.system.key === "maneuver_interact");
    return {
      cost: interact?.system.ap_cost ?? 1,
      name: interact?.name ?? game.i18n.localize("DEDREL.Chat.InteractManeuver")
    };
  }

  /**
   * How the Interact step is paid: like any maneuver — the maneuver pool first, then the
   * universal one. Returns null if there isn't enough AP for it.
   * @returns {{fromManeuver: number, fromUniversal: number}|null}
   */
  #planRetrievalSpend(cost) {
    const res = this.actor.system.resources || {};
    const fromManeuver = Math.min(res.ap_maneuver?.value || 0, cost);
    const fromUniversal = cost - fromManeuver;
    if (fromUniversal > (res.ap_universal?.value || 0)) return null;
    return { fromManeuver, fromUniversal };
  }

  /**
   * Available AP pools for paying for the item. The special pool is used ONLY
   * if it exists in the actor's schema. NPCs don't have it (a single universal pool) →
   * the cost comes from ap_universal, and we don't write a phantom key into actor.update.
   * @returns {{currentAp: number, apSpecific: number, specificApKey: string}}
   */
  #resolveApPools() {
    const actor = this.actor;
    const apUniversal = actor.system.resources?.ap_universal?.value || 0;
    let apSpecific = 0;
    let specificApKey = "";

    // Reading a scroll is paid ONLY with universal AP (16. Magic §10):
    // someone else's magic from a page is neither trained motor skill nor one's own casting.
    if (this.type === "maneuver" && !this.system.is_scroll_read && actor.system.resources?.ap_maneuver) {
      apSpecific = actor.system.resources.ap_maneuver.value || 0;
      specificApKey = "system.resources.ap_maneuver.value";
    } else if ((this.type === "spell" || this.type === "magic_item") && actor.system.resources?.ap_magic) {
      apSpecific = actor.system.resources.ap_magic.value || 0;
      specificApKey = "system.resources.ap_magic.value";
    }

    return { currentAp: apUniversal + apSpecific, apSpecific, specificApKey };
  }

  /**
   * HTML of the use confirmation dialog: AP cost (fixed or
   * variable with an input), charges, consumption of the item itself and weapon selection.
   * @param {object} ctx - the use context assembled in use()
   */
  #buildUseDialogContent(ctx) {
    // Escape item/weapon names before inserting them into the dialog HTML
    // (names are set by users and may contain markup).
    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
    let content = `<div style="margin-bottom: 15px;">`;

    if (ctx.retrieval) {
      content += `<p style="color: orange;">${game.i18n.format("DEDREL.Chat.RetrieveFromPack", { name: esc(ctx.retrieval.name), cost: ctx.retrieval.cost })}</p>`;
    }

    if (ctx.apCost > 0 || ctx.isVariable) {
      if (ctx.isVariable) {
        const maxAp = Math.min(this.system.variable_cost_max || 99, ctx.currentAp);
        const maxLabel = this.system.variable_cost_max || game.i18n.localize("DEDREL.Chat.VariableCostMax");
        content += `
          <div class="form-group" style="margin-top: 10px;">
            <label style="font-weight: bold;">${game.i18n.format("DEDREL.Chat.VariableCostLabel", { min: ctx.minAp, max: maxLabel })}</label>
            <input type="number" id="use-ap-cost" value="${ctx.minAp}" min="${ctx.minAp}" max="${maxAp}" style="width: 100%; padding: 4px;">
          </div>
        `;
        content += `<p style="color: gray; font-size: 12px;">${game.i18n.format("DEDREL.Chat.AvailableAP", { current: ctx.currentAp })}</p>`;
      } else {
        content += `<p>${game.i18n.format("DEDREL.Chat.SpendAP", {name: esc(this.name), cost: ctx.apCost})}</p>`;
        if (ctx.apCost > ctx.currentAp) {
          content += `<p style="color: red; font-weight: bold;">${game.i18n.format("DEDREL.Chat.NotEnoughAPDialog", {current: ctx.currentAp, cost: ctx.apCost})}</p>`;
        }
      }
    }

    if (ctx.hasCharges) {
      content += `<p>${game.i18n.format("DEDREL.Chat.SpendCharge", {value: ctx.usesValue, max: ctx.usesMax})}</p>`;
      if (ctx.usesValue <= 0) {
        content += `<p style="color: red; font-weight: bold;">${game.i18n.localize("DEDREL.Chat.OutOfCharges")}</p>`;
      }
    }

    if (ctx.isSelfConsume) {
      if (!ctx.hasEnoughAmmo) {
        content += `<p style="color: red; font-weight: bold;">${game.i18n.localize("DEDREL.Notifications.ItemDepleted")}</p>`;
      } else {
        content += `<p>${game.i18n.format("DEDREL.Chat.WillBeConsumed", {name: esc(this.name), count: ctx.consumeAmount})}</p>`;
      }
    }

    if (ctx.requiresWeapon) {
      if (ctx.validWeapons.length > 0) {
        // Tempo is labeled right in the options: the cost in the dialog header is computed from
        // the first weapon in the list, and without the label it's unclear why it shifts
        // when the weapon is changed.
        const isTempo = DedrelBonuses.isTempoManeuver(this);
        const tempoLabel = (w) => {
          if (!isTempo) return "";
          if (w.system.is_fast) return ` — ${game.i18n.localize("DEDREL.Chat.WeaponFastTempo")}`;
          if (w.system.is_slow) return ` — ${game.i18n.localize("DEDREL.Chat.WeaponSlowTempo")}`;
          return "";
        };
        content += `
          <div class="form-group" style="margin-top: 10px;">
            <label style="font-weight: bold;">${game.i18n.localize("DEDREL.Chat.Weapon")}</label>
            <select name="weaponId" id="use-weapon-select" style="width: 100%; padding: 4px;">
              ${ctx.validWeapons.map(w => `<option value="${w.id}">${esc(w.name)}${tempoLabel(w)}</option>`).join("")}
            </select>
          </div>
        `;
      } else {
        content += `<p style="color: orange; font-style: italic;">${game.i18n.localize("DEDREL.Chat.NoEquippedWeapon")}</p>`;
      }
    }

    if (ctx.isScrollRead && ctx.validScrolls.length > 0) {
      content += `
        <div class="form-group" style="margin-top: 10px;">
          <label style="font-weight: bold;">${game.i18n.localize("DEDREL.Chat.ScrollSelect")}</label>
          <select name="scrollId" id="use-scroll-select" style="width: 100%; padding: 4px;">
            ${ctx.validScrolls.map(s => {
              // A scroll outside the quick slots costs an Interact on top (15. Inventory §2)
              const fromPack = this.#retrievalFor(s);
              const packLabel = fromPack ? ` — ${game.i18n.format("DEDREL.Chat.FromPackShort", { cost: fromPack.cost })}` : "";
              return `<option value="${s.id}">${esc(s.name)} (${s.system.ap_cost} ${game.i18n.localize("DEDREL.Magic.APShort")})${packLabel}</option>`;
            }).join("")}
          </select>
        </div>
      `;
    }

    content += `</div>`;
    return content;
  }

  /**
   * Execution of a confirmed use: resolve the selected weapon and
   * the actual cost → validate resources → spend (AP, DSL mods,
   * charges, ammunition, the item itself) → consequences (self effects, macro,
   * card or casting the bound spell, concentration, chain maneuvers).
   * @param {DialogV2} dialog - the open dialog (for reading inputs)
   * @param {object} ctx - the use context assembled in use()
   */
  async #confirmUse(dialog, ctx) {
    const { actor, apCost, isVariable, minAp, currentAp,
            hasCharges, usesValue, requiresWeapon, isReloadAction,
            isScrollRead, isSelfConsume, consumeAmount, hasEnoughAmmo,
            actionMode } = ctx;

    // The selected weapon is resolved once — it's needed for the reload cost,
    // the loaded check, ammunition consumption and the card.
    let selWeapon = null;
    if (requiresWeapon) {
      const selEl = dialog.element.querySelector("#use-weapon-select");
      selWeapon = selEl?.value ? actor.items.get(selEl.value) : null;
      // It can't be used without a valid weapon (the dialog only showed
      // a warning — we don't allow confirming a maneuver/scroll "bare-handed").
      if (!selWeapon) {
        ui.notifications.warn(game.i18n.localize("DEDREL.Chat.NoEquippedWeapon"));
        return;
      }
    }

    let finalApCost = apCost;
    if (isVariable) {
      const inputEl = dialog.element.querySelector("#use-ap-cost");
      if (inputEl) finalApCost = parseInt(inputEl.value) || minAp;
    }
    // Reload: the actual AP cost comes from the selected weapon, not the maneuver.
    if (isReloadAction && selWeapon) {
      finalApCost = selWeapon.system.reload_cost || 1;
    }

    // Tempo of the weapon actually selected. Computed from the base cost: ctx.apCost
    // already contains the shift for the first valid weapon from the dialog, and the player may
    // have picked another one in the list. This doesn't concern a variable cost — there the amount
    // is set by the player.
    if (!isVariable && selWeapon && DedrelBonuses.isTempoManeuver(this)) {
      finalApCost = DedrelBonuses.applyWeaponTempo(ctx.apCostNoTempo, this, selWeapon);
    }

    // Reading a scroll: the actual AP cost comes from the selected scroll.
    let selScroll = null;
    if (isScrollRead) {
      const scrollEl = dialog.element.querySelector("#use-scroll-select");
      selScroll = scrollEl?.value ? actor.items.get(scrollEl.value) : null;
      if (!selScroll) {
        ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NoScrollsToRead"));
        return;
      }
      finalApCost = selScroll.system.ap_cost || 0;
    }

    // A shot from a reloadable weapon: an attacking maneuver (target isn't the
    // shooter themselves, with combat buttons) with a reloadable weapon. Aiming and
    // other self preparations don't fall under this. An unloaded weapon can't fire.
    const isReloadingShot = requiresWeapon && !isReloadAction
      && !!selWeapon?.system?.is_reloading
      && this.system.target_type !== "self"
      && !this.system.hide_combat_buttons;
    if (isReloadingShot && !selWeapon.system.loaded) {
      ui.notifications.warn(game.i18n.format("DEDREL.Notifications.WeaponNotLoaded", { name: selWeapon.name }));
      return;
    }

    // Digging the item out of the pack (15. Inventory §2): an Interact before the use
    // proper. For reading — by the scroll actually selected.
    const retrieval = this.#retrievalFor(isScrollRead ? selScroll : this);
    let retrievalSpend = null;
    if (retrieval) {
      retrievalSpend = this.#planRetrievalSpend(retrieval.cost);
      if (!retrievalSpend) {
        ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NotEnoughAP"));
        return;
      }
    }
    // Potions and scrolls (read directly or by the maneuver) are paid from the universal
    // pool only, so the Interact step competes with them for its universal part alone.
    const availableAp = currentAp - (retrievalSpend?.fromUniversal || 0);

    if (finalApCost > 0 && finalApCost > availableAp) {
      ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NotEnoughAP"));
      return;
    }
    if (hasCharges && usesValue <= 0) {
      ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NotEnoughUses"));
      return;
    }
    if (!hasEnoughAmmo) {
      ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NotEnoughAmmoOrItems"));
      return;
    }

    // Ammunition of the SELECTED weapon (a shot maneuver with req_weapon). Resolved and
    // validated BEFORE spending AP, so as not to spend AP with an empty quiver.
    // Reload does NOT consume ammunition (the shot does) — skip it.
    let ammo = { weaponAmmo: null, weaponAmmoAmount: 1, ammoSnapshot: null };
    if (requiresWeapon && !isReloadAction && selWeapon?.system?.consume_target) {
      const resolved = this.#resolveWeaponAmmo(selWeapon);
      if (!resolved) {
        ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NotEnoughAmmoOrItems"));
        return;
      }
      ammo = resolved;
    }

    // The Interact step: its AP and the turn's Action. Warn, don't block — same as below.
    if (retrievalSpend) {
      const res = actor.system.resources;
      const updates = {};
      if (retrievalSpend.fromManeuver) {
        updates["system.resources.ap_maneuver.value"] = res.ap_maneuver.value - retrievalSpend.fromManeuver;
      }
      if (retrievalSpend.fromUniversal) {
        updates["system.resources.ap_universal.value"] = res.ap_universal.value - retrievalSpend.fromUniversal;
      }
      if (Object.keys(updates).length) await actor.update(updates);
      if (await ActionEconomy.spendAction(actor)) {
        ui.notifications.warn(game.i18n.format("DEDREL.Notifications.ActionAlreadySpent", { name: retrieval.name }));
      }
    }

    // Spending AP
    if (finalApCost > 0) {
      await this.#spendAp(finalApCost, ctx);
    }

    // Mark "Action spent this turn" (_rules/14. Combat Maneuvers).
    // We warn but don't block: a reaction can legitimately fire on one's own
    // turn too, and the automation can't tell such a case apart.
    if (actionMode === "action") {
      const wasSpent = await ActionEconomy.spendAction(actor);
      if (wasSpent) {
        ui.notifications.warn(game.i18n.format("DEDREL.Notifications.ActionAlreadySpent", { name: this.name }));
      }
    }

    // Burn the DSL modifiers of the "use" stage (AP cost mods).
    // An effect with mods of later stages (attack/damage) burns after
    // the corresponding roll, not here.
    if (this.type === "maneuver" || this.type === "spell") {
      await DedrelBonuses.consumeStage(actor, this, "use");
    }

    // Spending Charges
    if (hasCharges) {
      await this.update({ "system.uses_value": usesValue - 1 });
    }

    // Spending items / ammunition
    // deleteSelfAfter: if the item itself is used up to zero, we do NOT delete it right away —
    // postToChat() below accesses this (this.name, this.actor, this.effects).
    // Delete at the very end, after the card is posted.
    let deleteSelfAfter = false;
    if (ammo.weaponAmmo) {
      await this.#spendWeaponAmmo(ammo.weaponAmmo, ammo.weaponAmmoAmount);
    }
    if (isSelfConsume) {
      const newQty = Math.max(0, (this.system.quantity || 0) - consumeAmount);
      if (newQty <= 0) {
        deleteSelfAfter = true;
      } else {
        await this.update({ "system.quantity": newQty });
      }
    }

    // Load state: a shot unloads the weapon, a reload loads it.
    if (isReloadingShot && selWeapon) {
      await selWeapon.update({ "system.loaded": false });
    } else if (isReloadAction && selWeapon) {
      await selWeapon.update({ "system.loaded": true });
      ui.notifications.info(game.i18n.format("DEDREL.Notifications.WeaponReloaded", { name: selWeapon.name }));
    }

    const selectedWeaponId = requiresWeapon ? (selWeapon?.id ?? null) : null;

    // Applying template self effects (flags.dedrel.applyTo = "self")
    // with @spentAp / @apCost / @overspent substituted.
    // Runs BEFORE the macro, so that the escape hatch (on_use_macro) sees the buff already applied.
    await this._applySelfEffects({ spentAp: finalApCost, apCost: this.system.ap_cost || 0 });

    // Call the macro if there is one
    if (this.system.on_use_macro) {
      await this.#runOnUseMacro(finalApCost, selectedWeaponId);
    }

    // A scroll and a magic_item with a bound spell cast it (an ephemeral copy
    // on the actor) rather than posting their own card. Consumption/charge were already taken above.
    const castsBoundSpell = this.type === "scroll"
      || (this.type === "magic_item" && (this.system.spell_id || this.system.spell_key));
    if (isScrollRead && selScroll) {
      // The reading maneuver casts the selected scroll's spell and consumes the scroll;
      // the maneuver doesn't post its own card — the cast itself serves as the card.
      await selScroll.#castBoundSpell();
      const newQty = Math.max(0, (selScroll.system.quantity || 0) - 1);
      if (newQty <= 0) {
        await selScroll.delete();
      } else {
        await selScroll.update({ "system.quantity": newQty });
      }
    } else if (castsBoundSpell) {
      await this.#castBoundSpell();
    } else {
      await this.postToChat(selectedWeaponId, ammo.ammoSnapshot);
    }

    // Concentration marker (Duration rank 4): a reminder effect on
    // the caster with no auto-expiry, removed by hand; losing consciousness
    // breaks concentration (a reminder in the effect's description).
    if (this.type === "spell") {
      await this._applyConcentrationMarker();
    }

    // Chain maneuver handling (spells with the "Chain" Action Type too)
    if (this.type === "maneuver" || this.type === "spell") {
      const aType = this.system.action_type || {};
      if (aType.action || aType.chain || aType.reaction) {
        const showOutside = game.settings.get("dedrel", "showChainsOutsideCombat");
        if (game.combat?.started || showOutside) {
          game.dedrel.chainHUD.showFor(actor, this);
        }
      }
    }

    // Delete the fully used-up item only now,
    // when the card has been posted and this is no longer needed.
    if (deleteSelfAfter) {
      await this.delete();
    }
  }

  /**
   * Resolves the selected weapon's ammunition (consume_target) and takes a snapshot of its
   * bonuses. The snapshot is needed NOW: when the last unit is spent the item
   * is deleted, and the damage roll (attack card) reads this data from the
   * message flag after the spending.
   * @returns {{weaponAmmo: Item, weaponAmmoAmount: number, ammoSnapshot: object}|null} null — no ammunition or not enough.
   */
  #resolveWeaponAmmo(selWeapon) {
    const weaponAmmo = this.actor.items.get(selWeapon.system.consume_target);
    const weaponAmmoAmount = selWeapon.system.consume_amount || 1;
    if (!weaponAmmo || (weaponAmmo.system.quantity || 0) < weaponAmmoAmount) return null;

    const as = weaponAmmo.system;
    return {
      weaponAmmo,
      weaponAmmoAmount,
      ammoSnapshot: {
        ap: as.armor_piercing || 0,
        dmg: as.damage_bonus || "",
        dmgType: as.damage_bonus_type || "",
        vs: as.vs_creature || {}
      }
    };
  }

  /**
   * Spends AP: first from the special pool (maneuvers → ap_maneuver, magic →
   * ap_magic, see #resolveApPools), the rest from the universal one.
   */
  async #spendAp(cost, { apSpecific, specificApKey }) {
    const apUniversal = this.actor.system.resources?.ap_universal?.value || 0;
    let costLeft = cost;
    const updates = {};

    if (specificApKey) {
      const specificSpend = Math.min(apSpecific, costLeft);
      updates[specificApKey] = apSpecific - specificSpend;
      costLeft -= specificSpend;
    }

    if (costLeft > 0) {
      const uniSpend = Math.min(apUniversal, costLeft);
      updates["system.resources.ap_universal.value"] = apUniversal - uniSpend;
    }

    await this.actor.update(updates);
  }

  /**
   * Spends ammunition for a shot (the last unit deletes the item) and rolls
   * the recovery check. Breakage/recovery: shot (powder) can't be picked up; otherwise for each
   * spent unit we roll recovery_chance and report how many survived.
   */
  async #spendWeaponAmmo(weaponAmmo, amount) {
    // The data for the recovery check is taken BEFORE the item may be deleted.
    const aName = weaponAmmo.name;
    const aType = weaponAmmo.system.ammo_type;
    const aRecovery = weaponAmmo.system.recovery_chance || 0;

    const newQty = Math.max(0, (weaponAmmo.system.quantity || 0) - amount);
    if (newQty <= 0) {
      await weaponAmmo.delete();
    } else {
      await weaponAmmo.update({ "system.quantity": newQty });
    }

    if (aType !== "shot" && amount > 0) {
      await this.#reportAmmoRecovery(this.actor, aName, aRecovery, amount);
    }
  }

  /**
   * Resolve and run on_use_macro: name in the world → UUID (Compendium./Macro.) →
   * name in the macro packs.
   */
  async #runOnUseMacro(spentAp, selectedWeaponId) {
    const actor = this.actor;
    let macro = game.macros.find(m => m.name === this.system.on_use_macro);
    if (!macro) {
      if (this.system.on_use_macro.startsWith("Compendium.") || this.system.on_use_macro.startsWith("Macro.")) {
        macro = await fromUuid(this.system.on_use_macro);
      } else {
        for (let pack of game.packs.values()) {
          if (pack.documentName === "Macro") {
            const index = await pack.getIndex();
            const entry = index.find(e => e.name === this.system.on_use_macro);
            if (entry) {
              macro = await pack.getDocument(entry._id);
              break;
            }
          }
        }
      }
    }

    if (macro) {
      // weapon — the weapon/shield the player selected in the use dialog (if required)
      macro.execute({
        actor: actor,
        item: this,
        spentAp: spentAp,
        weapon: selectedWeaponId ? actor.items.get(selectedWeaponId) : null
      });
    } else {
      ui.notifications.warn(game.i18n.format("DEDREL.Notifications.MacroNotFound", {name: this.system.on_use_macro}));
    }
  }

  /**
   * Finds the spell "sealed" in a carrier (a scroll or a magic_item wand):
   * first by spell_id (an item on the actor / in the world / by UUID), then by spell_key
   * (spell compendium or world).
   * @returns {Promise<Item|null>}
   */
  async #resolveBoundSpell() {
    const sys = this.system;
    if (sys.spell_id) {
      const onActor = this.actor?.items.get(sys.spell_id);
      if (onActor?.type === "spell") return onActor;
      const world = game.items.get(sys.spell_id);
      if (world?.type === "spell") return world;
      const byUuid = await fromUuid(sys.spell_id).catch(() => null);
      if (byUuid?.type === "spell") return byUuid;
    }
    if (sys.spell_key) {
      const pack = game.packs.get("dedrel.spells");
      if (pack) {
        const index = await pack.getIndex({ fields: ["system.key"] });
        const entry = index.find(e => e.system?.key === sys.spell_key);
        if (entry) return pack.getDocument(entry._id);
      }
      const world = game.items.find(i => i.type === "spell" && i.system.key === sys.spell_key);
      if (world) return world;
    }
    return null;
  }

  /**
   * Casting a bound spell (a scroll or a magic_item wand): the carrier provides magic bypassing
   * the owner's doctrine and AP. We create an ephemeral copy of the spell on the actor (the chat
   * card's buttons look up the item by id) and post its card directly via postToChat —
   * NOT via use(), otherwise the zero cost would open the sheet instead of posting the card,
   * and AP would be spent. The ephemeral item is cleaned up at the end of combat (see combat.mjs) or by a macro.
   */
  async #castBoundSpell() {
    const source = await this.#resolveBoundSpell();
    if (!source) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ScrollSpellNotFound"));
    const actor = this.actor;
    if (!actor) return;

    const spellData = source.toObject();
    delete spellData._id;
    foundry.utils.setProperty(spellData, "flags.dedrel.ephemeral", true);
    foundry.utils.setProperty(spellData, "flags.dedrel.fromItem", this.name);

    const [ephemeral] = await actor.createEmbeddedDocuments("Item", [spellData]);
    await ephemeral.postToChat();
  }

  /**
   * Re-validation of a built spell before casting.
   * Checks the doctrine rank, whether the build's path is learned (paths are purchased talents)
   * and recomputes the cost from the build source; a mismatch between the recomputation
   * and the saved ap_cost is whispered to the GM (manual field edits).
   * For linear doctrines (not in the Constructor config) — only the rank gate.
   * @returns {Promise<boolean>} false — the cast is canceled.
   */
  async #validateSpellCast(actor) {
    const sys = this.system;
    const config = CONFIG.DEDREL.magic;
    const doctrineState = actor.system.doctrines?.[sys.doctrine];
    const rank = doctrineState?.rank || 0;

    if (rank < (sys.doctrine_rank_req || 0)) {
      ui.notifications.error(game.i18n.format("DEDREL.Magic.UI.CastRankTooLow", {
        doctrine: game.i18n.localize(`DEDREL.Magic.Doctrines.${sys.doctrine}`),
        req: sys.doctrine_rank_req,
        have: rank
      }));
      return false;
    }

    // Linear doctrine (fixed spells, guide §5): there's no build — nothing more to check
    const doctrineCfg = config?.doctrines?.[sys.doctrine];
    if (!doctrineCfg) return true;

    // The build's path must be known to the caster (purchased via a talent); "no path" is always legal.
    // Fixed spells are checked too: a fixed spell bound to a path
    // remains a spell of that path and requires its talent.
    if (sys.doctrine_path && !doctrineState?.paths?.[sys.doctrine_path]) {
      ui.notifications.error(game.i18n.format("DEDREL.Magic.UI.CastPathNotKnown", {
        path: game.i18n.localize(`DEDREL.Magic.Paths.${sys.doctrine_path}`)
      }));
      return false;
    }

    // A fixed spell of a doctrine that IS in the Constructor (Shadowmancy/Biomancy
    // long casts): it has no build, and the Rank and Path gates
    // have already run. Without this exit the calculator would get an empty build
    // and fail the cast on no_techniques.
    if (sys.is_fixed) return true;

    const build = {
      doctrine: sys.doctrine,
      path: sys.doctrine_path,
      sourceScale: sys.source_scale,
      techniques: sys.chosen_techniques || [],
      modifiers: (sys.chosen_modifiers || []).map(m => ({ key: m.key, rank: m.rank, option: m.option }))
    };
    const result = SpellCalculator.calculate(build, SpellCalculator.contextFromActor(actor, sys.doctrine), config);
    if (!result.valid) {
      ui.notifications.error(`${game.i18n.localize("DEDREL.Magic.UI.CastInvalid")} ${SpellCalculator.localizeErrors(result.errors).join(" ")}`);
      return false;
    }

    if (result.totalAp !== sys.ap_cost) {
      const gmIds = game.users.filter(u => u.isGM).map(u => u.id);
      if (gmIds.length) {
        ChatMessage.create({
          whisper: gmIds,
          content: `<div class="dedrel-item-chat"><p>${game.i18n.format("DEDREL.Magic.UI.CastCostMismatch", {
            name: foundry.utils.escapeHTML(this.name),
            actor: foundry.utils.escapeHTML(actor.name),
            saved: sys.ap_cost,
            calc: result.totalAp
          })}</p></div>`
        });
      }
    }
    return true;
  }

  /**
   * Puts a reminder effect "Concentration: <spell>" on the caster if
   * the build has the Duration Modifier at rank 4 (concentration) selected.
   * No auto-expiry: removed by hand (status HUD); there's no mechanical
   * break on losing consciousness in v1 — only a reminder in the description.
   */
  async _applyConcentrationMarker() {
    const actor = this.actor;
    if (!actor) return;
    const durationMod = (this.system.chosen_modifiers || []).find(m => m.key === "duration" && m.rank === 4);
    if (!durationMod) return;

    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: game.i18n.format("DEDREL.Magic.UI.ConcentrationMarker", { name: this.name }),
      img: this.img,
      description: game.i18n.localize("DEDREL.Magic.UI.ConcentrationHint"),
      transfer: false,
      origin: this.uuid,
      flags: { dedrel: { concentration: this.name } }
    }]);
  }

  /**
   * Applies to the owner the item's template effects marked
   * flags.dedrel.applyTo = "self". This is the variable cost mechanism:
   * "spent AP is converted into a parameter" without macros.
   *
   * Placeholders substituted into changes[].value, name and description:
   *   @spentAp   — AP actually spent (player input for a variable cost)
   *   @apCost    — the maneuver's base cost
   *   @overspent — AP spent above the base cost
   * If after substitution the value is pure arithmetic (e.g. "@spentAp * 2"),
   * it is evaluated via Roll.safeEval so that the effect gets a ready number.
   *
   * @param {{spentAp: number, apCost: number}} context
   */
  async _applySelfEffects(context) {
    const actor = this.actor;
    if (!actor) return;

    const selfEffects = this.effects.filter(e => e.getFlag("dedrel", "applyTo") === "self");
    if (selfEffects.length === 0) return;

    const spentAp = context.spentAp ?? 0;
    const baseCost = context.apCost ?? 0;
    const tokens = {
      "@spentAp": String(spentAp),
      "@apCost": String(baseCost),
      "@overspent": String(Math.max(0, spentAp - baseCost))
    };

    const substitute = (str) => {
      if (typeof str !== "string") return str;
      let out = str;
      for (const [token, value] of Object.entries(tokens)) {
        out = out.replaceAll(token, value);
      }
      return out;
    };

    const effectsData = selfEffects.map(e => {
      const data = e.toObject();
      delete data._id;
      // V14: changes live in system.changes (see QUIRK 11/12). We take the source
      // changes from the new location with a fallback, substitute placeholders and
      // write them BACK to system.changes. The legacy top-level data.changes
      // is removed so that core's migration doesn't overwrite system.changes with it.
      const srcChanges = e._source.system?.changes ?? e._source.changes ?? [];
      const newChanges = foundry.utils.deepClone(srcChanges).map(c => {
        let value = substitute(c.value);
        if (typeof value === "string" && /\d/.test(value) && /^[\d\s+\-*/().]+$/.test(value)) {
          try {
            value = String(Roll.safeEval(value));
          } catch (err) {
            console.warn(`Dedrel | Failed to evaluate effect value "${value}"`, err);
          }
        }
        return { ...c, value };
      });
      delete data.changes;
      data.system = { ...(data.system || {}), changes: newChanges };
      data.name = substitute(data.name);
      if (data.description) data.description = substitute(data.description);
      data.origin = this.uuid;
      data.transfer = false;
      return data;
    });

    await actor.createEmbeddedDocuments("ActiveEffect", effectsData);
    ui.notifications.info(game.i18n.format("DEDREL.Notifications.SelfEffectApplied", {
      names: effectsData.map(e => foundry.utils.escapeHTML(e.name)).join(", ")
    }));
  }

  /**
   * Ammunition recovery check after a shot: for each spent unit we roll
   * d100, the survivors (result ≤ recovery_chance) can be picked up narratively.
   * The chat message is informational — no "scattered ammo" item is created.
   * @param {Actor} actor
   * @param {string} name  - ammunition name (taken before it may be deleted)
   * @param {number} chance - survival chance, %
   * @param {number} count - how many units were spent on the shot
   */
  async #reportAmmoRecovery(actor, name, chance, count) {
    const roll = new Roll(`${count}d100`);
    await roll.evaluate();
    const results = roll.dice[0]?.results?.map(r => r.result) || [];
    const recovered = results.filter(v => v <= chance).length;
    const esc = foundry.utils.escapeHTML;

    let content;
    if (count === 1) {
      content = recovered
        ? game.i18n.format("DEDREL.Ammo.RecoverySurvived", { name: esc(name) })
        : game.i18n.format("DEDREL.Ammo.RecoveryBroken", { name: esc(name) });
    } else {
      content = game.i18n.format("DEDREL.Ammo.RecoveryPartial", { name: esc(name), recovered, count });
    }

    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="dedrel-ammo-recovery">${content}</div>`,
      rolls: [roll]
    });
  }

  /**
   * Posts the item card to chat. Combat buttons (Attack/Damage) are added only to combat items.
   * @param {string|null} weaponId - ID of the selected weapon (if any)
   */
  async postToChat(weaponId = null, ammoSnapshot = null) {
    let weaponAttr = weaponId ? `data-weapon-id="${weaponId}"` : "";
    
    let showCombatButtons = false;
    let reqWeapon = false;
    const isSpell = this.type === "spell";
    if (this.type === "maneuver" || isSpell) {
       const wType = this.system.req_weapon_type || {};
       const wDmg = this.system.req_weapon_damage_type || {};
       const reqSkill = this.system.req_weapon_skill_group || "";
       const reqKeys = (this.system.req_weapon_keys || []).filter(k => k && k.trim());
       // "any" doesn't count as a requirement for a specific weapon (consistent with use()).
       reqWeapon = (wType.melee || wType.ranged || wType.shield || wType.magic ||
                          wDmg.piercing || wDmg.bludgeoning || wDmg.slashing ||
                          reqKeys.length > 0 ||
                          (reqSkill !== "" && reqSkill !== "any"));

       // Spells ALWAYS require a focus (a weapon of type magic), so a weapon
       // requirement isn't a sign of a combat card — we look only at the formulas/saving throw,
       // otherwise utility spells would get meaningless Attack/Damage buttons.
       if (isSpell) {
         showCombatButtons = !!(this.system.formula_attack || this.system.formula_damage || this.system.save_attribute);
       } else if (reqWeapon || this.system.formula_attack || this.system.formula_damage || this.system.save_attribute || this.system.skill) {
         showCombatButtons = true;
       }
       if (this.system.hide_combat_buttons) {
         showCombatButtons = false;
       }
    }

    let buttons = "";
    if (showCombatButtons || this.system.formula_heal || this.system.formula_temp_hp) {
      buttons += `
        <div class="chat-buttons" style="display: flex; gap: 5px; margin-top: 10px; flex-wrap: wrap;">
      `;
      // Attack: for spells — only if there's an attack formula or damage (a roll
      // on the "Magical Attacks" skill); for maneuvers — as before
      const showAttack = isSpell
        ? (this.system.formula_attack || this.system.formula_damage)
        : (this.system.formula_attack || reqWeapon || this.system.skill);
      if (showCombatButtons && showAttack) {
        buttons += `<button class="dedrel-chat-action" data-action="rollAttack" data-item-id="${this.id}" ${weaponAttr}><i class="fa-solid fa-crosshairs"></i> ${game.i18n.localize("DEDREL.Chat.Attack")}</button>`;
      }
      if (showCombatButtons && (this.system.formula_damage || (!isSpell && reqWeapon))) {
        // Variable grip: a separate "two-handed grip" damage button (+1 Ladder
        // step). Whether the hand is free is checked at click time (chat.mjs),
        // because the equipment may have changed after the card was posted.
        // If the maneuver REQUIRES a two-handed grip (req_weapon_property.is_twohanded),
        // the regular damage button for a variable-grip weapon is hidden — a one-handed
        // roll from such a maneuver would always be wrong.
        const cardWeapon = weaponId ? this.actor?.items.get(weaponId) : null;
        const variableGrip = !!(cardWeapon?.system?.is_variable_grip && !cardWeapon.system.is_twohanded);
        const requiresTwoHanded = !isSpell && !!this.system.req_weapon_property?.is_twohanded;

        if (!(variableGrip && requiresTwoHanded)) {
          buttons += `<button class="dedrel-chat-action" data-action="rollDamage" data-item-id="${this.id}" ${weaponAttr}><i class="fa-solid fa-tint"></i> ${game.i18n.localize("DEDREL.Chat.Damage")}</button>`;
        }
        if (variableGrip) {
          buttons += `<button class="dedrel-chat-action" data-action="rollDamage" data-item-id="${this.id}" data-grip="2h" ${weaponAttr}><i class="fa-solid fa-hands-holding"></i> ${game.i18n.localize("DEDREL.Chat.DamageTwoHanded")}</button>`;
        }
      }
      if (this.system.formula_heal) {
        // The formula is duplicated into a data attribute: by the time the button is clicked, a consumed potion
        // has already been removed from the inventory (quantity 0 → delete in #confirmUse), so
        // the handler can't get it from the live item by item-id.
        buttons += `<button class="dedrel-chat-action" data-action="applyHeal" data-item-id="${this.id}" data-heal-formula="${foundry.utils.escapeHTML(this.system.formula_heal)}"><i class="fa-solid fa-heart"></i> ${game.i18n.localize("DEDREL.Chat.ApplyHeal")}</button>`;
      }
      if (this.system.formula_temp_hp) {
        // Like formula_heal: duplicated into a data attribute for consumable carriers
        buttons += `<button class="dedrel-chat-action" data-action="applyTempHp" data-item-id="${this.id}" data-temphp-formula="${foundry.utils.escapeHTML(this.system.formula_temp_hp)}"><i class="fa-solid fa-shield-heart"></i> ${game.i18n.localize("DEDREL.Chat.ApplyTempHp")}</button>`;
      }
      if (showCombatButtons && this.system.save_attribute) {
        const dc = this.system.save_dc || this.system.save_dc_formula || "";
        buttons += `<button class="dedrel-chat-action" data-action="rollSave" data-save="${this.system.save_attribute}" data-dc="${dc}"><i class="fa-solid fa-shield-halved"></i> ${game.i18n.localize("DEDREL.Chat.Save")} (${this.system.save_attribute.toUpperCase()})</button>`;
      }
      buttons += `</div>`;
    }

    // Condition application buttons (built spells). The current version
    // of the condition item is pulled from the status registry
    // (CONFIG.statusEffects ← Conditions compendium) at click time.
    if (this.type === "spell") {
      const conditionKeys = [];
      // The "Power" Modifier with a selected condition
      const powerMod = (this.system.chosen_modifiers || []).find(m => m.key === "power");
      if (powerMod?.option && powerMod.option !== "bonus" && powerMod.option !== "penalty") {
        conditionKeys.push(powerMod.option);
      }
      // The "Adaptation" Modifier (Biomancy): the selected trait is also a condition item
      // (packs biomancy_adaptations / mutilations), so it is applied by the same button
      const adaptMod = (this.system.chosen_modifiers || []).find(m => m.key === "adapt");
      if (adaptMod?.option && !conditionKeys.includes(adaptMod.option)) {
        conditionKeys.push(adaptMod.option);
      }
      // The doctrine's unique property "Ignite" (Pyromancy): a damaging spell
      // can leave the "Burning" condition
      const igniteKey = CONFIG.DEDREL?.magic?.doctrines?.[this.system.doctrine]?.unique?.ignite;
      if (igniteKey && this.system.formula_damage && !conditionKeys.includes(igniteKey)) {
        conditionKeys.push(igniteKey);
      }

      if (conditionKeys.length > 0) {
        const condButtons = conditionKeys.map(key => {
          const condName = foundry.utils.escapeHTML(CONFIG.statusEffects[key]?.name || key);
          return `<button class="dedrel-chat-action" data-action="applySpellCondition" data-status-id="${key}"><i class="fa-solid fa-bolt"></i> ${game.i18n.format("DEDREL.Chat.ApplyCondition", { name: condName })}</button>`;
        }).join("");
        buttons += `
          <div class="chat-buttons" style="display: flex; gap: 5px; margin-top: 10px; flex-wrap: wrap;">
            ${condButtons}
          </div>
        `;
      }
    }

    if (this.system.template_shape && this.system.template_size) {
      buttons += `
        <div class="chat-buttons" style="display: flex; gap: 5px; margin-top: 10px;">
          <button class="dedrel-chat-action" data-action="placeTemplate" data-shape="${this.system.template_shape}" data-size="${this.system.template_size}"><i class="fa-solid fa-ruler-combined"></i> ${game.i18n.localize("DEDREL.Chat.PlaceTemplate")}</button>
        </div>
      `;
    }

    // Scatter (arquebus etc.): a scatter weapon fires with the same shot maneuver,
    // but over an area. The Attack/Damage buttons stay as for a regular shot (one
    // roll against everyone covered); in addition we draw a cone button. Cone length —
    // from the weapon's range (we parse the leading number), angle — the standard one (template.mjs).
    // Only on a SHOT card, not reload/aiming/other self maneuvers
    // with the same weapon: the same criteria as isReloadingShot in #confirmUse — the maneuver strikes
    // a target (not self), requires a weapon, isn't marked as reload and doesn't hide combat.
    const isShotCard = reqWeapon
      && !this.system.is_reload_action
      && this.system.target_type !== "self"
      && !this.system.hide_combat_buttons;
    const cardWeaponScatter = (isShotCard && weaponId) ? this.actor?.items.get(weaponId) : null;
    if (cardWeaponScatter?.system?.is_scatter) {
      const coneSize = parseFloat(String(cardWeaponScatter.system.range || "").match(/[\d.]+/)?.[0] || "") || 0;
      if (coneSize > 0) {
        buttons += `
          <div class="chat-buttons" style="display: flex; gap: 5px; margin-top: 10px;">
            <button class="dedrel-chat-action" data-action="placeTemplate" data-shape="cone" data-size="${coneSize}"><i class="fa-solid fa-wind"></i> ${game.i18n.localize("DEDREL.Chat.ScatterCone")}</button>
          </div>
        `;
      }
    }

    // If the item has effects that are NOT transferred automatically (transfer: false),
    // those are buffs/debuffs that must be applied by hand (e.g. a poison, a spell).
    // Generate a button for applying these effects to the selected tokens.
    // Self effects (applyTo: "self") are excluded — they are applied to the owner in #confirmUse.
    // Aura effects too (payload applyTo: "aura" and flags.dedrel.aura markers):
    // they are applied and removed by the aura region (see src/canvas/aura-regions.mjs).
    const hasTransferableEffects = this.effects.some(e =>
      !e.transfer
      && !["self", "aura"].includes(e.getFlag("dedrel", "applyTo"))
      && !e.getFlag("dedrel", "aura")
    );
    if (hasTransferableEffects) {
      buttons += `
        <div class="chat-buttons" style="display: flex; gap: 5px; margin-top: 10px;">
          <button class="dedrel-chat-action" data-action="applyItemEffects" data-item-id="${this.id}"><i class="fa-solid fa-magic"></i> ${game.i18n.localize("DEDREL.Chat.ApplyEffects")}</button>
        </div>
      `;
    }

    // Aura toggle: turns the marker effect on/off (the region and buffs
    // are created/removed by the sync, see src/canvas/aura-regions.mjs)
    const hasAuraMarker = this.effects.some(e => e.getFlag("dedrel", "aura"));
    if (hasAuraMarker) {
      buttons += `
        <div class="chat-buttons" style="display: flex; gap: 5px; margin-top: 10px;">
          <button class="dedrel-chat-action" data-action="toggleAura" data-item-id="${this.id}"><i class="fa-solid fa-circle-dot"></i> ${game.i18n.localize("DEDREL.Chat.ToggleAura")}</button>
        </div>
      `;
    }

    // Forbidden defense is a manual mechanic: it's enforced at the table, so it
    // must be visible on the card (for maneuvers — Feint, for spells —
    // the Constructor's forbidDefense modifier).
    let forbiddenNote = "";
    const forbidden = this.system.forbidden_defense;
    if (forbidden) {
      const defKey = { block: "DEDREL.Chat.ForbiddenBlock", dodge: "DEDREL.Chat.ForbiddenDodge" }[forbidden];
      const defText = defKey ? game.i18n.localize(defKey) : foundry.utils.escapeHTML(forbidden);
      forbiddenNote = `<div style="margin-bottom: 8px; font-weight: bold; color: var(--color-level-error, #b22);"><i class="fa-solid fa-ban"></i> ${defText}</div>`;
    }

    // Reload reminder: a shot that left the weapon unloaded marks
    // this on the card. No button — reloading is done with its own maneuver from the HUD,
    // and the shooter is free to postpone it (by then the card will have scrolled up anyway).
    let reloadNote = "";
    const cardWeaponReload = weaponId ? this.actor?.items.get(weaponId) : null;
    if (cardWeaponReload?.system?.is_reloading && !cardWeaponReload.system.loaded) {
      reloadNote = `<div style="margin-bottom: 8px; font-weight: bold; color: var(--color-level-warning, #b8860b);"><i class="fa-solid fa-rotate-right"></i> ${game.i18n.format("DEDREL.Chat.NeedsReload", { name: foundry.utils.escapeHTML(cardWeaponReload.name) })}</div>`;
    }

    let content = `
      <div class="dedrel-item-chat">
        <h3 style="border-bottom: 1px solid var(--color-border-dark); padding-bottom: 3px; margin-bottom: 8px;">${foundry.utils.escapeHTML(this.name)}</h3>
        <div class="description" style="margin-bottom: 8px;">${this.system.description || ""}</div>
        ${forbiddenNote}
        ${reloadNote}
        ${buttons}
      </div>
    `;

    const messageData = {
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: content
    };
    // The ammunition snapshot (Armor Piercing/extra damage/vs_creature) goes into a flag — the damage roll
    // from this card (chat.mjs) reads it, since the ammunition itself may already have been spent.
    if (ammoSnapshot && (ammoSnapshot.ap || ammoSnapshot.dmg || Object.keys(ammoSnapshot.vs || {}).length)) {
      messageData.flags = { dedrel: { ammo: ammoSnapshot } };
    }
    await ChatMessage.create(messageData);
  }
}
