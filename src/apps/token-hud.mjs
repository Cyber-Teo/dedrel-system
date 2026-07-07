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

  _onRender(context, options) {
    super._onRender(context, options);
    this.#renderStackBadges();
  }

  /**
   * Счётчики стаков поверх иконок палитры статусов. Иконки — голые <img>
   * в grid-контейнере, вложить в них бейдж нельзя, а обёртка сломала бы сетку,
   * поэтому бейджи позиционируются абсолютно по номеру ячейки (CSS-переменные
   * --col/--row, размеры ячеек берутся из ядровых --effect-size/--effect-gap).
   * HUD перерендеривается ядром при любом изменении эффектов актёра
   * (TokenDocument#_onRelatedUpdate), так что счётчики всегда актуальны.
   */
  #renderStackBadges() {
    const actor = this.actor;
    const palette = this.element?.querySelector(".status-effects");
    if (!actor || !palette) return;

    palette.querySelectorAll(".dedrel-stack-badge").forEach(el => el.remove());
    const cols = parseInt(getComputedStyle(palette).getPropertyValue("--effect-columns")) || 5;

    palette.querySelectorAll(".effect-control").forEach((icon, i) => {
      if (!icon.classList.contains("active")) return;
      const statusId = icon.dataset.statusId;
      if (!CONFIG.statusEffects[statusId]?.flags?.dedrel?.stackable) return;

      const effect = actor.effects.find(e => (e.statuses.size === 1) && e.statuses.has(statusId));
      const stacks = effect?.getFlag("dedrel", "stacks") ?? 1;

      const badge = document.createElement("div");
      badge.className = "dedrel-stack-badge";
      badge.style.setProperty("--col", i % cols);
      badge.style.setProperty("--row", Math.floor(i / cols));
      badge.textContent = stacks;
      palette.append(badge);
    });
  }
}
