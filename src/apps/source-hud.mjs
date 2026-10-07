import {
  doctrinesWithSource,
  sceneSourceScale,
  setSceneSourceScale,
  nextSourceScale
} from "../utils/magic-source.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The Scene Sources widget: a strip of alchemical symbols in the left column
 * of the interface, visible to everyone at all times.
 *
 * Why: the Source Scale decides whether a caster needs the Create technique (2 AP) or
 * whether Direct (1 AP) is enough, and whether rank 5 Modifiers are open. Before the widget
 * this knowledge lived in a scene flag and surfaced only inside the Constructor —
 * a player at the table couldn't see what to count on.
 *
 * GM: left-click on a symbol raises the level (none → present → abundant → none),
 * Shift+left-click lowers it. A player sees the same symbols read-only.
 *
 * Layout: the element is inserted into #ui-left and positioned absolutely
 * (#ui-left has a transform, so it is also the containing block). Getting into the column's
 * flow is not allowed: #scene-controls measures its height in setPosition()
 * to lay its tools out in columns, and an extra flex sibling breaks the calculation.
 */
export default class MagicSourceHUD extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dedrel-source-hud",
    // No faded-ui: core dims such elements to opacity 0.4, while the widget must
    // read without hovering — dimming here carries the meaning "no Source".
    classes: ["dedrel", "dedrel-source-hud"],
    tag: "aside",
    window: {
      frame: false,
      positioned: false
    },
    actions: {
      cycle: MagicSourceHUD.#onCycle
    }
  };

  static PARTS = {
    main: {
      template: "systems/dedrel/templates/apps/source-hud.hbs"
    }
  };

  /**
   * Doctrine symbol markup, read from assets/icons/doctrines/<key>.svg.
   * Inline, not an <img> or a CSS mask: only an SVG embedded in the DOM supports
   * fill="currentColor", i.e. the state color is set by a single CSS rule.
   * The files are read once per client.
   * @type {Map<string, string>}
   */
  static #glyphs = new Map();

  /** A doctrine symbol's markup; an empty string if the file wasn't served. */
  static async #glyph(key) {
    if (MagicSourceHUD.#glyphs.has(key)) return MagicSourceHUD.#glyphs.get(key);
    const path = `systems/dedrel/assets/icons/doctrines/${key}.svg`;
    let markup = "";
    try {
      const response = await fetch(foundry.utils.getRoute(path));
      if (response.ok) markup = await response.text();
      else console.error(`Dedrel | Символ доктрины не найден: ${path}`);
    } catch (error) {
      console.error(`Dedrel | Не удалось загрузить символ доктрины «${key}»`, error);
    }
    MagicSourceHUD.#glyphs.set(key, markup);
    return markup;
  }

  /* ------------------------------------------------------------------ */
  /*  Rendering                                                             */
  /* ------------------------------------------------------------------ */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const config = CONFIG.DEDREL?.magic;
    const i18n = game.i18n;
    const scene = canvas?.scene ?? null;

    context.isGM = game.user.isGM;
    // No scene — an empty column: the widget collapses on its own, nothing to hide
    if (!scene) {
      context.doctrines = [];
      return context;
    }

    const hint = game.user.isGM ? i18n.localize("DEDREL.Magic.SourceHUD.CycleHint") : "";
    context.doctrines = await Promise.all(doctrinesWithSource().map(async key => {
      const scale = sceneSourceScale(key, scene);
      const name = i18n.localize(`DEDREL.Magic.Doctrines.${key}`);
      const state = i18n.localize(config.sourceScales[scale].label);
      return {
        key,
        scale,
        label: name,
        glyph: await MagicSourceHUD.#glyph(key),
        tooltip: [`<strong>${name}</strong>`, state, hint].filter(Boolean).join("<br>")
      };
    }));
    return context;
  }

  /**
   * Inserting into the left interface column instead of document.body.
   * Core looks for an element with the same id and replaces it — on re-render this
   * keeps the DOM position, so the existing branch stays first.
   * @override
   */
  async _insertElement(element, options = {}) {
    const existing = document.getElementById(element.id);
    if (existing) return existing.replaceWith(element);
    const left = document.getElementById("ui-left");
    (left ?? document.body).append(element);
  }

  /* ------------------------------------------------------------------ */
  /*  Actions                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Click on a doctrine symbol (GM only): the next Source level,
   * with Shift — the previous one. The write to the scene flag is broadcast to all clients
   * by the updateScene hook, no separate sync needed.
   */
  static async #onCycle(event, target) {
    if (!game.user.isGM) return;
    const scene = canvas?.scene;
    if (!scene) return;
    const key = target.dataset.doctrine;
    const next = nextSourceScale(sceneSourceScale(key, scene), event.shiftKey);
    await setSceneSourceScale(key, next, scene);
  }

  /* ------------------------------------------------------------------ */
  /*  Hooks                                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Redraw on scene change and on someone else's flag edit. updateScene is caught
   * only for the active scene and only when our flag specifically changed —
   * otherwise the widget twitches on every lighting shift.
   */
  activateHooks() {
    Hooks.on("canvasReady", () => this.render({ force: true }));
    Hooks.on("updateScene", (scene, changes) => {
      if (scene.id !== canvas?.scene?.id) return;
      if (foundry.utils.getProperty(changes, "flags.dedrel.sourceScale") === undefined) return;
      if (this.rendered) this.render();
    });
  }
}
