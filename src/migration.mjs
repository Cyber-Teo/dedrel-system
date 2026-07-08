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

    return updateData;
  }
}
