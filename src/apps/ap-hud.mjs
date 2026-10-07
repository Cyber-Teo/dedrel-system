import { showRollDialog } from "../dice/roll.mjs";
import { ActionEconomy } from "../utils/action-economy.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export default class ActionPointsHUD extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dedrel-ap-hud",
    classes: ["dedrel"],
    tag: "div",
    window: {
      frame: true,
      title: "DEDREL.Hud.BattleHud",
      positioned: true,
      minimizable: true
    },
    position: {
      width: "auto",
      height: "auto",
      top: 0,
      left: 0
    },
    actions: {
      toggleMenu: ActionPointsHUD.#onToggleMenu,
      hudRollCheck: ActionPointsHUD.#onRollCheck,
      hudUseItem: ActionPointsHUD.#onUseItem
    }
  };

  static PARTS = {
    main: {
      template: "systems/dedrel/templates/apps/ap-hud.hbs"
    }
  };

  constructor(options) {
    super(options);
    this.actor = null;
    this.token = null;
  }

  get isRendered() {
    return this.rendered;
  }

  /** The selected token's name in the title: the GM switches between fighters and loses track
   *  of whose HUD is in front of them. */
  get title() {
    const base = game.i18n.localize("DEDREL.Hud.BattleHud");
    const name = this.token?.name || this.actor?.name;
    return name ? `${base}: ${name}` : base;
  }

  /** Core sets the title only on the FIRST render
   *  (Application#_configureRenderOptions), while the HUD moves from token to token —
   *  so we update the name on every render. */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    if (this.hasFrame) {
      options.window ??= {};
      options.window.title = this.title;
    }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    
    if (!this.actor) {
      context.visible = false;
      return context;
    }

    const res = this.actor.system.resources;
    if (!res) {
      context.visible = false;
      return context;
    }

    context.visible = true;
    
    // Prepare arrays for cubes (max value)
    const uniMax = res.ap_universal?.max || 0;
    const uniVal = res.ap_universal?.value || 0;
    context.universal = Array.from({length: uniMax}, (_, i) => ({
      active: i < uniVal
    }));

    const manMax = res.ap_maneuver?.max || 0;
    const manVal = res.ap_maneuver?.value || 0;
    context.maneuver = Array.from({length: manMax}, (_, i) => ({
      active: i < manVal
    }));

    const magMax = res.ap_magic?.max || 0;
    const magVal = res.ap_magic?.value || 0;
    context.magic = Array.from({length: magMax}, (_, i) => ({
      active: i < magVal
    }));

    // Speed in meters is fractional, hence a bar (rather than pips like AP).
    const speedMax = res.movement?.max || 0;
    const speedVal = res.movement?.value || 0;
    const round1 = (x) => Math.round(x * 10) / 10;
    context.hasSpeed = speedMax > 0;
    context.speedVal = round1(speedVal);
    context.speedMax = round1(speedMax);
    context.speedPercent = speedMax > 0 ? Math.min(100, Math.round((speedVal / speedMax) * 100)) : 0;

    // The "one Action per turn" indicator: shown only in combat, otherwise it
    // would hang as spent forever between fights (the reset happens at turn start).
    context.showAction = !!game.combat?.started;
    context.actionSpent = ActionEconomy.isActionSpent(this.actor);
    context.hasStatusRow = context.showAction || context.hasSpeed;

    // Favorites for the dropdown menus (the same sources as on the character sheet)
    this.#prepareFavorites(context);

    return context;
  }

  /**
   * Collects the favorite skills, maneuvers/spells and quick slots
   * (the `dedrel.isFavorite` flag on items, the `dedrel.favoriteSkills` flag on the actor).
   */
  #prepareFavorites(context) {
    const favSkillsFlag = this.actor.getFlag("dedrel", "favoriteSkills") || [];
    const skills = this.actor.system.skills || {};
    context.favSkills = favSkillsFlag
      .filter(key => skills[key])
      .map(key => ({
        key,
        rank: skills[key].rank,
        bonus: skills[key].bonus,
        name: game.i18n.localize(`DEDREL.Skills.${key}`)
      }));

    const favAbilities = [];
    const quickSlots = [];
    for (const i of this.actor.items) {
      if (!i.getFlag("dedrel", "isFavorite")) continue;
      const entry = {
        id: i.id,
        name: i.name,
        img: i.img,
        hasCharges: i.system.has_charges,
        uses: i.system.uses_value,
        max: i.system.uses_max
      };
      if (i.type === "maneuver" || i.type === "spell") favAbilities.push(entry);
      else if (i.type === "magic_item") quickSlots.push(entry);
      // Other "consumable" inventory (potions/scrolls, etc.), except equipment
      else if (!["weapon", "armor", "currency"].includes(i.type)) quickSlots.push(entry);
    }
    context.favAbilities = favAbilities;
    context.quickSlots = quickSlots;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    // Closing open menus on a click outside the HUD
    if (this.#outsideClickHandler) {
      document.removeEventListener("click", this.#outsideClickHandler);
    }
    this.#outsideClickHandler = (event) => {
      if (this.element && !this.element.contains(event.target)) this.#closeMenus();
    };
    document.addEventListener("click", this.#outsideClickHandler);
  }

  async close(options) {
    if (this.#outsideClickHandler) {
      document.removeEventListener("click", this.#outsideClickHandler);
      this.#outsideClickHandler = null;
    }
    return super.close(options);
  }

  #outsideClickHandler = null;

  /** Collapse all expanded menu panels and remove the highlight from the buttons. */
  #closeMenus() {
    if (!this.element) return;
    this.element.querySelectorAll(".ap-menu-panel.open").forEach(p => p.classList.remove("open"));
    this.element.querySelectorAll(".ap-menu-btn.active").forEach(b => b.classList.remove("active"));
  }

  /** Click on a menu button — expand/collapse the panel (one is open at a time). */
  static #onToggleMenu(event, target) {
    const menuId = target.dataset.menu;
    const panel = this.element.querySelector(`.ap-menu-panel[data-menu="${menuId}"]`);
    if (!panel) return;
    const wasOpen = panel.classList.contains("open");
    this.#closeMenus();
    if (!wasOpen) {
      panel.classList.add("open");
      target.classList.add("active");
    }
  }

  /** Click on a favorite skill in the menu — roll the check. */
  static async #onRollCheck(event, target) {
    if (!this.actor) return;
    await showRollDialog({
      actor: this.actor,
      title: target.dataset.label,
      baseRank: parseInt(target.dataset.rank) || 0,
      skillId: target.dataset.skill
    });
  }

  /** Click on a favorite maneuver/spell/slot — use the item. */
  static async #onUseItem(event, target) {
    if (!this.actor) return;
    const item = this.actor.items.get(target.dataset.itemId);
    if (item && typeof item.use === "function") {
      await item.use();
    } else if (item) {
      ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ItemCannotBeUsed"));
    }
  }

  updateForToken(token) {
    if (!token) {
      this.actor = null;
      this.token = null;
      if (this.rendered) this.close();
      return;
    }

    const actor = token.actor;
    if (!actor || !["character", "npc"].includes(actor.type)) {
      this.actor = null;
      this.token = null;
      if (this.rendered) this.close();
      return;
    }

    this.actor = actor;
    this.token = token;
    this.render({ force: true });
  }

  activateHooks() {
    Hooks.on("controlToken", (token, controlled) => {
      // Find the first controlled character token
      const controlledTokens = canvas.tokens.controlled.filter(t => ["character", "npc"].includes(t.actor?.type));
      if (controlledTokens.length > 0) {
        this.updateForToken(controlledTokens[0]);
      } else {
        this.updateForToken(null);
      }
    });

    Hooks.on("updateActor", (actor, changes, options, userId) => {
      const isOurActor = this.actor && this.actor.id === actor.id;

      // Change of favorite skills (an actor flag) — redraw the HUD menu.
      if (isOurActor && foundry.utils.hasProperty(changes, "flags.dedrel.favoriteSkills")) {
        this.render({ force: true });
      }

      // The Action indicator lives in a flag, not in system.resources —
      // without a separate branch it would stick until the next AP spend.
      if (isOurActor && foundry.utils.hasProperty(changes, "flags.dedrel.actionSpent")) {
        this.render({ force: true });
      }

      if (foundry.utils.hasProperty(changes, "system.resources")) {
        // Update our HUD
        if (isOurActor) {
          this.render({ force: true });
        }

        // Force Foundry to redraw our custom bars on the tokens
        actor.getActiveTokens().forEach(token => {
          token.renderFlags.set({ refreshBars: true });
        });
      }
    });

    // Change in the set/favorite status of items — refresh the dropdown menus.
    const refreshOnItem = (item) => {
      if (this.actor && item.parent?.id === this.actor.id && this.rendered) {
        this.render({ force: true });
      }
    };
    Hooks.on("createItem", refreshOnItem);
    Hooks.on("deleteItem", refreshOnItem);
    Hooks.on("updateItem", (item, changes) => {
      // React to a change of the favorite flag or spent charges.
      if (foundry.utils.hasProperty(changes, "flags.dedrel.isFavorite") ||
          foundry.utils.hasProperty(changes, "system.uses_value")) {
        refreshOnItem(item);
      }
    });
  }
}
