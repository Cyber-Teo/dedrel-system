Hooks.on("updateCombat", async (combat, changed, options, userId) => {
  if (!game.user.isGM) return;
  if (!combat.started) return;

  const restoreTiming = game.settings.get("dedrel", "apRestoreTiming") || "startOfTurn";

  // Логика восстановления в начале раунда для ВСЕХ
  if (restoreTiming === "startOfRound" && changed.round !== undefined && combat.round > 0) {
    if (options.direction === 1 || options.direction === undefined) {
      let updatedAny = false;
      for (const combatant of combat.combatants) {
        const actor = combatant.actor;
        if (!actor || actor.type !== "character") continue;
        const res = actor.system.resources;
        if (!res) continue;
        
        const updateData = {};
        if (res.ap_universal && res.ap_universal.value !== res.ap_universal.max) {
          updateData["system.resources.ap_universal.value"] = res.ap_universal.max;
        }
        if (res.ap_magic && res.ap_magic.value !== res.ap_magic.max) {
          updateData["system.resources.ap_magic.value"] = res.ap_magic.max;
        }
        if (res.ap_maneuver && res.ap_maneuver.value !== res.ap_maneuver.max) {
          updateData["system.resources.ap_maneuver.value"] = res.ap_maneuver.max;
        }
        if (res.movement && res.movement.value !== res.movement.max) {
          updateData["system.resources.movement.value"] = res.movement.max;
        }
        
        if (Object.keys(updateData).length > 0) {
          await actor.update(updateData);
          updatedAny = true;
        }
      }

      if (updatedAny) {
        ui.notifications.info(game.i18n.localize("DEDREL.Notifications.RoundAPRestored"));
      }
    }
  }

  // Логика восстановления в начале хода для ТЕКУЩЕГО персонажа
  if (restoreTiming === "startOfTurn" && (changed.turn !== undefined || changed.round !== undefined)) {
    if (options.direction === 1 || options.direction === undefined) {
      const combatant = combat.combatant;
      if (combatant && combatant.actor && combatant.actor.type === "character") {
        const actor = combatant.actor;
        const res = actor.system.resources;
        if (res) {
          const updateData = {};
          if (res.ap_universal && res.ap_universal.value !== res.ap_universal.max) {
            updateData["system.resources.ap_universal.value"] = res.ap_universal.max;
          }
          if (res.ap_magic && res.ap_magic.value !== res.ap_magic.max) {
            updateData["system.resources.ap_magic.value"] = res.ap_magic.max;
          }
          if (res.ap_maneuver && res.ap_maneuver.value !== res.ap_maneuver.max) {
            updateData["system.resources.ap_maneuver.value"] = res.ap_maneuver.max;
          }
          if (res.movement && res.movement.value !== res.movement.max) {
            updateData["system.resources.movement.value"] = res.movement.max;
          }
          
          if (Object.keys(updateData).length > 0) {
            await actor.update(updateData);
          }
        }
      }
    }
  }

  // Закрытие окна цепных манёвров при смене хода (чтобы не загромождать интерфейс)
  if (changed.turn !== undefined || changed.round !== undefined) {
    if (game.dedrel.chainHUD && game.dedrel.chainHUD.actor) {
      game.dedrel.chainHUD.closeHUD();
    }
  }
});
