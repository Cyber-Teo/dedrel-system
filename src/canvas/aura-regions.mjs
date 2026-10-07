/* ==================================================
 * Synchronizing aura regions with marker effects
 * ==================================================
 * An aura is defined by an Active Effect with the flags.dedrel.aura flag
 * ({radius, disposition, includeSelf, effects?, color?});
 * radius — in scene distance units (meters).
 * While such an effect is active on the actor, each of its tokens
 * on the current scene has an emanation region (V14, attachment
 * to the token — core moves the region with the token by itself) with the behavior
 * "dedrelAura" (see src/data/region-behaviors/aura.mjs),
 * which applies/removes the payload effects on entering tokens.
 *
 * The whole module runs only on the active GM's client:
 * creating/deleting regions and effects requires their permissions,
 * while events and hooks arrive on all clients.
 */

/**
 * Collects the actor's active aura markers.
 * A marker is a "clean" effect with transfer: false: it affects no one itself
 * (the bearer gets the payload only via includeSelf), so we search all
 * effects of the actor and its items, not allApplicableEffects (that one returns
 * only the items' transfer effects).
 * @param {Actor} actor
 * @returns {Map<string, {effect: ActiveEffect, params: object}>} marker uuid → data
 */
function getAuraEffects(actor) {
  const result = new Map();
  const collect = (effect) => {
    if (effect.disabled || effect.isSuppressed) return;
    // A copy applied by an aura can't itself be a marker — protection against
    // dirty data (copies from old versions kept the aura flag)
    if (effect.getFlag("dedrel", "auraApplied")) return;
    const params = effect.getFlag("dedrel", "aura");
    if (!params || !(Number(params.radius) > 0)) return;
    result.set(effect.uuid, { effect, params });
  };
  for (const effect of actor.effects) collect(effect);
  for (const item of actor.items) {
    for (const effect of item.effects) collect(effect);
  }
  return result;
}

/**
 * A normalized snapshot of the aura parameters: written to the region flag
 * on creation and compared during sync, so that the region is recreated
 * after the radius/filters are edited.
 */
function snapshotParams(params) {
  return {
    radius: Number(params.radius),
    disposition: params.disposition ?? "all",
    includeSelf: !!params.includeSelf,
    color: params.color || null
  };
}

/**
 * Removes the effects applied by the region's behaviors from all actors on the scene.
 * Needed when the sync deletes a region: core sends tokenExit only
 * to the tokens in region.tokens, and membership updates asynchronously — when a region
 * is quickly recreated (aura toggle) the exit may not fire and the copies would leak.
 * @param {RegionDocument} region
 */
