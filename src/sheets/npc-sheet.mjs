const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Лист актёра «NPC / Монстр» (тип npc). Функциональный минимум (дизайн —
 * вторично): переключатель тира (peon/boss), боевые статы, единый пул ОД,
 * здоровье (хиты у пеона / HP у босса), DR, навыки и панель способностей
 * (обычные Item'ы — манёвры/заклинания/таланты/мутации — с кнопкой «Использовать»).
 *
 * Добавление способностей/экипировки — перетаскиванием на лист (обрабатывает
 * базовый ActorSheetV2._onDrop). Активация предмета — через item.use(), как у
 * персонажа, поэтому существующий контент работает без пересоздания.
 */
export default class DedrelNpcSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["dedrel", "sheet", "actor", "npc"],
    tag: "form",
    window: { resizable: true, controls: [] },
    position: { width: 620, height: 720 },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      editImage: DedrelNpcSheet.#onEditImage,
      useItem: DedrelNpcSheet.#onUseItem,
      editItem: DedrelNpcSheet.#onEditItem,
      deleteItem: DedrelNpcSheet.#onDeleteItem
    }
  };

  static PARTS = {
    body: { template: "systems/dedrel/templates/actor/npc-sheet.hbs" }
  };

  get title() { return this.document.name; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const sys = actor.system;

    // ВАЖНО: редактируемые «базовые» инпуты берут значение из _source (не из
    // производного sys), иначе submit «запекает» вклад эффектов/талантов/брони
    // в источник. Производные значения показываем отдельно (read-only / подсказкой).
    const src = actor._source.system;

    // Атрибуты — ранг из source (эффекты могут баффать атрибут).
    const attributes = Object.keys(sys.attributes).map(key => ({
      key, label: `DEDREL.Attributes.${key}`,
      rank: src.attributes[key].rank
    }));

    // Способности и экипировка группами. Активируемые — через useItem.
    const groups = { ability: [], weapon: [], armor: [], other: [] };
    const creatureTypes = [];
    const ABIL = new Set(["maneuver", "spell", "talent", "mutation", "condition", "magic_item"]);
    for (const i of actor.items) {
      if (i.type === "creature_type") {
        const label = i.system.key ? game.i18n.localize(`DEDREL.CreatureTypes.${i.system.key}`) : "";
        creatureTypes.push({ id: i.id, name: i.name, key: i.system.key, label });
        continue;
      }
      const row = { id: i.id, name: i.name, img: i.img, type: i.type, apCost: i.system?.ap_cost ?? null };
      if (ABIL.has(i.type)) groups.ability.push(row);
      else if (i.type === "weapon") groups.weapon.push(row);
      else if (i.type === "armor") groups.armor.push(row);
      else groups.other.push(row);
    }

    // Доктрины магии — ранг/доступ из source (таланты дают +1 через AE).
    const doctrines = Object.keys(sys.doctrines).map(key => ({
      key, label: `DEDREL.Magic.Doctrines.${key}`,
      rank: src.doctrines[key].rank,
      unlocked: src.doctrines[key].unlocked
    }));

    // Техники — из source (выдаются талантами через AE).
    const srcTechniques = Object.keys(sys.magic.techniques).map(key => ({
      key, label: `DEDREL.Magic.Techniques.${key}`,
      value: src.magic.techniques[key]
    }));

    Object.assign(context, {
      actor, system: sys,
      editable: this.isEditable,
      isPeon: sys.tier === "peon",
      isBoss: sys.tier === "boss",
      tierOptions: {
        peon: game.i18n.localize("DEDREL.Npc.TierPeon"),
        boss: game.i18n.localize("DEDREL.Npc.TierBoss")
      },
      attributes, groups, doctrines, srcTechniques, creatureTypes,
      // DR — производное поле (база + броня + эффекты). Инпуты правят base из
      // _source, эффективный DR показываем подсказкой.
      srcDr: src.dr,
      effDr: sys.dr
    });
    return context;
  }

  // ==== Actions ====
  static async #onEditImage(event, target) {
    const fp = new foundry.applications.apps.FilePicker.implementation({
      type: "image", current: this.document.img,
      callback: path => this.document.update({ img: path })
    });
    return fp.browse();
  }

  static async #onUseItem(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (item) return item.use();
  }
  static async #onEditItem(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (item) item.sheet.render(true);
  }
  static async #onDeleteItem(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (item) item.deleteDialog();
  }
}
