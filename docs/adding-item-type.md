# Как добавить новый тип предмета

Рецепт на примере простого типа `quest_item` (квестовый предмет): физический предмет
без активного использования. Фрагменты кода ниже взяты из репозитория, комментарии добавлены для пояснения. Сложный тип с механикой (манёвр, заклинание) проходит
те же шаги плюс пункты из §4. В конце (§5) — общий чеклист разработки для любой
новой сущности или функции.

## 1. Модель данных

Файл `src/data/items/<тип>.mjs`, класс-наследник `TypeDataModel`:

```javascript
import { physicalItemFields } from "./_physical.mjs";
import { craftingFields, migrateCraftingData } from "./_crafting.mjs";

export default class QuestItemDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { HTMLField, StringField, NumberField, BooleanField } = foundry.data.fields;
    return {
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      key: new StringField({ required: false, initial: "" }),   // system.key — латиница, snake_case
      ...physicalItemFields(),                                   // редкость, вес, базовая цена
      ...craftingFields(),                                       // блок крафта
      quantity: new NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      stackable: new BooleanField({ required: true, initial: false }),
      // Поля самого типа
      quest_id: new StringField({ required: false, initial: "" }),
      can_be_sold: new BooleanField({ required: true, initial: false }),
      can_be_dropped: new BooleanField({ required: true, initial: false })
    };
  }

  static migrateData(source) {
    migrateCraftingData(source);
    return super.migrateData(source);
  }
}
```

Правила схем (подробнее — [data-schema.md](data-schema.md), шапка):
- `description` и `key` есть у всех типов: по `system.key` предмет ищут код, макросы
  и `adds_items`.
- Массив примитивов — только `ArrayField(StringField())`, иначе пустой массив
  превратится в `{}`.
- Группа чекбоксов — `SchemaField` из `BooleanField`, не массив.
- Переименовал или убрал поле — перенеси старые данные в `static migrateData(source)`.
  После удаления поля из схемы его уже не видно ни в `system`, ни в выгрузке `toObject()`
  ([foundry-v14-quirks.md](foundry-v14-quirks.md) §19).
- `quantity` и `stackable` в общий набор полей не входят: у разных типов разные значения по умолчанию.

## 2. Регистрация

| Где | Что добавить |
|---|---|
| `src/data/items/index.mjs` | импорт модели и строку `quest_item: QuestItemDataModel` в `ItemDataModels` |
| `system.json` | `documentTypes.Item.quest_item: {}` — без этого тип не существует для ядра |
| `dedrel.mjs`, `registerSheet(Item, …)` | ключ типа в массив `types`, иначе для него откроется пустой лист |
| `dedrel.mjs`, хук `preCreateItem` | иконку по умолчанию в `defaultIcons` |
| `assets/icons/items/quest_item.svg` | файл иконки — его же показывает сетка выбора типа в окне создания предмета |
| `lang/ru.json`, `lang/en.json` | `TYPES.Item.quest_item` — название типа в интерфейсе ядра |

## 3. Лист предмета

1. Шаблон полей типа `templates/item/parts/details-quest_item.hbs`.
2. Ветка в диспетчере `templates/item/parts/item-details.hbs`:
   ```handlebars
   {{else if (eq item.type "quest_item")}}
       {{> "systems/dedrel/templates/item/parts/details-quest_item.hbs"}}
   ```
3. Путь к шаблону — в список `loadTemplates` в `dedrel.mjs`.
4. Физический тип (редкость, вес, цена, перегрузка, крафт) — ключ в
   `PHYSICAL_ITEM_TYPES` в `src/sheets/item-sheet.mjs`: лист покажет общий блок
   `details-physical.hbs`.
5. Подписи полей — ключи в оба файла `lang/` (у квестового предмета — `DEDREL.ItemSheet.QuestId`,
   `DEDREL.ItemSheet.CanBeSold`, `DEDREL.ItemSheet.CanBeDropped`).

