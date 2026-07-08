/**
 * HUD токена с поддержкой стакающихся кондиций (system.stackable у Item типа condition).
 *
 * Поведение кликов по иконке статуса в выпадающей палитре:
 * - Нестакающиеся статусы — стандартное поведение ядра (toggle, ПКМ — оверлей).
 * - Стакающиеся, статус ещё не висит — накладывается первый стак (как обычно).
 * - Стакающиеся, статус уже активен: ЛКМ добавляет стак (до max_stacks),
 *   ПКМ снимает один стак (последний стак удаляет эффект). Оверлей для
 *   стакающихся кондиций недоступен — ПКМ занят декрементом.
 *
 * Регистрируется через CONFIG.Token.hudClass (официальная точка замены, V14).
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

    // Поведение ядра (TokenHUD.#onToggleEffect): toggle по текущему состоянию иконки
    await actor.toggleStatusEffect(statusId, {
      active: !isActive,
      overlay: event.button === 2
    });
  }

}
