/**
 * Token HUD with support for stacking conditions (system.stackable on Items of type condition).
 *
 * Click behavior on a status icon in the dropdown palette:
 * - Non-stacking statuses — standard core behavior (toggle, right-click — overlay).
 * - Stacking, the status isn't present yet — the first stack is applied (as usual).
 * - Stacking, the status is already active: left-click adds a stack (up to max_stacks),
 *   right-click removes one stack (the last stack deletes the effect). The overlay isn't
 *   available for stacking conditions — right-click is taken by the decrement.
 *
 * Registered via CONFIG.Token.hudClass (the official replacement point, V14).
 */
export default class DedrelTokenHUD extends foundry.applications.hud.TokenHUD {
  static DEFAULT_OPTIONS = {
    actions: {
      effect: { handler: DedrelTokenHUD.#onToggleEffect, buttons: [0, 2] }
    }
  };

  /**
   * @this {DedrelTokenHUD}
   * @param {PointerEvent} event
   * @param {HTMLButtonElement} target
   */
  static async #onToggleEffect(event, target) {
    const actor = this.actor;
    if (!actor) {
      ui.notifications.warn("HUD.WarningEffectNoActor", { localize: true });
      return;
    }
    const statusId = target.dataset.statusId;
    const status = CONFIG.statusEffects[statusId];
    const isActive = target.classList.contains("active");

    if (status?.flags?.dedrel?.stackable && isActive) {
      if (event.button === 2) await actor.removeConditionStack(statusId);
      else await actor.addConditionStack(statusId);
      return;
    }

    // Core behavior (TokenHUD.#onToggleEffect): toggle by the icon's current state
    await actor.toggleStatusEffect(statusId, {
      active: !isActive,
      overlay: event.button === 2
    });
  }

}
