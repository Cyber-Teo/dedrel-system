/**
 * "Aura" region behavior (dedrelAura).
 * Attached to an emanation region bound to a token (see src/canvas/aura-regions.mjs).
 * When a token enters the region it applies the aura's payload effects to its actor
 * (filtered by disposition), and removes them on exit.
 *
 * IMPORTANT: region events are broadcast via socket to ALL clients, so the handlers
 * are gated on game.users.activeGM?.isSelf — the logic runs exactly once
 * and with GM permissions. Without a connected GM the automation doesn't work; desync
 * is fixed by reconciliation on canvasReady (see aura-regions.mjs).
 */

const fields = foundry.data.fields;

export default class DedrelAuraRegionBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {

  static LOCALIZATION_PREFIXES = ["DEDREL.RegionBehaviors.Aura"];

  /**
   * disposition/includeSelf are duplicated from the marker effect's flags.dedrel.aura
   * so that event handling doesn't depend on resolving the marker. The sync layer
   * recreates the region when the flag changes, so the values don't diverge.
   */
  static defineSchema() {
    return {
      sourceEffectUuid: new fields.DocumentUUIDField({ type: "ActiveEffect" }),
      disposition: new fields.StringField({
        required: true,
        choices: {
          all: "DEDREL.Aura.Dispositions.all",
          friendly: "DEDREL.Aura.Dispositions.friendly",
          hostile: "DEDREL.Aura.Dispositions.hostile"
        },
        initial: "all"
      }),
      includeSelf: new fields.BooleanField({ initial: false })
    };
  }

  static events = {
    [CONST.REGION_EVENTS.TOKEN_ENTER]: this.#onTokenEnter,
    [CONST.REGION_EVENTS.TOKEN_EXIT]: this.#onTokenExit
  };

  /** @this {DedrelAuraRegionBehaviorType} */
  static async #onTokenEnter(event) {
    if (!game.users.activeGM?.isSelf) return;
    await this.applyAuraToToken(event.data.token);
  }

  /** @this {DedrelAuraRegionBehaviorType} */
  static async #onTokenExit(event) {
    if (!game.users.activeGM?.isSelf) return;
    await this.removeAuraFromToken(event.data.token);
  }

  /**
   * Applies the aura's payload effects to the token's actor. Idempotent: a repeated
   * call for a token that has already received this aura's effects does nothing.
   * Public method: called both from the tokenEnter handler and from the state
   * reconciliation on canvasReady.
   * @param {TokenDocument} token
   */
  async applyAuraToToken(token) {
    const actor = token?.actor;
    if (!actor) return;

    const sourceToken = this.region?.attachment?.token ?? null;
    if (!sourceToken) return;

    if (token.id === sourceToken.id) {
      if (!this.includeSelf) return;
    } else if (!this.#matchesDisposition(sourceToken, token)) {
      return;
    }

    // Idempotency by marker, not by the behavior's uuid: when the
    // region is recreated (toggle, parameter edits) the uuid changes, and an origin check
    // would accumulate duplicates if the exit event hadn't managed to remove
    // the old copy. One marker — at most one copy on the actor.
    if (actor.effects.some(e => e.getFlag("dedrel", "auraApplied") === this.sourceEffectUuid)) return;

    const payload = await this.#getPayloadEffects();
    if (!payload.length) return;

    const toCreate = payload.map(e => this.#cloneEffectData(e));
    await actor.createEmbeddedDocuments("ActiveEffect", toCreate);
  }

  /**
   * Removes all effects applied by this aura from the token's actor.
   * No repeated disposition check — this way removal is robust to a change of
   * disposition while the token was inside the zone.
   * @param {TokenDocument} token
   */
  async removeAuraFromToken(token) {
    const actor = token?.actor;
    if (!actor) return;
    const ids = actor.effects.filter(e => e.origin === this.behavior.uuid).map(e => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  }

  /**
   * Checks the target's disposition relative to the source token:
   * friendly — matches the source; hostile — opposite to it
   * (meaningful only for FRIENDLY/HOSTILE; a NEUTRAL/SECRET source
   * in hostile mode matches no one); all — anyone.
   */
  #matchesDisposition(sourceToken, targetToken) {
    const D = CONST.TOKEN_DISPOSITIONS;
    switch (this.disposition) {
      case "friendly":
        return targetToken.disposition === sourceToken.disposition;
      case "hostile":
        return Math.abs(sourceToken.disposition) === D.FRIENDLY
          && targetToken.disposition === -sourceToken.disposition;
      default:
        return true;
    }
  }

  /**
   * Collects the list of payload effects:
   * 1) the explicit uuid list from the marker's flags.dedrel.aura.effects (if set);
   * 2) otherwise — sibling effects of the same item with flags.dedrel.applyTo = "aura".
   * Returns [] if the marker is deleted or disabled.
   */
  async #getPayloadEffects() {
    const marker = await foundry.utils.fromUuid(this.sourceEffectUuid);
    if (!marker?.active) return [];

    const aura = marker.getFlag("dedrel", "aura") ?? {};
    if (Array.isArray(aura.effects) && aura.effects.length) {
      const resolved = await Promise.all(aura.effects.map(u => foundry.utils.fromUuid(u)));
      return resolved.filter(e => e);
    }

    let item = marker.parent;
    if (item?.documentName !== "Item" && marker.origin) {
      const origin = await foundry.utils.fromUuid(marker.origin);
      if (origin?.documentName === "Item") item = origin;
    }
    const siblings = item?.documentName === "Item"
      ? item.effects.filter(e => e.getFlag("dedrel", "applyTo") === "aura")
      : [];
    if (siblings.length) return siblings;

    // Single-effect authoring: if there are no separate payload effects, the aura hands out
    // the marker's own changes. The aura flag is cleared on cloning so that the
    // recipient doesn't become an aura bearer. The marker is kept with transfer: false and
    // affects no one itself — the bearer gets the payload only via
    // includeSelf (through the same region path as the other recipients).
    const markerChanges = marker._source.system?.changes ?? marker._source.changes ?? [];
    return markerChanges.length ? [marker] : [];
  }

  /**
   * Clones effect data for applying to a recipient.
   * IMPORTANT (V14, QUIRKS §11): changes live in system.changes; the legacy
   * data.changes is removed so that the deprecated shim doesn't fire.
   * The "apply" phase for system.* changes will be set automatically
   * by the preCreateActiveEffect hook (see dedrel.mjs).
   */
  #cloneEffectData(effect) {
    const data = effect.toObject();
    delete data._id;
    const changes = foundry.utils.deepClone(
      effect._source.system?.changes ?? effect._source.changes ?? []
    );
    delete data.changes;
    foundry.utils.setProperty(data, "system.changes", changes);
    data.origin = this.behavior.uuid;
    data.transfer = false;
    data.disabled = false;
    // applyTo: "aura" and the aura marker flag only make sense on the source item
    if (data.flags?.dedrel?.applyTo) delete data.flags.dedrel.applyTo;
    if (data.flags?.dedrel?.aura) delete data.flags.dedrel.aura;
    foundry.utils.setProperty(data, "flags.dedrel.auraApplied", this.sourceEffectUuid);
    return data;
  }
}
