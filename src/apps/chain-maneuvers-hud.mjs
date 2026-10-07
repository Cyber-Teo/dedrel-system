const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
import { DedrelBonuses } from "../utils/dedrel-bonuses.mjs";

export default class ChainManeuversHUD extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dedrel-chain-maneuvers-hud",
    classes: ["dedrel", "chain-hud"],
    tag: "div",
    window: {
      frame: true,
      title: "DEDREL.Hud.ChainManeuvers",
      minimizable: true
    },
    position: {
      width: 320,
      height: "auto",
      left: 100, // Shift to the left so as not to cover the center
      top: 100
    },
    actions: {
      useChainManeuver: ChainManeuversHUD.#onUseChainManeuver,
      cancelChain: ChainManeuversHUD.#onCancelChain
    }
  };

  static PARTS = {
    main: {
      template: "systems/dedrel/templates/apps/chain-maneuvers-hud.hbs"
    }
  };

  constructor(options) {
    super(options);
    this._actor = null;
    this._usedManeuver = null;
  }

  get actor() {
    return this._actor;
  }

  showFor(actor, maneuver) {
    if (!actor || !maneuver) return;
    this._actor = actor;
    this._usedManeuver = maneuver;
    this.options.window.title = game.i18n.format("DEDREL.Chat.ChainTriggered", {name: maneuver.name});
    this.render({ force: true });
  }

  closeHUD() {
    this._actor = null;
    this._usedManeuver = null;
    this.close();
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.chainManeuvers = [];
    context.usedManeuverName = this._usedManeuver ? this._usedManeuver.name : "";

    if (this._actor && this._usedManeuver) {
      // Spells with the "Chain" Action Type take part alongside maneuvers
      const allManeuvers = this._actor.items.filter(i => i.type === "maneuver" || i.type === "spell");
      const usedKey = this._usedManeuver.system.key || this._usedManeuver.name || this._usedManeuver.id;

      const apUniversal = this._actor.system.resources?.ap_universal?.value || 0;
      const apManeuver = this._actor.system.resources?.ap_maneuver?.value || 0;
      const apMagic = this._actor.system.resources?.ap_magic?.value || 0;

      const chains = allManeuvers.filter(i => {
        // Must be a chain
        const actionType = i.system.action_type || {};
        if (!actionType.chain) return false;

        // Must match triggers
        let triggers = i.system.chain_trigger_maneuvers || [];
        if (triggers.length === 1 && typeof triggers[0] === "string" && triggers[0].includes(";")) {
          triggers = triggers[0].split(";").map(s => s.trim());
        }
        const isAny = triggers.includes("any") || triggers.includes("Any");
        const isMatch = triggers.includes(usedKey) || triggers.includes(this._usedManeuver.name);

        return (isAny || isMatch) && i.getFlag("dedrel", "isFavorite");
      });

      context.chainManeuvers = chains.map(i => {
        // Cost including DSL modifiers (the same logic as in Item#use()),
        // otherwise maneuvers made free by a buff would show up gray and unclickable.
        const { cost } = DedrelBonuses.effectiveApCost(this._actor, i);
        // The pool depends on the type: maneuvers draw from combat AP, spells from Magic AP
        const specificAp = i.type === "spell" ? apMagic : apManeuver;
        const canAfford = cost <= (apUniversal + specificAp);

        return {
          id: i.id,
          name: i.name,
          img: i.img || "icons/svg/sword.svg",
          cost: cost,
          canAfford: canAfford
        };
      });
    }
    
    return context;
  }

  static async #onUseChainManeuver(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    if (!itemId || !this.actor) return;
    
    const item = this.actor.items.get(itemId);
    if (item) {
      // Launching SPECIFICALLY as a chain: a maneuver marked as both Action and Chain must not
      // use up the turn's Action if it was invoked from this HUD (see action-economy.mjs).
      // Use the maneuver. The `use` method inside Item will trigger a new HUD if it's an action/chain
      await item.use({ mode: "chain" });
    }
  }

  static async #onCancelChain(event, target) {
    this.closeHUD();
  }

  _onRender(context, options) {
    super._onRender(context, options);
  }
}
