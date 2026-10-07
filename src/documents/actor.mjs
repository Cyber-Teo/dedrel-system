export default class DedrelActor extends Actor {
  /**
   * Creature type keys the actor carries (from embedded creature_type Items).
   * Used for the weapon/effect bonus "vs type" and as an indicator on the sheet.
   * @returns {string[]}
   */
  get creatureTypeKeys() {
    const keys = [];
    for (const item of this.items) {
      if (item.type === "creature_type" && item.system?.key) keys.push(item.system.key);
    }
    return keys;
  }

  async _preCreate(data, options, userId) {
    await super._preCreate(data, options, userId);
    
    // Setup default token settings for new actors
    if (this.type === "character" && userId === game.user.id) {
      const prototypeToken = {
        actorLink: true,
        vision: true,
        displayName: CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
        displayBars: CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
        bar1: { attribute: "resources.hp" }
      };
      this.updateSource({ prototypeToken });
    }
  }

  async _preUpdate(changed, options, user) {
    // The wallet balance can't go negative: any negative currency counters
    // in an update are clamped to 0. Catches every write path (inline inputs
    // on the sheet bypassing client-side min="0", socket transfers, coin deposits).
    this.#clampCurrencyUpdate(changed);
    return super._preUpdate(changed, options, user);
  }

  /** Clamps negative system.currency.* values to 0 in the update object. */
  #clampCurrencyUpdate(changed) {
    if (!changed || typeof changed !== "object") return;
    const clampObj = (obj) => {
      if (!obj || typeof obj !== "object") return;
      for (const k of Object.keys(obj)) {
        const v = Number(obj[k]);
        if (Number.isFinite(v) && v < 0) obj[k] = 0;
      }
    };
    for (const key of Object.keys(changed)) {
      // A single currency counter: "system.currency.<key>".
      if (key.startsWith("system.currency.")) {
        const v = Number(changed[key]);
        if (Number.isFinite(v) && v < 0) changed[key] = 0;
      }
      // The whole wallet as a flat key: "system.currency": { <key>: value }.
      else if (key === "system.currency") clampObj(changed[key]);
    }
    // The whole wallet as a nested object: system.currency = { <key>: value }.
    clampObj(changed?.system?.currency);
  }

  /**
   * Core applies the "initial" phase here (in super). Right after it we run
   * our "apply" phase — it holds all changes to system fields (system.*),
   * automatically tagged by the preCreateActiveEffect hook. Both phases run
   * BEFORE prepareDerivedData, so attribute buffs take part in computing
   * derived values, and bonuses to derived fields survive the "+=" pattern.
   */
  prepareEmbeddedDocuments() {
    super.prepareEmbeddedDocuments();
    this.applyActiveEffects("apply");
  }

  /**
   * Core extension: transferred effects of EQUIPPABLE items
   * apply to the actor only while the item is equipped. Core doesn't do this
   * suppression itself (isSuppressed defaults to false — that's the system's
   * job), so without the gate an enchanted sword would buff its owner from the backpack.
   *
   *  - Accessories (non-empty system.equip_slot: rings, amulets, accessory helmets):
   *    "equipped" = the id sits in one of the actor's system.equipment_slots.
   *  - Weapons: system.equipped (set by the sheet when taken in hand/tail).
   *  - Body armor (armor without equip_slot): the id sits in one of the armor layers.
   *
   * Other items (mutations, talents, potions, etc.) behave as in core —
   * their transfer effects apply while the item is in the inventory. On actors without
   * equipment_slots (loot/container) only weapons are gated (by system.equipped).
   */
  *allApplicableEffects() {
    for (const effect of this.effects) yield effect;
    for (const item of this.items) {
      if (!this.itemEffectsActive(item)) continue;
      for (const effect of item.effects) {
        if (effect.transfer) yield effect;
      }
    }
  }

  /**
   * Whether the item's transfer effects currently act on this actor (the gate rules
   * are described in allApplicableEffects). Split into its own method so that the light
   * toggle (DedrelItem#use) judges equipment by the same rules rather than its own.
   * @param {Item} item
   * @returns {boolean}
   */
  itemEffectsActive(item) {
    const slots = this.system?.equipment_slots;
    const inSlot = () => Object.values(slots).some(s => s?.item_id === item.id);
    if (slots && item.system?.equip_slot) return inSlot();
    if (item.type === "weapon") return !!item.system?.equipped;
    if (slots && item.type === "armor") return inSlot();
    return true;
  }

  prepareData() {
    super.prepareData();
    if (this.type === "character" && this.system.senses) {
      const darkvision = this.system.senses.darkvision || 0;
      if (darkvision > 0) {
        this.prototypeToken.updateSource({
          "sight.visionMode": "darkvision",
          "sight.range": darkvision
        });
      } else {
        this.prototypeToken.updateSource({
          "sight.visionMode": "basic",
          "sight.range": 0
        });
      }
    }
  }

  _syncVisionToTokens() {
    if (this.type !== "character" || !this.isOwner) return;
    
    const protoSight = this.prototypeToken.sight;
    const tokens = this.getActiveTokens();
    
    for (let t of tokens) {
      const tSight = t.document.sight;
      if (tSight.visionMode !== protoSight.visionMode || tSight.range !== protoSight.range) {
        t.document.update({
          "sight.visionMode": protoSight.visionMode,
          "sight.range": protoSight.range
        });
      }
    }
  }

  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (game.user.id === userId) this._syncVisionToTokens();
  }

  _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
    super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
    if (game.user.id === userId) this._syncVisionToTokens();
  }

  _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
    super._onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
    if (game.user.id === userId) this._syncVisionToTokens();
  }

  _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
    super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
    if (game.user.id === userId) {
      this._syncVisionToTokens();
      this.#clearSlotsForDeletedItems(collection, ids);
      this.#refundXpForDeletedItems(collection, documents);
    }
  }

  /**
   * Refunds XP for a talent or mutation removed from the sheet (10. Progression).
   * The amount is taken from the `xpPaid` flag, which the sheet sets at purchase time.
   * Items without the flag — imported by a macro or handed out by the GM without spending —
   * give no refund: otherwise NPC characters from macros would accumulate XP
   * that nobody gave them.
   */
  #refundXpForDeletedItems(collection, documents) {
    if (collection !== "items" || this.type !== "character") return;
    let refund = 0;
    const names = [];
    for (const item of documents) {
      if (!["talent", "mutation"].includes(item.type)) continue;
      const paid = item.getFlag("dedrel", "xpPaid") || 0;
      if (paid <= 0) continue;
      refund += paid;
      names.push(item.name);
    }
    if (refund <= 0) return;
    const xp = (this.system.details?.xp || 0) + refund;
    this.update({ "system.details.xp": xp });
    ui.notifications.info(game.i18n.format("DEDREL.Notifications.XPRefunded", {
      names: names.join(", "), cost: refund
    }));
  }

  /**
   * Clears references in equipment_slots to deleted items. Without this, deleting
   * an equipped weapon/accessory leaves a "dead" item_id: the slot in the UI
   * is drawn empty (the sheet resolves id → null), but checks that read the raw
   * string consider it occupied (a false "needs both hands", see character-sheet).
   */
  #clearSlotsForDeletedItems(collection, ids) {
    if (collection !== "items") return;
    const slots = this.system?.equipment_slots;
    if (!slots) return;
    const gone = new Set(ids);
    const updates = {};
    for (const [key, slot] of Object.entries(slots)) {
      if (slot?.item_id && gone.has(slot.item_id)) {
        updates[`system.equipment_slots.${key}.item_id`] = "";
      }
    }
    if (Object.keys(updates).length) this.update(updates);
  }

  /**
   * Applies damage accounting for damage reduction (DR) by type, Armor Piercing and temporary HP.
   * A single entry point for the damage button in chat (src/chat.mjs) and condition ticks
   * (src/combat.mjs) — the DR math must stay identical.
   * @param {number} damage - incoming damage before reduction
   * @param {object} [options]
   * @param {string} [options.drKey] - damage type (system.dr key), "" — no reduction
   * @param {number} [options.apLevel] - Armor Piercing level (each level cancels 10% of DR)
   * @param {string[]} [options.bypassTypes] - creature types whose DR the breaker weapon ignores
   * @returns {Promise<{applied: number, blocked: number, tempHpDamage: number}>}
   */
  async applyDamage(damage, { drKey = "", apLevel = 0, bypassTypes = [] } = {}) {
    const isPeon = this.type === "npc" && this.system.tier === "peon";
    if (!isPeon && !this.system.resources?.hp) return { applied: 0, blocked: 0, tempHpDamage: 0 };

    let drUnits = 0;
    if (drKey && this.system.dr && this.system.dr[drKey] !== undefined) {
      drUnits = this.system.dr[drKey];

      // Type breaker: if the weapon is attuned against one of the target's types,
      // subtract exactly the DR that this type granted (the sum of its effects for drKey) —
      // the creature is hit "like ordinary flesh", armor and the rest remain.
      // See _rules/18. Enemies.md §Type breaker.
      if (bypassTypes.length) {
        drUnits -= this.#creatureTypeDrContribution(drKey, bypassTypes);
      }
    }

    // One DR unit = 10% reduction; Armor Piercing is subtracted flatly from the percentage
    let drPercent = drUnits * 10;
    if (drPercent > 0) {
      drPercent = Math.max(0, drPercent - apLevel * 10);
    }
    drPercent = Math.min(drPercent, 100);

    // Round to tenths to avoid long fractions
    let finalDamage = Math.max(0, damage * (1 - drPercent / 100));
    finalDamage = Math.round(finalDamage * 10) / 10;
    const blocked = Math.round((damage - finalDamage) * 10) / 10;

    // Peon: health in "hits". Damage AFTER DR is compared with the toughness
    // threshold; a hit ≥ toughness removes exactly 1 hit, a weaker one — 0.
    // The fractional remainder from DR is rounded up to an integer: a peon shouldn't survive
    // because of 2.9 against Toughness 3 — we count in the attacker's favor.
    if (isPeon) {
      const hits = this.system.resources.hits;
      const toughness = this.system.toughness || 0;
      const peonDamage = Math.ceil(finalDamage);
      const removed = peonDamage >= toughness && peonDamage > 0 ? 1 : 0;
      if (removed > 0) {
        await this.update({ "system.resources.hits.value": Math.max(0, hits.value - removed) });
      }
      return { applied: removed, blocked, tempHpDamage: 0, hitsRemoved: removed };
    }

    const currentHp = this.system.resources.hp.value;
    let tempHp = this.system.resources.hp.temp || 0;
    let tempHpDamage = 0;
    if (tempHp > 0) {
      tempHpDamage = Math.min(tempHp, finalDamage);
      tempHp -= tempHpDamage;
      finalDamage -= tempHpDamage;
    }

    const updates = { "system.resources.hp.value": Math.max(0, currentHp - finalDamage) };
    if (tempHpDamage > 0) {
      updates["system.resources.hp.temp"] = tempHp;
    }
    await this.update(updates);

    return { applied: finalDamage + tempHpDamage, blocked, tempHpDamage };
  }

  /**
   * How much DR for damage type drKey the active effects of creature_type Items
   * whose keys are in bypassTypes granted. The source of truth is the type's own change rows,
   * so there's no need to duplicate DR in a separate layer (see applyDamage).
   * @param {string} drKey
   * @param {string[]} bypassTypes
   * @returns {number} total DR units granted by the matching types
   */
  #creatureTypeDrContribution(drKey, bypassTypes) {
    const ADD = CONST.ACTIVE_EFFECT_MODES.ADD;
    const targetKey = `system.dr.${drKey}`;
    let sum = 0;
    for (const item of this.items) {
      if (item.type !== "creature_type" || !bypassTypes.includes(item.system.key)) continue;
      for (const effect of item.effects) {
        if (effect.disabled) continue;
        for (const change of effect.changes) {
          if (change.key === targetKey && change.mode === ADD) sum += Number(change.value) || 0;
        }
      }
    }
    return sum;
  }

  /**
   * Restores HP, capped at the maximum. Shared entry point for the heal button
   * in chat (src/chat.mjs) and healing condition ticks (src/combat.mjs).
   * @param {number} amount
   * @returns {Promise<number>} the HP actually restored
   */
  async applyHealing(amount) {
    const hp = this.system.resources?.hp;
    if (!hp || amount <= 0) return 0;
    const newHp = Math.min(hp.max, hp.value + amount);
    const healed = newHp - hp.value;
    if (healed > 0) await this.update({ "system.resources.hp.value": newHp });
    return healed;
  }

  /**
   * Grants temporary HP (rules: "_rules/9. Combat and Damage.md" §4).
   * Grants from different sources STACK; they burn off on any rest
   * (performRest) or are knocked out by damage (applyDamage removes them first).
   * A direct source update, NOT an Active Effect: an effect would be recomputed on every
   * prepareData and would "regrow" the buffer after each damage absorption.
   * @param {number} amount
   * @returns {Promise<number>} the temporary HP actually granted
   */
  async grantTempHp(amount) {
    const hp = this.system.resources?.hp;
    if (!hp || amount <= 0) return 0;
    await this.update({ "system.resources.hp.temp": (hp.temp || 0) + amount });
    return amount;
  }

  /* -------------------------------------------- */
  /*  Stacking conditions                         */
  /* -------------------------------------------- */

  /**
   * Finds a single-status effect on the actor — the same way
   * core does it in Actor#toggleStatusEffect (our statuses have no static _id).
   * @param {string} statusId
   * @returns {ActiveEffect|null}
   */
  #findStatusEffect(statusId) {
    return this.effects.find(e => (e.statuses.size === 1) && e.statuses.has(statusId)) ?? null;
  }

  /**
   * Scales a status's change rows to the stack count: numeric values
   * in ADD mode are multiplied by the stack count, other modes
   * (OVERRIDE, UPGRADE, etc.) and non-numeric values stay at base.
   *
   * IMPORTANT (V14): the change type is stored in the string `change.type` ("add",
   * "override", ...), NOT in the numeric `change.mode` — in V14 the latter is just
   * a deprecated getter shim, which moreover is absent on the "raw" objects from
   * CONFIG.statusEffects. Checking `mode` here always gave undefined,
   * so effects weren't scaled (only tick damage was scaled,
   * since it goes a separate way through @stacks). We match on the string type,
   * with fallback support for legacy `mode` in case of old data.
   */
  static #scaleStatusChanges(baseChanges, stacks) {
    return baseChanges.map(ch => {
      const num = Number(ch.value);
      const isAdd = (ch.type === "add") || (ch.mode === CONST.ACTIVE_EFFECT_MODES.ADD);
      if (isAdd && Number.isFinite(num)) {
        return { ...ch, value: String(num * stacks) };
      }
      return foundry.utils.deepClone(ch);
    });
  }

  /**
   * Recomputes the effect for a new stack count: name "Name ×N", scaled
   * change rows (written to system.changes — see FOUNDRY V14 QUIRKS.md, section 11;
   * the "apply" phase is delivered by the preUpdateActiveEffect hook) and the counter in the flag.
   * When a stack is added the duration starts counting anew.
   */
  async #updateConditionStacks(effect, status, stacks, { refreshDuration = false } = {}) {
    const update = {
      name: stacks > 1 ? `${status.name} ×${stacks}` : status.name,
      "flags.dedrel.stacks": stacks,
      "system.changes": DedrelActor.#scaleStatusChanges(status.changes ?? [], stacks)
    };
    if (refreshDuration) {
      // IMPORTANT (V14): the remaining duration is computed from the `start` object
      // (round/turn/time/combat/combatant), NOT from the duration.startRound/
      // startTime fields — they don't exist in the V14 schema at all (duration = {value, units, expiry}).
      // The old code wrote to nonexistent fields, so the reset didn't work.
      // We reset `start` to the current moment with core's canonical method
      // (the same one used when the effect is created) — that's the "timer reset".
      update.start = effect.constructor.getEffectStart();
    }
    await effect.update(update);
    return effect;
  }

  /**
   * Applies a stacking condition or adds a stack to it (up to max_stacks).
   * @param {string} statusId - status id from CONFIG.statusEffects
   * @returns {Promise<ActiveEffect|boolean>}
   */
  async addConditionStack(statusId) {
    const status = CONFIG.statusEffects[statusId];
    if (!status) throw new Error(`Invalid status ID "${statusId}" provided to DedrelActor#addConditionStack`);

    const existing = this.#findStatusEffect(statusId);
    if (!existing) return super.toggleStatusEffect(statusId, { active: true });

    // An inactive leftover (expired outside combat before the registry fired, or
    // disabled by hand) isn't stacked up — we replace it with a fresh application
    if (!existing.active) {
      await existing.delete();
      return super.toggleStatusEffect(statusId, { active: true });
    }

    const max = Math.max(1, status.flags?.dedrel?.max_stacks ?? 1);
    const stacks = existing.getFlag("dedrel", "stacks") ?? 1;
    if (stacks >= max) {
      ui.notifications.info(game.i18n.format("DEDREL.Notifications.MaxStacksReached", { name: status.name, max }));
      return existing;
    }
    // The duration timer is refreshed only if the condition has the
    // refresh_on_stack option on; otherwise the duration runs from the first application.
    const refreshDuration = status.flags?.dedrel?.refresh_on_stack ?? false;
    return this.#updateConditionStacks(existing, status, stacks + 1, { refreshDuration });
  }

  /**
   * Removes one stack of a stacking condition; the last stack deletes the effect.
   * @param {string} statusId - status id from CONFIG.statusEffects
   * @returns {Promise<ActiveEffect|null>}
   */
  async removeConditionStack(statusId) {
    const status = CONFIG.statusEffects[statusId];
    const existing = this.#findStatusEffect(statusId);
    if (!existing) return null;

    const stacks = existing.getFlag("dedrel", "stacks") ?? 1;
    if (!status || stacks <= 1) {
      await existing.delete();
      return null;
    }
    return this.#updateConditionStacks(existing, status, stacks - 1);
  }

  /**
   * For stacking conditions, forced activation (active: true) on top of an already
   * present status adds a stack instead of core's "already active" — so reapplying
   * a spell/effect from chat increments the counter. Removal (active: false)
   * and a regular toggle keep core behavior; token HUD clicks are handled by
   * DedrelTokenHUD (src/apps/token-hud.mjs).
   */
  async toggleStatusEffect(statusId, options = {}) {
    const status = CONFIG.statusEffects[statusId];
    if (status?.flags?.dedrel?.stackable && (options.active === true) && this.#findStatusEffect(statusId)) {
      return this.addConditionStack(statusId);
    }
    return super.toggleStatusEffect(statusId, options);
  }
}
