import { buildTokenLightChanges, stripTokenLightChanges } from "./config/effect-library.mjs";

/**
 * Manages the process of migrating system data between versions.
 */
export class DedrelMigration {
  /**
   * Runs the migration of all data in the world.
   * @param {string} currentVersion The current system version
   */
  static async migrateWorld(currentVersion) {
    ui.notifications.info(game.i18n.format("DEDREL.Notifications.MigrationStart", { version: currentVersion }), { permanent: true });
    
    // Migrating Actors
    for (const actor of game.actors) {
      try {
        const updateData = this.migrateActorData(actor.toObject());
        if (!foundry.utils.isEmpty(updateData)) {
          console.log(`Dedrel | Migrating actor ${actor.name}`);
          await actor.update(updateData);
        }
      } catch (err) {
        console.error(`Dedrel | Error migrating actor ${actor.name}:`, err);
      }
    }
    
    // Migrating Items
    for (const item of game.items) {
      try {
        const updateData = this.migrateItemData(item.toObject());
        if (!foundry.utils.isEmpty(updateData)) {
          console.log(`Dedrel | Migrating item ${item.name}`);
          await item.update(updateData);
        }
      } catch (err) {
        console.error(`Dedrel | Error migrating item ${item.name}:`, err);
      }
    }

    // Migrating Scenes: token light "baked" by the removed token-light hook
    // (flags.dedrel.baseLight), and legacy effects in the deltas of unlinked tokens
    for (const scene of game.scenes) {
      try {
        const tokenUpdates = [];
        for (const token of scene.tokens) {
          const baseLight = token.flags?.dedrel?.baseLight;
          if (baseLight !== undefined) {
            tokenUpdates.push({ _id: token.id, light: baseLight, "flags.dedrel.baseLight": _del });
          }
          if (!token.actorLink && token.actor) {
            await this.migrateActorEffects(token.actor);
          }
        }
        if (tokenUpdates.length) {
          console.log(`Dedrel | Migrating scene tokens ${scene.name}`);
          await scene.updateEmbeddedDocuments("Token", tokenUpdates);
        }
      } catch (err) {
        console.error(`Dedrel | Error migrating scene ${scene.name}:`, err);
      }
    }

    // Save the new migration version
    await game.settings.set("dedrel", "systemMigrationVersion", currentVersion);
    ui.notifications.info(game.i18n.format("DEDREL.Notifications.MigrationComplete", { version: currentVersion }), { permanent: true });
  }

  /**
   * Actor data migration logic
   */
  static migrateActorData(actorData) {
    const updateData = {};

    // Example of a future migration:
    // if (actorData.system.oldField !== undefined) {
    //   updateData["system.newField"] = actorData.system.oldField;
    //   updateData["system.-=oldField"] = null;
    // }

    // Migrating the actor's own effects (applied light potions, etc.)
    const effectsUpdate = this.#migrateEffectsArray(actorData.effects);
    if (effectsUpdate.length > 0) {
      updateData.effects = effectsUpdate;
    }

    // Migrating the actor's embedded items
    if (actorData.items) {
      const itemsUpdate = actorData.items.reduce((arr, item) => {
        const itemUpdate = this.migrateItemData(item);
        if (!foundry.utils.isEmpty(itemUpdate)) {
          itemUpdate._id = item._id;
          arr.push(itemUpdate);
        }
        return arr;
      }, []);
      
      if (itemsUpdate.length > 0) {
        updateData.items = itemsUpdate;
      }
    }

    return updateData;
  }

  /**
   * Item data migration logic
   */
  static migrateItemData(itemData) {
    const updateData = {};

    // Rarity normalization: the legacy value "very rare" (with a space) →
    // the canonical key "very_rare" (see ITEM_RARITY_ENUM). Affects
    // armor first of all, where the choice used to have a space.
    if (itemData.system?.rarity === "very rare") {
      updateData["system.rarity"] = "very_rare";
    }

    // Migrating the item's effects (legacy token light)
    const effectsUpdate = this.#migrateEffectsArray(itemData.effects);
    if (effectsUpdate.length > 0) {
      updateData.effects = effectsUpdate;
    }

    return updateData;
  }

  /**
   * Effect data migration logic.
   *
   * Legacy light: the flags.dedrel.tokenLight marker (read by the removed hook
   * src/canvas/token-light.mjs) → native `token.light.*` change rows,
   * which V14 core applies to the bearer's token ephemerally by itself.
   */
  static migrateEffectData(effectData) {
    const updateData = {};

    const legacyLight = effectData.flags?.dedrel?.tokenLight;
    if (legacyLight) {
      updateData["system.changes"] = [
        ...stripTokenLightChanges(effectData),
        ...buildTokenLightChanges(legacyLight)
      ];
      updateData["flags.dedrel.tokenLight"] = _del;
    }

    return updateData;
  }

  /** Collects an array of updates for embedded effects (with _id). */
  static #migrateEffectsArray(effects) {
    return (effects ?? []).reduce((arr, effect) => {
      const effectUpdate = this.migrateEffectData(effect);
      if (!foundry.utils.isEmpty(effectUpdate)) {
        effectUpdate._id = effect._id;
        arr.push(effectUpdate);
      }
      return arr;
    }, []);
  }

  /**
   * Migrates the effects of a synthetic actor (the delta of an unlinked token)
   * with direct document updates — a bulk delta update through the scene
   * is unreliable for embedded collections.
   */
  static async migrateActorEffects(actor) {
    const targets = [
      ...actor.effects,
      ...actor.items.contents.flatMap(i => [...i.effects])
    ];
    for (const effect of targets) {
      const effectUpdate = this.migrateEffectData(effect.toObject());
      if (!foundry.utils.isEmpty(effectUpdate)) {
        console.log(`Dedrel | Migrating effect ${effect.name} (${actor.name})`);
        await effect.update(effectUpdate);
      }
    }
  }
}
