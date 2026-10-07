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

    // Per the V14 architecture, the sidebar is always collapsed by default.
    // The official source of truth is the ui.sidebar.expanded getter
    let isCollapsed = true;
    if (ui.sidebar && ui.sidebar.expanded !== undefined) {
      isCollapsed = !ui.sidebar.expanded;
    }
    context.isCollapsed = isCollapsed;

    context.effects = [];
    
    if (this._actor) {
      // Markers of the bearer's own auras: they are transfer: false and aren't part
      // of appliedEffects, but the player needs a quick toggle (right-click turns the aura off)
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
        // Buffs/debuffs applied by an aura (see src/canvas/aura-regions.mjs) —
        // passive, without a status, but it matters to the player to see they're under an aura.
        // A copy of one's OWN aura isn't shown: the marker icon represents it.
        const auraMarker = e.flags?.dedrel?.auraApplied;
        const isAuraApplied = !!auraMarker && !ownMarkerUuids.has(auraMarker);
        // Light effects (token.light.*) are always shown: the player needs
        // quick access to the toggle (right-click turns it off), without a duration hack
        return !e.disabled && !(auraMarker && ownMarkerUuids.has(auraMarker))
          && (isCondition || hasStatus || isAuraApplied || e.isTemporary || hasTokenLightChanges(e));
      });
      visibleEffects.push(...ownMarkers);

      context.effects = visibleEffects.map(e => {
        const isAuraMarker = !!e.getFlag("dedrel", "aura");
        let tooltip = `<strong>${e.name}</strong>`;

        let durationText = "";

        // Foundry provides a ready e.duration.label that shows the *remaining* time in the current language.
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
          // The stack counter is shown from two up: a single stack is a regular condition
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
        // uuid is needed for effects embedded in items (aura markers):
        // they aren't in actor.effects
        const effect = el.dataset.effectUuid
          ? foundry.utils.fromUuidSync(el.dataset.effectUuid, { strict: false })
          : this.actor.effects.get(el.dataset.effectId);
        if (!effect) return;

        // An aura marker isn't deleted but disabled: the settings (radius, targets)
        // are kept, and it can be turned back on with the button on the item's chat card
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

        // A transfer effect lives ON THE ITEM (a lantern, an enchanted item) and is shown
        // in the HUD as an actor effect: delete() would remove it from the item itself along
        // with its settings. Instead of deleting we disable it — it can be turned back on
        // by using the item (the light toggle) or from its sheet.
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
      // Item edits change the actor's set of transfer effects (e.g.
      // deleting a talent takes its effects away WITHOUT deleteActiveEffect hooks)
      Hooks.on("createItem", this._onEffectChange.bind(this)),
      Hooks.on("updateItem", this._onEffectChange.bind(this)),
      Hooks.on("deleteItem", this._onEffectChange.bind(this)),
      Hooks.on("updateToken", this._onEffectChange.bind(this)),
      // Time/combat don't carry an actor — they go through a separate handler that
      // re-prepares the durations and redraws the round counter.
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
    // The effect may be embedded in an item (transfer effects of talents, etc.) —
    // then the actor is one level up (effect.parent.parent).
    let parent = doc?.parent;
    if (parent?.documentName === "Item") parent = parent.parent;
    if (parent?.documentName !== "Actor") return;
    // Compare by id/uuid, NOT by reference: for an unlinked token the synthetic
    // actor is recreated on updates, so the saved this._actor
    // goes stale and the strict comparison (parent === this.actor) silently failed —
    // the panel didn't update (e.g. the stack counter "stuck" until reselection).
    // At the same time we reset the actor to the fresh instance (the setter redraws),
    // so that _prepareContext reads the current appliedEffects.
    if (parent.id === current.id || parent.uuid === current.uuid) {
      this.actor = parent;
    }
  }

  /**
   * Advancing world time or a combat round/turn. These hooks don't carry an actor,
   * so they can't be filtered by it. Effect durations (duration.label,
   * remaining rounds) are PREPARED values (ActiveEffect#_prepareDuration
   * in prepareDerivedData), not live getters: core on updateWorldTime only
   * runs the expiry registry, but doesn't recompute the label. So we manually
   * re-prepare the actor and redraw — otherwise the round counter froze
   * until the token was reselected.
   */
  _onTimeChange() {
    if (!this._actor || !this.rendered) return;
    this._actor.prepareData();
    this.render();
  }
}
