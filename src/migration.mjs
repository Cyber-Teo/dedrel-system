import { buildTokenLightChanges, stripTokenLightChanges } from "./config/effect-library.mjs";

/**
 * Управляет процессом миграции данных системы между версиями.
 */
export class DedrelMigration {
  /**
   * Выполняет миграцию всех данных в мире.
   * @param {string} currentVersion Текущая версия системы
   */
  static async migrateWorld(currentVersion) {
    ui.notifications.info(`Dedrel | Начинаем миграцию данных системы до версии ${currentVersion}...`, { permanent: true });
    
    // Миграция Актеров
    for (const actor of game.actors) {
      try {
        const updateData = this.migrateActorData(actor.toObject());
        if (!foundry.utils.isEmpty(updateData)) {
          console.log(`Dedrel | Миграция актера ${actor.name}`);
          await actor.update(updateData);
        }
      } catch (err) {
        console.error(`Dedrel | Ошибка при миграции актера ${actor.name}:`, err);
      }
    }
    
    // Миграция Предметов
    for (const item of game.items) {
      try {
        const updateData = this.migrateItemData(item.toObject());
        if (!foundry.utils.isEmpty(updateData)) {
          console.log(`Dedrel | Миграция предмета ${item.name}`);
          await item.update(updateData);
        }
      } catch (err) {
        console.error(`Dedrel | Ошибка при миграции предмета ${item.name}:`, err);
      }
    }

    // Миграция Сцен: свет токенов, «запечённый» удалённым хуком token-light
    // (flags.dedrel.baseLight), и легаси-эффекты в дельтах непривязанных токенов
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
          console.log(`Dedrel | Миграция токенов сцены ${scene.name}`);
          await scene.updateEmbeddedDocuments("Token", tokenUpdates);
        }
      } catch (err) {
        console.error(`Dedrel | Ошибка при миграции сцены ${scene.name}:`, err);
      }
    }

    // Сохраняем новую версию миграции
    await game.settings.set("dedrel", "systemMigrationVersion", currentVersion);
    ui.notifications.info(`Dedrel | Миграция системы до версии ${currentVersion} завершена!`, { permanent: true });
  }

  /**
   * Логика миграции данных актера
   */
  static migrateActorData(actorData) {
    const updateData = {};

    // Пример будущей миграции:
    // if (actorData.system.oldField !== undefined) {
    //   updateData["system.newField"] = actorData.system.oldField;
    //   updateData["system.-=oldField"] = null;
    // }

    // Миграция собственных эффектов актера (наложенные зелья света и т.п.)
    const effectsUpdate = this.#migrateEffectsArray(actorData.effects);
    if (effectsUpdate.length > 0) {
      updateData.effects = effectsUpdate;
    }

    // Миграция вложенных предметов актера
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
   * Логика миграции данных предмета
   */
  static migrateItemData(itemData) {
    const updateData = {};

    // Нормализация редкости: легаси-значение "very rare" (с пробелом) →
    // канонический ключ "very_rare" (см. ITEM_RARITY_ENUM). Затрагивает
    // прежде всего броню, где раньше был выбор с пробелом.
    if (itemData.system?.rarity === "very rare") {
      updateData["system.rarity"] = "very_rare";
    }

    // Миграция эффектов предмета (легаси-свет токена)
    const effectsUpdate = this.#migrateEffectsArray(itemData.effects);
    if (effectsUpdate.length > 0) {
      updateData.effects = effectsUpdate;
    }

    return updateData;
  }

  /**
   * Логика миграции данных эффекта.
   *
   * Легаси-свет: маркер flags.dedrel.tokenLight (его читал удалённый хук
   * src/canvas/token-light.mjs) → нативные change-строки `token.light.*`,
   * которые ядро V14 само эфемерно применяет к токену носителя.
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

  /** Собирает массив обновлений для встроенных эффектов (с _id). */
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
   * Мигрирует эффекты синтетического актера (дельта непривязанного токена)
   * прямыми обновлениями документов — массовый update дельты через сцену
   * ненадёжен для вложенных коллекций.
   */
  static async migrateActorEffects(actor) {
    const targets = [
      ...actor.effects,
      ...actor.items.contents.flatMap(i => [...i.effects])
    ];
    for (const effect of targets) {
      const effectUpdate = this.migrateEffectData(effect.toObject());
      if (!foundry.utils.isEmpty(effectUpdate)) {
        console.log(`Dedrel | Миграция эффекта ${effect.name} (${actor.name})`);
        await effect.update(effectUpdate);
      }
    }
  }
}
