const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
import { DedrelBonuses } from "../utils/dedrel-bonuses.mjs";

export default class ChainManeuversHUD extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dedrel-chain-maneuvers-hud",
    classes: ["dedrel", "chain-hud"],
    tag: "div",
    window: {
      frame: true,
      title: "Chain Maneuvers",
      minimizable: true
    },
    position: {
      width: 320,
      height: "auto",
      left: 100, // Сдвигаем влево, чтобы не перекрывало центр
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
      const allManeuvers = this._actor.items.filter(i => i.type === "maneuver");
      const usedKey = this._usedManeuver.system.key || this._usedManeuver.name || this._usedManeuver.id;
      
      const apUniversal = this._actor.system.resources?.ap_universal?.value || 0;
      const apManeuver = this._actor.system.resources?.ap_maneuver?.value || 0;
      const currentAp = apUniversal + apManeuver;

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
        // Стоимость с учётом DSL-модификаторов (та же логика, что и в Item#use()),
        // иначе бесплатные по баффу манёвры отображались бы серыми и некликабельными.
        const { cost } = DedrelBonuses.effectiveApCost(this._actor, i);
        const canAfford = cost <= currentAp;

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
      // Use the maneuver. The `use` method inside Item will trigger a new HUD if it's an action/chain
      await item.use();
    }
  }

  static async #onCancelChain(event, target) {
    this.closeHUD();
  }

  _onRender(context, options) {
    super._onRender(context, options);
  }
}
