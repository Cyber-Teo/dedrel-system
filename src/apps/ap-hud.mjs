const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export default class ActionPointsHUD extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dedrel-ap-hud",
    classes: ["dedrel", "ap-hud"],
    tag: "div",
    window: {
      frame: false,
      positioned: true
    },
    position: {
      width: "auto",
      height: "auto",
      top: 0,
      left: 0
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

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
  }

  updateForToken(token) {
    if (!token) {
      this.actor = null;
      this.token = null;
      if (this.rendered) this.close();
      return;
    }

    const actor = token.actor;
    if (!actor || actor.type !== "character") {
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
      const controlledTokens = canvas.tokens.controlled.filter(t => t.actor?.type === "character");
      if (controlledTokens.length > 0) {
        this.updateForToken(controlledTokens[0]);
      } else {
        this.updateForToken(null);
      }
    });

    Hooks.on("updateActor", (actor, changes, options, userId) => {
      if (foundry.utils.hasProperty(changes, "system.resources")) {
        // Обновляем наш HUD
        if (this.actor && this.actor.id === actor.id) {
          this.render({ force: true });
        }
        
        // Заставляем Foundry перерисовать наши кастомные бары на токенах
        actor.getActiveTokens().forEach(token => {
          token.renderFlags.set({ refreshBars: true });
        });
      }
    });
  }
}
