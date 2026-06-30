/**
 * Кастомный класс Токена для отрисовки дополнительных баров (ОД)
 */
export default class DedrelToken extends foundry.canvas.placeables.Token {
  /** @override */
  async _draw(options) {
    await super._draw(options);
    
    // Создаем контейнер для аур под токеном
    this.controlAura = this.addChildAt(new PIXI.Graphics(), 0);
  }

  /** @override */
  _refreshState() {
    super._refreshState();
    this._refreshAuras();
  }

  _refreshAuras() {
    if (!this.controlAura) return;
    this.controlAura.clear();
    
    // Проверка: в бою ли мы, и наведен ли курсор
    const inCombat = game.combat?.active || game.combat?.started;
    const isHovered = this.hover || this.layer.highlightObjects;
    
    if (!inCombat || !isHovered || !this.actor) {
      this.controlAura.visible = false;
      return;
    }

    // Ищем максимальную зону контроля оружия
    let maxZone = 0;
    const weapons = this.actor.items.filter(i => 
      i.type === "weapon" && 
      i.system.equipped && 
      i.system.weapon_type?.melee
    );
    for (const w of weapons) {
      if (w.system.control_zone > maxZone) {
        maxZone = w.system.control_zone;
      }
    }

    if (maxZone <= 0) {
      this.controlAura.visible = false;
      return;
    }

    this.controlAura.visible = true;
    
    // Отрисовка ауры
    const gridSize = canvas.grid.size;
    const {width, height} = this.document.getSize();
    
    const cx = width / 2;
    const cy = height / 2;
    const radiusX = cx + (maxZone * gridSize);
    const radiusY = cy + (maxZone * gridSize);

    const s = canvas.dimensions.uiScale;
    this.controlAura.lineStyle(2 * s, 0xff0000, 0.8);
    this.controlAura.beginFill(0xff0000, 0.15);
    
    if (width === height) {
      this.controlAura.drawCircle(cx, cy, radiusX);
    } else {
      this.controlAura.drawEllipse(cx, cy, radiusX, radiusY);
    }
    this.controlAura.endFill();
  }

  /** @override */
  drawBars() {
    // Сначала отрисовываем стандартные бары (HP и т.д.)
    super.drawBars();

    if ( !this.actor || (this.document.displayBars === CONST.TOKEN_DISPLAY_MODES.NONE) ) return;
    
    // Скрываем бары, если режим отображения этого не позволяет
    if (!this._canViewMode(this.document.displayBars)) {
      if (this.bars.apUni) this.bars.apUni.visible = false;
      if (this.bars.apMan) this.bars.apMan.visible = false;
      if (this.bars.apMag) this.bars.apMag.visible = false;
      return;
    }

    const res = this.actor.system.resources;
    if (!res) return;

    // Создаем графические объекты, если их еще нет
    if (!this.bars.apUni) this.bars.apUni = this.bars.addChild(new PIXI.Graphics());
    if (!this.bars.apMan) this.bars.apMan = this.bars.addChild(new PIXI.Graphics());
    if (!this.bars.apMag) this.bars.apMag = this.bars.addChild(new PIXI.Graphics());

    // Индексы для позиционирования (один над другим)
    let apIndex = 0;

    // Отрисовка баров (Универсальные ОД - Moccasin)
    if (res.ap_universal && res.ap_universal.max > 0) {
      this._drawApBar(this.bars.apUni, res.ap_universal, 0xFFE4B5, apIndex++);
    } else {
      this.bars.apUni.visible = false;
    }

    // ОД Манёвров - Gold
    if (res.ap_maneuver && res.ap_maneuver.max > 0) {
      this._drawApBar(this.bars.apMan, res.ap_maneuver, 0xFFD700, apIndex++);
    } else {
      this.bars.apMan.visible = false;
    }

    // ОД Магии - Indigo
    if (res.ap_magic && res.ap_magic.max > 0) {
      this._drawApBar(this.bars.apMag, res.ap_magic, 0x4B0082, apIndex++);
    } else {
      this.bars.apMag.visible = false;
    }
  }

  _drawApBar(bar, data, colorHex, index) {
    bar.visible = true;
    const val = Number(data.value);
    const pct = Math.clamp(val, 0, data.max) / data.max;

    const {width, height} = this.document.getSize();
    const s = canvas.dimensions.uiScale;
    const bw = width;
    const bh = 5 * s; // Делаем полоски ОД тонкими

    bar.clear();
    bar.lineStyle(s, 0x000000, 1.0);
    bar.beginFill(0x000000, 0.5).drawRoundedRect(0, 0, bw, bh, 2 * s);
    bar.beginFill(colorHex, 1.0).drawRoundedRect(0, 0, pct * bw, bh, 1 * s);

    // Размещаем над токеном (над именем/баром)
    // -bh отступает вверх на высоту бара
    // дополнительный сдвиг -4s * index
    // и еще -2s, чтобы не наезжало на саму рамку
    const posY = -bh - (index * (bh + 2 * s)) - (2 * s);
    bar.position.set(0, posY);
  }
}
