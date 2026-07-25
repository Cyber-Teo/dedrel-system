Hooks.on("preUpdateToken", (tokenDocument, changes, options, userId) => {
  if (userId !== game.user.id) return;
  if (!game.combat?.started) return;
  if (changes.x === undefined && changes.y === undefined) return;
  if (!canvas.ready) return;

  const actor = tokenDocument.actor;
  // Бюджет Скорости общий для персонажей и NPC: перемещение не манёвр и
  // считается метрами у всех (_rules/9. Combat and Damage «Передвижение и Скорость»).
  if (!actor || !["character", "npc"].includes(actor.type)) return;
  
  const res = actor.system.resources;
  if (!res || !res.movement) return;

  const currentX = tokenDocument.x;
  const currentY = tokenDocument.y;
  const targetX = changes.x !== undefined ? changes.x : currentX;
  const targetY = changes.y !== undefined ? changes.y : currentY;

  // Рассчитываем пройденную дистанцию в единицах измерения сцены (например, метры)
  const waypoints = [{x: currentX, y: currentY}, {x: targetX, y: targetY}];
  let distance = 0;
  
  // В Foundry V12+ метод измерения пути
  if (canvas.grid.measurePath) {
    const path = canvas.grid.measurePath(waypoints);
    distance = path.distance;
  } else if (canvas.grid.measureDistance) {
    // Fallback для более старых версий (хотя в V14 должен быть measurePath)
    distance = canvas.grid.measureDistance(waypoints[0], waypoints[1]);
  }

  // Скорость измеряется в МЕТРАХ. measurePath().distance уже возвращает дистанцию
  // в единицах сцены (метрах) через клеточный движок Foundry — он считает в клетках
  // даже при выключенной сетке, поэтому опираемся на его результат, а не на пиксели.
  // Округляем до десятых, чтобы избежать накопления погрешности float.
  const speedCost = Math.round(distance * 10) / 10;

  if (speedCost > 0) {
    const currentSpeed = res.movement.value;
    const round = (x) => Math.round(x * 10) / 10;

    // Если это отмена (Undo / Ctrl+Z), возвращаем скорость
    if (options.undo || options.isUndo) {
      const newSpeed = Math.min(res.movement.max, round(currentSpeed + speedCost));
      actor.update({ "system.resources.movement.value": newSpeed });
      return;
    }

    if (speedCost > currentSpeed) {
      ui.notifications.warn(game.i18n.format("DEDREL.Notifications.NotEnoughSpeed", {cost: speedCost, current: round(currentSpeed)}));
      // Мы не блокируем движение (чтобы игроки могли ошибаться или договариваться с ГМом), но предупреждаем
    }

    // Вычитаем скорость, не опуская ниже 0
    const newSpeed = Math.max(0, round(currentSpeed - speedCost));

    // Добавляем обновление актора в очередь
    actor.update({ "system.resources.movement.value": newSpeed });
  }
});