async function cleanupRegionEffects(region) {
  const scene = region.parent;
  const prefix = region.uuid;
  for (const token of scene.tokens) {
    const actor = token.actor;
    if (!actor) continue;
    const ids = actor.effects
      .filter(e => typeof e.origin === "string" && e.origin.startsWith(prefix))
      .map(e => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  }
}

/**
 * Brings one token's regions in line with the actor's set of active auras.
 * @param {TokenDocument} token
 * @param {Map<string, {effect: ActiveEffect, params: object}>} auraMap
 */
async function syncTokenAuras(token, auraMap) {
  const scene = token.parent;
  if (!scene) return;

  const existing = scene.regions.filter(r => r.getFlag("dedrel", "aura")?.tokenId === token.id);
  const keep = new Set();
  const toDelete = [];

  for (const region of existing) {
    const meta = region.getFlag("dedrel", "aura");
    const desired = auraMap.get(meta.effectUuid);
    // !keep.has(...) — deduplication: if the token already has a region of this
    // aura kept, any second one with the same marker is a leak, delete it together with its
    // effects (otherwise each duplicate applies its own copy — the bonuses double)
    if (desired && !keep.has(meta.effectUuid)
      && foundry.utils.equals(meta.params ?? {}, snapshotParams(desired.params))) {
      keep.add(meta.effectUuid);
    } else {
      // On deletion core sends tokenExit to the tokens in region.tokens, but membership
      // updates asynchronously — clear the region's effects explicitly (idempotent
      // with the exit handler: a repeated deletion finds no effects).
      await cleanupRegionEffects(region);
      toDelete.push(region.id);
    }
  }
  if (toDelete.length) await scene.deleteEmbeddedDocuments("Region", toDelete);

  for (const [effectUuid, { effect, params }] of auraMap) {
    if (keep.has(effectUuid)) continue;
    const snapshot = snapshotParams(params);
    const { distance, distancePixels } = scene.dimensions;
    const center = token.getCenterPoint();
    const { elevation, depth, level } = token._source;
    // A circle from the token's center (like item templates), NOT createTokenEmanation:
    // an emanation expands the token's square footprint and looks like a square with
    // rounded corners. Thanks to attachment.token core moves the region's shapes
    // along with the token by itself (TokenDocument#computeAttachedRegionUpdates).
    await scene.createEmbeddedDocuments("Region", [{
      name: effect.name,
      color: snapshot.color ?? game.user.color,
      visibility: CONST.REGION_VISIBILITY.ALWAYS,
      shapes: [{
        type: "circle",
        x: center.x,
        y: center.y,
        radius: snapshot.radius * distancePixels,
        gridBased: true
      }],
      elevation: {
        bottom: elevation - snapshot.radius,
        top: elevation + (depth * distance) + snapshot.radius
      },
      attachment: { token: token.id },
      levels: [level].filter(l => l !== undefined && l !== null),
      flags: { dedrel: { aura: { effectUuid, tokenId: token.id, params: snapshot } } },
      behaviors: [{
        type: "dedrelAura",
        system: {
          sourceEffectUuid: effectUuid,
          disposition: snapshot.disposition,
          includeSelf: snapshot.includeSelf
        }
      }]
    }]);

    // Tokens inside (including the bearer) do NOT need to be handled by hand: the server
    // sets _priorRegions on any change of token._regions, so
    // after the asynchronous membership update core itself sends tokenEnter
    // to everyone who ended up inside the new region. Applying by hand here
    // would race with that event and produce duplicate copies.
  }
}

/**
 * Full sync of the actor's auras across all its tokens on the current scene.
 * @param {Actor} actor
 */
async function syncActorAuras(actor) {
  const auraMap = getAuraEffects(actor);
  for (const token of actor.getActiveTokens(false, true)) {
    if (!token.persisted) continue;
    await syncTokenAuras(token, auraMap);
  }
}

/* --------------------------------------------------
 * Sync queue: effect edits arrive in batches
 * (e.g. equipping armor disables several effects at once),
 * so requests per actor are coalesced via debounce.
 * -------------------------------------------------- */

const pendingActors = new Set();

const flushPending = foundry.utils.debounce(async () => {
  const uuids = [...pendingActors];
  pendingActors.clear();
  for (const uuid of uuids) {
    const actor = foundry.utils.fromUuidSync(uuid);
    if (!actor) continue;
    try {
      await syncActorAuras(actor);
    } catch (err) {
      console.error(`Dedrel | Aura sync failed for ${uuid}:`, err);
    }
  }
}, 100);

function queueActorSync(actor) {
  if (!actor || !game.users.activeGM?.isSelf || !canvas.ready) return;
  pendingActors.add(actor.uuid);
  flushPending();
}

/** Returns the actor the effect belongs to (directly or through an item). */
function actorOfEffect(effect) {
  let parent = effect.parent;
  if (parent?.documentName === "Item") parent = parent.parent;
  return parent?.documentName === "Actor" ? parent : null;
}

/** Whether the effect (or its changes diff) touches an aura marker. */
function touchesAura(effect, changes) {
  if (effect.getFlag("dedrel", "aura")) return true;
  const dedrelFlags = changes?.flags?.dedrel;
  return !!dedrelFlags && (("aura" in dedrelFlags) || ("-=aura" in dedrelFlags));
}

/* --------------------------------------------------
 * Lifecycle hooks
 * -------------------------------------------------- */

Hooks.on("createActiveEffect", (effect) => {
  if (touchesAura(effect)) queueActorSync(actorOfEffect(effect));
});

Hooks.on("updateActiveEffect", (effect, changes) => {
  // Covers the disabled toggle, editing the aura parameters and removing the flag
  if (touchesAura(effect, changes)) queueActorSync(actorOfEffect(effect));
});

Hooks.on("deleteActiveEffect", (effect) => {
  if (touchesAura(effect)) queueActorSync(actorOfEffect(effect));
});

// Equipping/unequipping an item changes the applicability of its effects (the gate in
// DedrelActor#allApplicableEffects) without separate per-effect hooks —
// we sync the actor when an item with auras is edited.
function onItemChange(item) {
  if (item.parent?.documentName !== "Actor") return;
  if (!item.effects.some(e => e.getFlag("dedrel", "aura"))) return;
  queueActorSync(item.parent);
}
Hooks.on("createItem", onItemChange);
Hooks.on("updateItem", onItemChange);
Hooks.on("deleteItem", onItemChange);

// An aura bearer was placed on the scene. Token deletion isn't handled:
// core itself deletes the attached regions and synthesizes tokenExit.
Hooks.on("createToken", (token) => {
  if (token.actor) queueActorSync(token.actor);
});

/**
 * State reconciliation on scene load. Regions persist in the scene data,
 * so there's no need to recreate them — we need to fix the desync accumulated
 * while the GM was offline (aura events weren't executed during that time):
 * 1) sync regions per actor + delete orphan regions;
 * 2) delete stale payload effects (the aura is gone/the bearer isn't nearby);
 * 3) apply the missing effects to tokens inside auras.
 */
Hooks.on("canvasReady", async () => {
  if (!game.users.activeGM?.isSelf) return;
  const scene = canvas.scene;
  if (!scene) return;

  try {
    // 0. Shards of early versions: an aura marker copied onto ANOTHER actor
    // (by the old "Apply Effects" button). Signature: an actor effect with the
    // aura flag whose origin resolves to another actor's item. Such a shard itself
    // becomes an aura emitter and doubles the bonuses — delete it before the sync.
    for (const token of scene.tokens) {
      const actor = token.actor;
      if (!actor) continue;
      const junk = actor.effects.filter(e => {
        if (!e.getFlag("dedrel", "aura") || !e.origin) return false;
        const origin = foundry.utils.fromUuidSync(e.origin, { strict: false });
        return origin?.documentName === "Item" && origin.parent !== actor;
      }).map(e => e.id);
      if (junk.length) await actor.deleteEmbeddedDocuments("ActiveEffect", junk);
    }

    // 1. Sync all actors on the scene (creates missing regions, deletes extra ones)
    const actors = new Set();
    for (const token of scene.tokens) {
      if (token.actor) actors.add(token.actor);
    }
    for (const actor of actors) await syncActorAuras(actor);

    // Orphan regions: the bearer token is missing from the scene
    const orphans = scene.regions.filter(r => {
      const meta = r.getFlag("dedrel", "aura");
      return meta && !scene.tokens.has(meta.tokenId);
    });
    for (const region of orphans) await cleanupRegionEffects(region);
    if (orphans.length) await scene.deleteEmbeddedDocuments("Region", orphans.map(r => r.id));

    // 2. Effects whose source behavior is gone or whose bearer is no longer nearby.
    // IMPORTANT: the cleanup runs BEFORE re-applying (step 3): idempotency
    // is checked by marker, and a stale copy with an origin from the old region
    // would otherwise block applying a fresh one.
    // Duplicates of a single marker (races from past versions) are removed here too:
    // at most one copy of each aura remains on the actor.
    for (const token of scene.tokens) {
      const actor = token.actor;
      if (!actor) continue;
      const seenMarkers = new Set();
      const stale = actor.effects.filter(e => {
        const marker = e.getFlag("dedrel", "auraApplied");
        if (!marker) return false;
        const behavior = foundry.utils.fromUuidSync(e.origin, { strict: false });
        if (!behavior || behavior.documentName !== "RegionBehavior") return true;
        if (behavior.disabled || behavior.region?.hidden || !behavior.region?.tokens.has(token)) return true;
        if (seenMarkers.has(marker)) return true;
        seenMarkers.add(marker);
        return false;
      }).map(e => e.id);
      if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale);
    }

    // 3. Tokens that entered auras without a GM: apply the effects (idempotently).
    // Hidden regions are skipped: when hiding, core synthesizes tokenExit,
    // and the aura counts as off while the region is hidden.
    for (const region of scene.regions) {
      if (region.hidden || !region.getFlag("dedrel", "aura")) continue;
      for (const behavior of region.behaviors) {
        if (behavior.type !== "dedrelAura" || behavior.disabled) continue;
        for (const token of region.tokens) {
          await behavior.system.applyAuraToToken(token);
        }
      }
    }
  } catch (err) {
    console.error("Dedrel | Aura reconciliation failed:", err);
  }
});
