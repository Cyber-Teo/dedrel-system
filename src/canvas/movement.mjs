Hooks.on("preUpdateToken", (tokenDocument, changes, options, userId) => {
  if (userId !== game.user.id) return;
  if (!game.combat?.started) return;
  if (changes.x === undefined && changes.y === undefined) return;
  if (!canvas.ready) return;

  const actor = tokenDocument.actor;
  // The Speed budget is shared by characters and NPCs: movement isn't a maneuver and
  // is counted in meters for everyone (_rules/9. Combat and Damage "Movement and Speed").
  if (!actor || !["character", "npc"].includes(actor.type)) return;
  
  const res = actor.system.resources;
  if (!res || !res.movement) return;

  const currentX = tokenDocument.x;
  const currentY = tokenDocument.y;
  const targetX = changes.x !== undefined ? changes.x : currentX;
  const targetY = changes.y !== undefined ? changes.y : currentY;

  // Compute the distance traveled in scene units (e.g. meters)
  const waypoints = [{x: currentX, y: currentY}, {x: targetX, y: targetY}];
  let distance = 0;
  
  // The path measuring method in Foundry V12+
  if (canvas.grid.measurePath) {
    const path = canvas.grid.measurePath(waypoints);
    distance = path.distance;
  } else if (canvas.grid.measureDistance) {
    // Fallback for older versions (although V14 should have measurePath)
    distance = canvas.grid.measureDistance(waypoints[0], waypoints[1]);
  }

  // Speed is measured in METERS. measurePath().distance already returns the distance
  // in scene units (meters) through Foundry's grid engine — it counts in squares
  // even with the grid turned off, so we rely on its result rather than on pixels.
  // Round to tenths to avoid accumulating float error.
  const speedCost = Math.round(distance * 10) / 10;

  if (speedCost > 0) {
    const currentSpeed = res.movement.value;
    const round = (x) => Math.round(x * 10) / 10;

    // If this is an undo (Undo / Ctrl+Z), give the speed back
    if (options.undo || options.isUndo) {
      const newSpeed = Math.min(res.movement.max, round(currentSpeed + speedCost));
      actor.update({ "system.resources.movement.value": newSpeed });
      return;
    }

    if (speedCost > currentSpeed) {
      ui.notifications.warn(game.i18n.format("DEDREL.Notifications.NotEnoughSpeed", {cost: speedCost, current: round(currentSpeed)}));
      // We don't block the movement (so that players can make mistakes or negotiate with the GM), but we warn
    }

    // Subtract the speed without going below 0
    const newSpeed = Math.max(0, round(currentSpeed - speedCost));

    // Queue the actor update
    actor.update({ "system.resources.movement.value": newSpeed });
  }
});
