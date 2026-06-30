Hooks.on("preUpdateToken", (tokenDocument, changes, options, userId) => {
  if (userId !== game.user.id) return;
  if (!game.combat?.started) return;
  if (changes.x === undefined && changes.y === undefined) return;
  if (!canvas.ready) return;

  const actor = tokenDocument.actor;
  if (!actor || actor.type !== "character") return;
  
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

  // Расчет расхода скорости. 
  // Настройки сцены (grid distance) используются напрямую, но 1 единица скорости = 2 метра.
  // Так как мы договорились опираться на настройки сцены, то:
  // Если сцена в метрах, и 1 клетка = 2 метра, то distance = 2. Следовательно, это 1 скорость.
  // То есть SpeedCost = distance / canvas.scene.grid.distance (что дает количество клеток)
  // И 1 клетка = 1 скорость. Значит расход равен количеству клеток.
  const gridDistance = canvas.scene.grid.distance;
  const speedCost = distance / gridDistance;

  if (speedCost > 0) {
    const currentSpeed = res.movement.value;
    
    // Если это отмена (Undo / Ctrl+Z), возвращаем скорость
    if (options.undo || options.isUndo) {
      const newSpeed = Math.min(res.movement.max, currentSpeed + Math.ceil(speedCost));
      actor.update({ "system.resources.movement.value": newSpeed });
      return;
    }

    if (speedCost > currentSpeed) {
      ui.notifications.warn(game.i18n.format("DEDREL.Notifications.NotEnoughSpeed", {cost: Math.ceil(speedCost), current: currentSpeed}));
      // Мы не блокируем движение (чтобы игроки могли ошибаться или договариваться с ГМом), но предупреждаем
    }
    
    // Вычитаем скорость, не опуская ниже 0
    const newSpeed = Math.max(0, currentSpeed - Math.ceil(speedCost));
    
    // Добавляем обновление актора в очередь
    actor.update({ "system.resources.movement.value": newSpeed });
  }
});
