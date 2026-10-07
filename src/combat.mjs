import { DR_KEY_LABELS } from "./constants.mjs";
import { ActionEconomy } from "./utils/action-economy.mjs";

/**
 * Custom combat document: condition ticks — periodic damage from conditions
 * (system.tick on Items of type condition, carried over into the status's flags.dedrel.tick
 * when CONFIG.statusEffects is assembled). The lifecycle methods _onStartTurn/_onEndTurn
 * are called by core only on the active GM and aren't called when a turn is rolled back,
 * so damage is applied exactly once. Skipped turns (context.skipped
 * when the initiative is fast-forwarded) don't tick.
 */
export default class DedrelCombat extends Combat {
  async _onStartTurn(combatant, context) {
    await super._onStartTurn(combatant, context);
    if (!context.skipped && combatant.actor) await applyConditionTicks(combatant.actor, "turnStart");
  }

  async _onEndTurn(combatant, context) {
    await super._onEndTurn(combatant, context);
    if (!context.skipped && combatant.actor) await applyConditionTicks(combatant.actor, "turnEnd");
  }
}

async function applyConditionTicks(actor, trigger) {
  for (const effect of actor.appliedEffects) {
    const tick = effect.getFlag("dedrel", "tick");
    if (!tick?.formula || (tick.trigger || "turnStart") !== trigger) continue;

    const stacks = effect.getFlag("dedrel", "stacks") ?? 1;
    let roll;
    try {
      roll = new Roll(tick.formula, { stacks });
      await roll.evaluate();
    } catch (err) {
      console.error(`Dedrel | Condition tick formula error "${effect.name}": ${tick.formula}`, err);
      continue;
    }

    let flavor;
    if (tick.is_heal) {
      const healed = await actor.applyHealing(roll.total);
      flavor = game.i18n.format("DEDREL.Chat.ConditionTickHeal", {
        actor: actor.name,
        condition: effect.name,
        amount: healed
      });
    } else {
      const result = await actor.applyDamage(roll.total, { drKey: tick.damage_type || "" });
      const typeStr = tick.damage_type && DR_KEY_LABELS[tick.damage_type]
        ? ` [${game.i18n.localize(DR_KEY_LABELS[tick.damage_type])}]`
        : "";
      flavor = game.i18n.format("DEDREL.Chat.ConditionTickDamage", {
        actor: actor.name,
        condition: effect.name,
        damage: result.applied,
        type: typeStr
      });
      if (result.blocked > 0) {
        flavor += ` <span style="color: var(--color-text-dark-secondary); font-size: 0.9em;">${game.i18n.format("DEDREL.Chat.DamageBlocked", { dr: result.blocked })}</span>`;
      }
    }
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor
    });
  }
}

Hooks.on("updateCombat", async (combat, changed, options, userId) => {
  // Gate on the ACTIVE GM (not any isGM): with two GM clients the AP
  // restoration would run twice (idempotent, but duplicating notifications).
  // Closing the chain HUD below is client-side and comes before the gate.
  if (changed.turn !== undefined || changed.round !== undefined) {
    if (game.dedrel.chainHUD && game.dedrel.chainHUD.actor) {
      game.dedrel.chainHUD.closeHUD();
    }
  }
  if (!game.users.activeGM?.isSelf) return;
  if (!combat.started) return;

  const restoreTiming = game.settings.get("dedrel", "apRestoreTiming") || "startOfTurn";

  // Restoration logic at the start of the round for EVERYONE
  if (restoreTiming === "startOfRound" && changed.round !== undefined && combat.round > 0) {
    if (options.direction === 1 || options.direction === undefined) {
      let updatedAny = false;
      for (const combatant of combat.combatants) {
        const actor = combatant.actor;
        if (!actor || !["character", "npc"].includes(actor.type)) continue;
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
        await ActionEconomy.resetAction(actor);
      }

      if (updatedAny) {
        ui.notifications.info(game.i18n.localize("DEDREL.Notifications.RoundAPRestored"));
      }
    }
  }

  // Restoration logic at the start of the turn for the CURRENT character
  if (restoreTiming === "startOfTurn" && (changed.turn !== undefined || changed.round !== undefined)) {
    if (options.direction === 1 || options.direction === undefined) {
      const combatant = combat.combatant;
      if (combatant && combatant.actor && ["character", "npc"].includes(combatant.actor.type)) {
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
          await ActionEconomy.resetAction(actor);
        }
      }
    }
  }

});

/**
 * Cleanup of ephemeral spells (an "on the fly" cast from the Constructor without saving,
 * flags.dedrel.ephemeral) when combat ends/is deleted. Spells pinned with the
 * "pin" button don't have the flag and aren't deleted.
 * Gate on the active GM: the hook arrives on all clients, and players have no permissions
 * over other people's actors (the same scheme as auras — see FOUNDRY V14 QUIRKS.md, section 13).
 */
Hooks.on("deleteCombat", async (combat) => {
  if (!game.users.activeGM?.isSelf) return;
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!actor) continue;
    const ephemeral = actor.items.filter(i => i.type === "spell" && i.getFlag("dedrel", "ephemeral"));
    if (ephemeral.length > 0) {
      await actor.deleteEmbeddedDocuments("Item", ephemeral.map(i => i.id));
    }
  }
});
