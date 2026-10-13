# Листы: ApplicationV2 и partials

Все листы системы построены на ApplicationV2 (`HandlebarsApplicationMixin` поверх
`ActorSheetV2` / `ItemSheetV2`). Старые листы V1 ядра отключены в `dedrel.mjs`.
Подводные камни этого фреймворка — [foundry-v14-quirks.md](foundry-v14-quirks.md) §1–§8:
их стоит прочитать до первой правки шаблона.

## Классы

| Класс | Файл | Для чего |
|---|---|---|
| `DedrelCharacterSheet` | `src/sheets/character-sheet.mjs` | персонаж (`character`): создание персонажа, опыт, экипировка, кошелёк, отдых |
| `DedrelNpcSheet` | `src/sheets/npc-sheet.mjs` | NPC и монстры (`npc`); **наследник** листа персонажа — подменяет часть `PARTS` и добавляет вкладку настроек |
| `DedrelLootSheet` | `src/sheets/loot-sheet.mjs` | лут, торговец, контейнер (`loot`) |
| `DedrelItemSheet` | `src/sheets/item-sheet.mjs` | один лист на все 21 тип предмета |

## Анатомия листа

Лист описывается статическими полями класса:

```javascript
static DEFAULT_OPTIONS = {
  classes: ["dedrel", "sheet", "actor", "character"],
  tag: "form",                                 // корень окна — <form>
  form: { submitOnChange: true, closeOnSubmit: false },
  actions: {                                   // data-action="useItem" → обработчик
    useItem: DedrelCharacterSheet.#onUseItem,
    rollCheck: DedrelCharacterSheet.#onRollCheck
  }
};

static PARTS = {                               // часть = один шаблон = один корневой элемент
  navigation: { template: "systems/dedrel/templates/actor/parts/character-navigation.hbs" },
  main:       { template: "systems/dedrel/templates/actor/parts/character-main.hbs" }
};

static TABS = {
  primary: {
    tabs: [{ id: "main", label: "DEDREL.ActorSheet.Tabs.Main" }],
    initial: "main",
    navSelector: ".tabs[data-group='primary']",
    contentSelector: ".sheet-body"
  }
};
```

- **Действия.** Кнопка в шаблоне объявляет `data-action="имя"`, ядро вызывает
  статический обработчик из `actions` с `this` = экземпляр листа и аргументами
  `(event, target)`. Слушатели кликов вручную не навешиваются.
- **Части.** Каждая часть `PARTS` рендерится отдельно и обязана иметь ровно один корневой
  HTML-элемент, причём не `<form>`: форма — сам корень окна (квирк §4).
- **Вкладки.** Часть-вкладка — это корневой `div` с классами вкладки:

  ```handlebars
  <div class="tab main {{tabs.main.cssClass}}" data-group="primary" data-tab="main">
  ```

  `tabs.<id>.cssClass` даёт `active` нужной вкладке, переключение — действие
  `changeTab` в навигации. Вкладки готовит `_prepareTabs("primary")` в `_prepareContext`.

## Контекст шаблона

`_prepareContext()` — оркестратор: он вызывает приватные хелперы `#prepare*` (предметы
по группам, слоты экипировки, данные создания персонажа, цены опыта, навыки, эффекты,
кошелёк, перегрузка) и складывает результат в `context`. Новую порцию данных для
шаблона добавляй отдельным хелпером, а не кодом внутри оркестратора.

Вкладки, которые нужны не всем типам, удаляются из контекста. Пример из листа предмета:
вкладка «Боеприпасы» есть только у дальнобойного оружия, «Крафт» — только у физических
предметов и только для ГМа:

```javascript
context.tabs = this._prepareTabs("primary");
if (!context.showAmmoTab) delete context.tabs.ammunition;
if (!context.showCrafting) delete context.tabs.crafting;
```

## Шаблоны и partials