Как устроены части листа и почему один лист обслуживает все типы — [sheets.md](sheets.md).

## 4. Поведение

Простой тип на этом готов: на листе персонажа предмет неизвестного листу типа
попадает в общий инвентарь, а клик по нему публикует карточку в чат. Дальше — только
если у типа есть своя механика:

| Нужно | Где |
|---|---|
| Активное использование (цена, диалог, траты) | список типов в начале `DedrelItem#use()` и при необходимости условие раннего выхода для пассивов (`src/documents/item.mjs`); поток — [use-and-roll-flow.md](use-and-roll-flow.md) |
| Своя секция или вкладка на листе персонажа | `#prepareItems` в `src/sheets/character-sheet.mjs` + шаблон вкладки |
| Светильник (переключение света токена) | список типов в `#toggleLightEffects` (`item.mjs`) |
| Эффекты действуют, только пока предмет надет | правила гейта в `DedrelActor#itemEffectsActive` (`src/documents/actor.mjs`) |
| Компендиум типа | запись в `system.json → packs`; перевод содержимого — `translations/en/<пак>.json` и имя пака в `flags.dedrel.translations.en` |
| Механика данными, без кода | Active Effects на предмете: ключи — [effect-keys.md](effect-keys.md), рецепты — [system-macros.md](system-macros.md) |

## 5. Чеклист разработки

Для любой новой сущности, типа или функции — перед тем как считать работу законченной.

**Данные**
- [ ] Схема описана в [data-schema.md](data-schema.md) (код — источник истины, документ — его пересказ).
- [ ] Поля строгие (`NumberField`, `HTMLField`…), массивы и чекбоксы — по правилам из §1.
- [ ] Старые данные мигрируются в `migrateData`; если меняется мир целиком — `src/migration.mjs`.

**Регистрация и шаблоны**
- [ ] Тип есть в `system.json`, в индексе моделей и в `registerSheet`.
- [ ] Все новые `.hbs`, вставляемые как partial, — в `loadTemplates`.
- [ ] У каждой части `PARTS` один корневой элемент, не `<form>`.

**Локализация**
- [ ] Ни одной захардкоженной строки интерфейса: уведомления, заголовки и кнопки идут
  через `game.i18n.localize()` / `game.i18n.format()` или `{{localize}}`.
- [ ] Ключи добавлены в **оба** файла — `lang/ru.json` и `lang/en.json`.
- [ ] Новое содержимое компендиума переведено в `translations/en/`.

**API V14** ([foundry-v14-quirks.md](foundry-v14-quirks.md))
- [ ] Нет jQuery (`$()`), только нативный DOM.
- [ ] `DialogV2.confirm()` / `DialogV2.wait()` вместо `Dialog.*`.
- [ ] `await roll.evaluate()` — синхронного броска нет.
- [ ] Change-строки эффектов — в `system.changes`, со строковым `type` (`add`, `override`…), а не числовым `mode`.
- [ ] Сущности ищутся по `system.key`, а не по `name`.
- [ ] Фиксированные `_id` документов — ровно 16 букв и цифр.
- [ ] Отладочный `console.log` удалён.

**Оформление**
- [ ] Классы `flexcol` / `flexrow` в листах не используются.
- [ ] Модули — `.mjs`; константы и словари — в `src/constants.mjs`, а не внутри хуков.
- [ ] Комментарии объясняют «почему», а не «что», без эмодзи; устаревшие удалены вместе с кодом.

**Ассеты**
- [ ] Новая иконка с game-icons.net — с автором в `assets/ICON_CREDITS.md` (лицензия CC BY 3.0 требует атрибуции).

**Проверка**
- [ ] Мир перезагружен, тип создаётся, лист открывается, поля сохраняются.
- [ ] Консоль браузера без ошибок и предупреждений системы.
- [ ] После правок `src/config/magic.mjs` — макрос «Валидация магии» из компендиума `macro` зелёный.
