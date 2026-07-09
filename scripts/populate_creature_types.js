/*
 * Макрос-наполнитель компендиума «Creature Types» (dedrel.creature_types).
 *
 * Как использовать:
 *   1. Убедитесь, что мир перезапущен после добавления пака в system.json
 *      (Foundry создаёт пустой компендиум автоматически).
 *   2. Создайте Script-макрос в Foundry, вставьте это содержимое, запустите.
 *
 * Идемпотентно: создаёт только недостающие типы (по совпадению system.key),
 * поэтому повторный запуск не плодит дубликаты. Названия берутся из локализации
 * DEDREL.CreatureTypes.<key>, список ключей — из CONFIG.DEDREL.creatureTypes.
 */
(async () => {
  const pack = game.packs.get("dedrel.creature_types");
  if (!pack) {
    ui.notifications.error("Компендиум dedrel.creature_types не найден. Перезапустите мир.");
    return;
  }

  const keys = CONFIG.DEDREL?.creatureTypes || [];
  if (!keys.length) {
    ui.notifications.warn("CONFIG.DEDREL.creatureTypes пуст.");
    return;
  }

  // Уже существующие ключи в компендиуме (чтобы не дублировать).
  const docs = await pack.getDocuments();
  const existingKeys = new Set(docs.map(d => d.system?.key).filter(Boolean));

  const toCreate = [];
  for (const key of keys) {
    if (existingKeys.has(key)) continue;
    toCreate.push({
      name: game.i18n.localize(`DEDREL.CreatureTypes.${key}`),
      type: "creature_type",
      img: "icons/svg/mystery-man.svg",
      system: { key }
    });
  }

  if (!toCreate.length) {
    ui.notifications.info("Все типы существ уже присутствуют в компендиуме.");
    return;
  }

  await Item.createDocuments(toCreate, { pack: pack.collection });
  ui.notifications.info(`Добавлено типов существа в компендиум: ${toCreate.length}`);
})();