| Каталог | Что внутри |
|---|---|
| `templates/actor/parts/` | части листов актора: `character-*.hbs`, `npc-*.hbs`, переиспользуемые блоки (`main-bottom.hbs`, `accessory-slot.hbs`) |
| `templates/item/parts/` | части листа предмета: `item-*.hbs` (шапка, навигация, вкладки) и `details-<тип>.hbs` (поля конкретного типа) |
| `templates/apps/` | окна и HUD (`src/apps/`) и диалог броска |

**Предзагрузка.** Каждый шаблон, который вставляется как partial (`{{> "systems/dedrel/…"}}`),
должен быть в списке `loadTemplates` в `dedrel.mjs` — иначе Handlebars его не найдёт.

**Лист предмета — диспетчер по типу.** Один `DedrelItemSheet` обслуживает все типы
предметов за счёт части `details` (`item-details.hbs`): она показывает общий блок
системного ключа, общие блоки по признакам (`isPhysical` → `details-physical.hbs`,
`hasEquipSlot` → `details-equip-slot.hbs`) и затем ветку `{{#if (eq item.type "…")}}`
с partial'ом конкретного типа. Новый тип предмета = новый `details-<тип>.hbs` + ветка
в диспетчере (полный рецепт — [adding-item-type.md](adding-item-type.md)).

**NPC переиспользует лист персонажа.** `DedrelNpcSheet` наследует логику и действия
и подменяет только часть шаблонов (`npc-main.hbs`, `npc-inventory.hbs`, `npc-config.hbs`);
остальные вкладки (манёвры, заклинания, мутации, таланты, статусы) общие.

## Жизненный цикл рендера

- **Скролл.** ApplicationV2 перерисовывает часть целиком, и прокрутка сбрасывается.
  Листы запоминают `scrollTop` активной вкладки в `_preRender` и восстанавливают
  его в `_onRender` (квирк §5).
- **DOM-слушатели**, которые не выражаются `actions` (начало перетаскивания, подсветка
  слотов под курсором), навешиваются в `_onRender` нативным DOM API. jQuery в V14 нет
  (квирк §8).
- **Перетаскивание.** `_onDrop` листа персонажа решает, куда упал предмет: в слот
  экипировки, в контейнер или в инвентарь (`_onDropItemCreate`).

## Формы и сохранение

- `submitOnChange: true`: любое изменение поля с атрибутом `name` сразу сохраняет документ.
- **Один `name` — один инпут.** Два поля с одинаковым `name` превращают значение
  в массив, и валидация роняет сохранение всей формы, а не одного поля. Симптом —
  «не сохраняется ничего на вкладке».
- **Массивы через форму не передаются.** `FormDataExtended` ненадёжно собирает массивы
  (квирк §7). Два принятых обхода:
  - строковые списки (требования, `adds_items`, ключи оружия) вводятся одной строкой через
    `;` и разбираются в `_prepareSubmitData` листа предмета;
  - сложные массивы (ингредиенты крафта) рисуются инпутами **без** `name`, и их слушатель
    обновляет массив целиком через `document.update()`.
- **Группы чекбоксов** — `SchemaField` из `BooleanField` в схеме данных, а не `ArrayField`.

## Стили

Один файл `css/dedrel.css`, селекторы начинаются с `.dedrel`. Встроенные классы ядра
`flexcol` / `flexrow` в листах не используются — они ломают раскладку вкладок (квирк §1).
Все строки интерфейса берутся из `lang/ru.json` / `lang/en.json` через
`{{localize "DEDREL.…"}}` в шаблоне или `game.i18n.localize()` в коде.

## Как добавить вкладку

1. Шаблон части в `templates/actor/parts/` с корнем `<div class="tab <id> {{tabs.<id>.cssClass}}" data-group="primary" data-tab="<id>">`.
2. Запись в `PARTS` и в `TABS.primary.tabs` (у NPC — и в его собственных `PARTS`/`TABS`, если вкладка нужна и там).
3. Подпись вкладки — ключ в оба файла `lang/`.
4. Данные для шаблона — новым хелпером `#prepare…` в `_prepareContext`.
5. Если шаблон вставляется как partial — путь в `loadTemplates`.
