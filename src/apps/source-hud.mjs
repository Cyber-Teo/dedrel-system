import {
  doctrinesWithSource,
  sceneSourceScale,
  setSceneSourceScale,
  nextSourceScale
} from "../utils/magic-source.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Виджет «Источники сцены»: полоса алхимических символов в левой колонке
 * интерфейса, видимая всем и всегда.
 *
 * Зачем: Масштаб Источника решает, нужна ли магу техника «Создать» (2 ОД) или
 * хватит «Направить» (1 ОД), и открыты ли Модификаторы 5-го ранга. До виджета
 * это знание жило во флаге сцены и всплывало только внутри Конструктора —
 * игрок за столом не видел, на что рассчитывать.
 *
 * ГМ: ЛКМ по символу поднимает уровень (нет → есть → изобильный → нет),
 * Shift+ЛКМ опускает. Игрок видит те же символы только на чтение.
 *
 * Вёрстка: элемент вставляется в #ui-left и позиционируется абсолютно
 * (у #ui-left есть transform, поэтому он же — containing block). В поток
 * колонки лезть нельзя: #scene-controls меряет свою высоту в setPosition(),
 * чтобы разложить инструменты по столбцам, и лишний flex-сосед ломает расчёт.
 */
export default class MagicSourceHUD extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dedrel-source-hud",
    // Без faded-ui: ядро гасит такие элементы до opacity 0.4, а виджет должен
    // читаться без наведения — приглушение здесь несёт смысл «нет Источника».
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
   * Разметка символов доктрин, вычитанная из assets/icons/doctrines/<ключ>.svg.
   * Инлайн, а не <img> и не CSS-маска: только у встроенного в DOM SVG работает
   * fill="currentColor", то есть цвет состояния задаётся одним правилом CSS.
   * Файлы читаются один раз на клиента.
   * @type {Map<string, string>}
   */
  static #glyphs = new Map();

  /** Разметка символа доктрины; пустая строка, если файл не отдался. */
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
  /*  Рендер                                                             */
  /* ------------------------------------------------------------------ */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const config = CONFIG.DEDREL?.magic;
    const i18n = game.i18n;
    const scene = canvas?.scene ?? null;

    context.isGM = game.user.isGM;
    // Нет сцены — пустая колонка: виджет схлопывается сам, прятать нечего
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
   * Вставка в левую колонку интерфейса вместо document.body.
   * Ядро ищет элемент с тем же id и заменяет его — при ре-рендере это
   * сохраняет позицию в DOM, поэтому ветку existing оставляем первой.
   * @override
   */
  async _insertElement(element, options = {}) {
    const existing = document.getElementById(element.id);
    if (existing) return existing.replaceWith(element);
    const left = document.getElementById("ui-left");
    (left ?? document.body).append(element);
  }

  /* ------------------------------------------------------------------ */
  /*  Действия                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Клик по символу доктрины (только ГМ): следующий уровень Источника,
   * с Shift — предыдущий. Запись во флаг сцены разошлётся всем клиентам
   * хуком updateScene, отдельная синхронизация не нужна.
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
  /*  Хуки                                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Перерисовка по смене сцены и по чужой правке флага. updateScene ловим
   * только для активной сцены и только когда менялся именно наш флаг —
   * иначе виджет дёргается на каждом сдвиге освещения.
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
