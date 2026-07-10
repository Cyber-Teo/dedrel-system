const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
import { hasTokenLightChanges } from "../config/effect-library.mjs";

export default class ActiveEffectsHUD extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dedrel-active-effects-hud",
    classes: ["dedrel", "effects-hud"],
    tag: "div",
    window: {
      frame: false
    },
    position: {
      width: "auto",
      height: "auto"
    },
    actions: {
      removeEffect: ActiveEffectsHUD.#onRemoveEffect
    }
  };

  static PARTS = {
    main: {
      template: "systems/dedrel/templates/apps/active-effects-hud.hbs"
    }
  };

  constructor(options) {
    super(options);
    this._actor = null;
    this._hooks = [];
  }

  get actor() {
    return this._actor;
  }

  set actor(actor) {
    this._actor = actor;
    if (actor) {
      this.render({ force: true });
    } else if (this.rendered) {
      this.render({ force: true }); // It will render empty
    }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Согласно архитектуре V14, сайдбар всегда свернут по умолчанию.
    // Официальный источник истины — геттер ui.sidebar.expanded
    let isCollapsed = true;
    if (ui.sidebar && ui.sidebar.expanded !== undefined) {
      isCollapsed = !ui.sidebar.expanded;
    }
    context.isCollapsed = isCollapsed;

    context.effects = [];
    
    if (this._actor) {
      // Маркеры собственных аур носителя: они transfer: false и не входят
      // в appliedEffects, но игроку нужен быстрый тумблер (ПКМ выключает ауру)
      const ownMarkers = [];
      for (const item of this._actor.items) {
        for (const e of item.effects) {
          if (!e.disabled && !e.isSuppressed && e.getFlag("dedrel", "aura")) {
            ownMarkers.push(e);
          }
        }
      }
      const ownMarkerUuids = new Set(ownMarkers.map(e => e.uuid));

      const effectsCollection = this._actor.appliedEffects || this._actor.effects;
      const visibleEffects = effectsCollection.filter(e => {
        // Show effects that are not disabled and either have a status ID, are a condition, or have an icon/img
        const isCondition = e.flags?.dedrel?.condition === true;
        const hasStatus = e.statuses?.size > 0;
        // Бафы/дебафы, навешенные аурой (см. src/canvas/aura-regions.mjs) —
        // пассивные, без статуса, но игроку важно видеть, что он под аурой.
        // Копию СОБСТВЕННОЙ ауры не показываем: её представляет иконка маркера.
        const auraMarker = e.flags?.dedrel?.auraApplied;
        const isAuraApplied = !!auraMarker && !ownMarkerUuids.has(auraMarker);
        // Световые эффекты (token.light.*) показываем всегда: игроку нужен
        // быстрый доступ к тумблеру (ПКМ гасит), без костыля с длительностью
        return !e.disabled && !(auraMarker && ownMarkerUuids.has(auraMarker))
          && (isCondition || hasStatus || isAuraApplied || e.isTemporary || hasTokenLightChanges(e));
      });
      visibleEffects.push(...ownMarkers);

      context.effects = visibleEffects.map(e => {
        const isAuraMarker = !!e.getFlag("dedrel", "aura");
        let tooltip = `<strong>${e.name}</strong>`;

        let durationText = "";

        // Foundry предоставляет готовый e.duration.label, который показывает *оставшееся* время на текущем языке.
        if (e.duration && e.duration.label) {
          tooltip += `<br><em><i class="fas fa-clock"></i> ${e.duration.label}</em>`;
          const match = e.duration.label.match(/\d+/);
          if (match) {
            durationText = match[0];
          }
        }

        if (e.description) {
          tooltip += `<hr>${e.description}`;
        }

        if (isAuraMarker) {
          tooltip += `<hr><em>${game.i18n.localize("DEDREL.Hud.AuraOffHint")}</em>`;
        } else if (e.transfer && e.parent instanceof Item && hasTokenLightChanges(e)) {
          tooltip += `<hr><em>${game.i18n.localize("DEDREL.Hud.LightOffHint")}</em>`;
        }

        return {
          id: e.id,
          uuid: e.uuid,
          name: e.name,
          img: e.img || e.icon || "icons/svg/aura.svg",
          description: e.description || "",
          tooltip: tooltip,
          durationText: durationText,
          // Счётчик стаков показываем от двух: один стак — обычное состояние
          stacks: (e.flags?.dedrel?.stacks ?? 1) > 1 ? e.flags.dedrel.stacks : null,
          isAuraMarker: isAuraMarker,
          isTechnical: e.flags?.dedrel?.is_technical || false
        };
      }).filter(e => !e.isTechnical);
    }
    
    return context;
  }

  static async #onRemoveEffect(event, target) {
    event.preventDefault();
    if (event.type !== "contextmenu") return; // Ensure it's a right-click if we bind to contextmenu, or we can just bind to click in the template. Wait, actions in V2 trigger on click by default. We can use right-click action if we map it, but standard actions are click. 
    // Actually, V2 actions trigger on 'click'. If we want right-click, we can either use data-action and accept left click, or we add event listener in _onRender.
    
    const effectId = target.closest("[data-effect-id]")?.dataset.effectId;
    if (!effectId) return;
    
    if (!this.actor) return;
    const effect = this.actor.effects.get(effectId);
    if (effect) {
      await effect.delete();
    }
  }

  // In V2, actions are triggered by click. If we want right-click (contextmenu) to delete:
  _onRender(context, options) {
    super._onRender(context, options);
    
    // Ensure it's in the body
    if (this.element.parentElement !== document.body) {
      document.body.appendChild(this.element);
    }

    // Add right-click listener for removal
    const effectElements = this.element.querySelectorAll(".effect-icon");
    for (const el of effectElements) {
      el.addEventListener("contextmenu", async (event) => {
        event.preventDefault();
        if (!this.actor) return;
        // uuid нужен для эффектов, вложенных в предметы (маркеры аур):
        // их нет в actor.effects
        const effect = el.dataset.effectUuid
          ? foundry.utils.fromUuidSync(el.dataset.effectUuid, { strict: false })
          : this.actor.effects.get(el.dataset.effectId);
        if (!effect) return;

        // Маркер ауры не удаляем, а выключаем: настройки (радиус, цели)
        // сохраняются, включить обратно можно кнопкой на карточке предмета в чате
        if (effect.getFlag("dedrel", "aura")) {
          const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: game.i18n.localize("DEDREL.Notifications.DisableAuraTitle") },
            content: `<p>${game.i18n.format("DEDREL.Notifications.DisableAuraConfirm", { name: effect.name })}</p>`,
            modal: true
          });
          if (!confirmed) return;
          await effect.update({ disabled: true });
          ui.notifications.info(game.i18n.format("DEDREL.Notifications.AuraDisabled", { name: effect.name }));
          return;
        }

        // Transfer-эффект живёт НА ПРЕДМЕТЕ (фонарь, зачарованная вещь) и виден
        // в HUD как эффект актёра: delete() снёс бы его с самого предмета вместе
        // с настройками. Вместо удаления выключаем (disabled) — включить обратно
        // можно использованием предмета (тумблер света) или с его листа.
        if (effect.transfer && effect.parent instanceof Item) {
          const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: game.i18n.localize("DEDREL.Notifications.DisableItemEffectTitle") },
            content: `<p>${game.i18n.format("DEDREL.Notifications.DisableItemEffectConfirm", { name: effect.name, item: effect.parent.name })}</p>`,
            modal: true
          });
          if (!confirmed) return;
          await effect.update({ disabled: true });
          ui.notifications.info(game.i18n.format("DEDREL.Notifications.ItemEffectDisabled", { name: effect.name, item: effect.parent.name }));
          return;
        }

        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: game.i18n.localize("DEDREL.Notifications.DeleteEffectTitle") },
          content: `<p>${game.i18n.format("DEDREL.Notifications.DeleteEffectConfirm", { name: effect.name, actor: this.actor.name })}</p>`,
          modal: true
        });
        if (confirmed) {
          await effect.delete();
        }
      });
    }
  }

  activateHooks() {
    this._hooks.push(
      Hooks.on("controlToken", this._onControlToken.bind(this)),
      Hooks.on("createActiveEffect", this._onEffectChange.bind(this)),
      Hooks.on("updateActiveEffect", this._onEffectChange.bind(this)),
      Hooks.on("deleteActiveEffect", this._onEffectChange.bind(this)),
      // Правки предметов меняют набор transfer-эффектов актёра (например,
      // удаление таланта уносит его эффекты БЕЗ хуков deleteActiveEffect)
      Hooks.on("createItem", this._onEffectChange.bind(this)),
      Hooks.on("updateItem", this._onEffectChange.bind(this)),
      Hooks.on("deleteItem", this._onEffectChange.bind(this)),
      Hooks.on("updateToken", this._onEffectChange.bind(this)),
      // Время/бой не несут актёра — идут отдельным обработчиком, который
      // переподготавливает длительности и перерисовывает счётчик раундов.
      Hooks.on("updateWorldTime", this._onTimeChange.bind(this)),
      Hooks.on("updateCombat", this._onTimeChange.bind(this)),
      Hooks.on("updateCombatant", this._onTimeChange.bind(this)),
      Hooks.on("collapseSidebar", this._onCollapseSidebar.bind(this)),
      Hooks.on("canvasReady", this._onCanvasReady.bind(this))
    );
  }

  _onCollapseSidebar(sidebar, collapsed) {
    const list = this.element?.querySelector(".active-effects-list");
    if (list) {
      list.classList.toggle("sidebar-collapsed", collapsed);
    }
  }

  _onControlToken(token, controlled) {
    // Use setTimeout to let canvas.tokens.controlled update properly
    setTimeout(() => {
      const controlledTokens = canvas.tokens.controlled;
      if (controlledTokens.length > 0) {
        this.actor = controlledTokens[0].actor;
      } else {
        this.actor = game.user.character || null;
      }
    }, 10);
  }

  _onCanvasReady() {
    this._onControlToken();
  }

  _onEffectChange(doc, ...args) {
    const current = this._actor;
    if (!current) return;
    // Эффект может быть вложен в предмет (transfer-эффекты талантов и т.п.) —
    // тогда актёр находится на уровень выше (effect.parent.parent).
    let parent = doc?.parent;
    if (parent?.documentName === "Item") parent = parent.parent;
    if (parent?.documentName !== "Actor") return;
    // Сравниваем по id/uuid, а НЕ по ссылке: у несвязанного токена синтетический
    // актёр пересоздаётся при апдейтах, из-за чего сохранённый this._actor
    // устаревает и строгое сравнение (parent === this.actor) молча не срабатывало —
    // панель не обновлялась (напр. счётчик стаков «залипал» до перевыделения).
    // Заодно переустанавливаем актёра на свежий экземпляр (сеттер перерисует),
    // чтобы _prepareContext читал актуальные appliedEffects.
    if (parent.id === current.id || parent.uuid === current.uuid) {
      this.actor = parent;
    }
  }

  /**
   * Продвижение времени мира или раунда/хода боя. Эти хуки не несут актёра,
   * поэтому фильтровать по нему нельзя. Длительности эффектов (duration.label,
   * оставшиеся раунды) — ПОДГОТАВЛИВАЕМЫЕ значения (ActiveEffect#_prepareDuration
   * в prepareDerivedData), а не живые геттеры: ядро на updateWorldTime лишь
   * прогоняет реестр истечения, но label не пересчитывает. Поэтому вручную
   * переподготавливаем актёра и перерисовываем — иначе счётчик раундов застывал
   * до перевыделения токена.
   */
  _onTimeChange() {
    if (!this._actor || !this.rendered) return;
    this._actor.prepareData();
    this.render();
  }
}
