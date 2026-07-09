#!/usr/bin/env python3
"""Генератор SVG-баннеров для компендиумов Dedrel.

Каждый пак в сайдбаре Foundry по умолчанию показывает одинаковый баннер типа
документа (ui/banners/item-banner.webp) и одинаковую иконку типа Item — из-за
этого все паки-предметы визуально сливаются. Скрипт собирает уникальный широкий
баннер (viewBox 320x70, под object-fit: cover высотой 70px) для каждого пака:
акцентный градиент + иконка-водяной знак, переиспользуя готовые game-icons из
assets/icons/.

Пути в манифесте: systems/dedrel/assets/banners/<pack>.svg

Запуск:  python3 scripts/generate_pack_banners.py
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, "assets", "icons")
OUT = os.path.join(ROOT, "assets", "banners")

# pack_name -> (базовый цвет HEX, путь к иконке относительно assets/icons/)
PACKS = {
    "mutations":            ("#7c3aed", "items/mutation.svg"),
    "conditions":           ("#b91c1c", "conditions/magic-shield.svg"),
    "additional_conditions":("#9a3412", "conditions/enrage.svg"),
    "talents":              ("#2563eb", "items/talent.svg"),
    "maneuvers":            ("#b45309", "items/maneuver.svg"),
    "weapons":              ("#64748b", "items/weapon.svg"),
    "armors":               ("#78716c", "items/armor.svg"),
    "magic_items":          ("#7e22ce", "items/magic_item.svg"),
    "loot":                 ("#a16207", "items/loot.svg"),
    "trade_goods":          ("#0f766e", "items/trade_good.svg"),
    "currencies":           ("#ca8a04", "items/currency.svg"),
    "mutilations":          ("#7f1d1d", "items/mutilation.svg"),
    "countriesoforigin":    ("#15803d", "skills/cultural_awareness.svg"),
    "spells":               ("#0369a1", "items/spell.svg"),
    "ammunition":           ("#57534e", "skills/bows.svg"),
    "experience":           ("#c2410c", "skills/knowledge.svg"),
    "creature_types":       ("#166534", "conditions/skeleton-inside.svg"),
    "active_effects":       ("#6d28d9", "skills/magical_attacks.svg"),
    "macro":                ("#334155", "skills/gears.svg"),
    # новые паки
    "potions":              ("#16a34a", "items/potion.svg"),
    "scrolls":              ("#a8651b", "items/scroll.svg"),
    "craft_materials":      ("#92400e", "items/crafting_material.svg"),
    "actors":               ("#1d4ed8", "skills/atletism.svg"),
}


def darker(hex_color, factor=0.5):
    """Затемнить HEX-цвет для второго стопа градиента."""
    r = int(hex_color[1:3], 16)
    g = int(hex_color[3:5], 16)
    b = int(hex_color[5:7], 16)
    r, g, b = (int(c * factor) for c in (r, g, b))
    return f"#{r:02x}{g:02x}{b:02x}"


def extract_inner(svg_path):
    """Вернуть внутреннее содержимое исходного SVG (без корневого <svg>),
    перекрасив белую заливку game-icons в белый водяной знак."""
    with open(svg_path, "r", encoding="utf-8") as f:
        text = f.read()
    # выкинуть XML-пролог, если есть
    text = re.sub(r"<\?xml.*?\?>", "", text, flags=re.DOTALL)
    # содержимое между открывающим и закрывающим <svg>
    inner = re.sub(r"^.*?<svg[^>]*>", "", text, flags=re.DOTALL)
    inner = re.sub(r"</svg>\s*$", "", inner, flags=re.DOTALL).strip()
    # нормализовать заливку к чистому белому (водяной знак задаёт opacity группы)
    inner = inner.replace('fill="#fff"', 'fill="#ffffff"')
    inner = inner.replace('fill="#FFF"', 'fill="#ffffff"')
    return inner


def build_banner(color, icon_rel):
    dark = darker(color, 0.45)
    icon_inner = extract_inner(os.path.join(ICONS, icon_rel))
    # иконка 512x512 -> масштаб 0.19 (~97px), сдвинута вправо как водяной знак
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 70" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{color}"/>
      <stop offset="1" stop-color="{dark}"/>
    </linearGradient>
  </defs>
  <rect width="320" height="70" fill="url(#g)"/>
  <g transform="translate(232 -14) scale(0.19)" opacity="0.20">
    {icon_inner}
  </g>
  <rect x="0" y="0" width="5" height="70" fill="{color}" opacity="0.9"/>
  <rect x="0" y="0" width="320" height="70" fill="#000000" opacity="0.12"/>
</svg>
'''


def main():
    os.makedirs(OUT, exist_ok=True)
    for pack, (color, icon_rel) in PACKS.items():
        icon_path = os.path.join(ICONS, icon_rel)
        if not os.path.exists(icon_path):
            print(f"  ! ПРОПУСК {pack}: нет иконки {icon_rel}")
            continue
        svg = build_banner(color, icon_rel)
        with open(os.path.join(OUT, f"{pack}.svg"), "w", encoding="utf-8") as f:
            f.write(svg)
        print(f"  ok {pack}.svg  ({color}, {icon_rel})")
    print(f"\nГотово. Баннеры в: {OUT}")


if __name__ == "__main__":
    main()
