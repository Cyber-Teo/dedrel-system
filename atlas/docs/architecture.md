# Архитектура атласа

Одностраничное приложение на Preact + MapLibre GL (Vite). Данные лежат в `data/*.yaml`, на сборке превращаются в
`dist/data/*.json` (`scripts/build/data-json.ts`). Серверная часть одна: `api/master.ts` (режим мастера, Vercel).
Карта рисуется в пикселях растра (7920×5960), `src/geo/pixel.ts` переводит их в lng/lat Web-Mercator.

## Карта src/

| Путь | Что там |
|---|---|
| `main.tsx` | точка входа: создаёт карту, подключает слои, хронологию, поиск и панели |
| `hash.ts` | состояние в адресе: год `y`, слои `l`, камера `cx`/`cy`/`z`, открытое досье `d` |
| `events.ts`, `dedupe.ts` | загрузка хроники и страховочная склейка дублей |
| `data/` | `schema.ts` (zod-схемы наборов), `load.ts` (мемоизированная загрузка JSON), `load.node.ts` (то же для Node: тесты, validate) |
| `geo/` | `pixel.ts` (пиксели ↔ lng/lat), `cells.ts` (ячейки владений) |
| `layers/` | реестр тематических слоёв, их сборка из данных и рисование на карте, панель слоёв, миникарточки |
| `history/` | государства по годам: владельцы ячеек, ландшафт эпох, гербы, Гант |
| `timeline/` | временная линия: эпохи, линейка событий, Play |
| `search/` | единый индекс (места, люди, организации, государства, события), карточки досье |
| `route/` | маршруты по дорогам, рекам и морю, линейка, площадь |
| `scenarios/` | сценарии (пошаговые экскурсии), деньги, небо, экспорт PNG |
| `presets/` | пресеты видов: слои + год + подложка |
| `graph/` | окно «Связи», схема Иллиора, врезка Солнечных островов |
| `master.ts`, `MasterUI.tsx` | режим мастера: вход по паролю, секретные события |
| `ui/` | общие компоненты: стек оверлеев и Esc, группы инструментов, панели, подсказки |
| `dossier.ts` | стек карточек правой панели (контракт ниже) |
| `styles/fonts.css` | `@font-face` для шрифтов из `public/fonts` |

## Контракт досье (`dossier.ts`)

Правая панель «досье» — стек карточек в слоте `#dossier`.

- `useDossier(name, open, close, key?, opts?)` — владелец карточки. Новая карточка не стирает прежнюю.
  Если у прежней есть `opts.collapse`, она сворачивается (`collapse(true)`): компонент прячет карточку, но не сбрасывает
  состояние; в `#tool-bar` появляется плашка `opts.label()` («Маршрут: 12 км · 3 сут ⤢»), клик по плашке или «‹ Назад»
  разворачивает её (`collapse(false)`). Иначе прежняя закрывается (`close()`).
- `opts = { collapse?: (c: boolean) => void; label?: () => string }`. Свёрнутая карточка должна оставаться в DOM с атрибутом `hidden`.
- Закрытие верхней карточки разворачивает свёрнутую под ней.
- Слои скрыты, пока открыта карточка (`body.dossier-open`); в панели кнопка «‹ К слоям» / «‹ Назад».
- Фокус: при появлении карточки уходит на её заголовок, при закрытии возвращается на открывшую кнопку.
- `closeTopDossier()` — закрыть верхнюю карточку (для Esc и кнопки «Назад»).

## Стек оверлеев и Esc (`ui/overlayStack.ts`)

Esc закрывает по порядку: окно (Гант, Связи, Схема) → карточка → активный инструмент → врезка → меню и слои.

## Группы инструментов (`ui/toolGroup.ts`)

Колонка инструментов размечена в `index.html` (`#tg-*`). Компоненты переносят свои кнопки в группу через
`createPortal(<ToolBtn …/>, toolGroup('measure'))`.

## Сборка и пути

`base: './'` в `vite.config.ts`: сборка не привязана к корню домена, её можно раздавать из подпути
(`systems/dedrel/atlas/dist` в Foundry). Пути к `data/*.json`, шрифтам, значкам и тайлам строятся от `import.meta.env.BASE_URL`.
`index.html` не содержит абсолютных `/fonts` и `/data`; `<link rel="preload">` для всех наборов данных добавляет плагин `dedrel-data-json`.

## Мастер-режим (`api/master.ts`)

`POST {password}` ставит cookie-сессию, `GET` отдаёт мастер-JSON только с валидной cookie, `DELETE` завершает сессию.
Мастер-данные (`data/master/*.yaml`) собираются в `api/_data/master.json` (`scripts/build/build-master.ts`) и в публичный
бандл не попадают. Сборка для Foundry с `VITE_MASTER=off` режим мастера отключает.

Известное ограничение: счётчик попыток входа (лимитер) хранится в памяти экземпляра. Serverless может держать несколько
экземпляров, поэтому лимит приблизительный; от перебора он защищает только в среднем, не гарантированно.

## События между частями интерфейса

Один механизм — `src/lib/bus.ts`: `emit(имя, detail)` / `on(имя, обработчик)`; в DOM событие называется `atlas:<имя>`. Новое событие — строка в типе `Events` (имя и detail описаны там же, контракт проверяет tsc). Напрямую `dispatchEvent` для своих событий не используется (исключение — нативный `hashchange` после записи хеша).

| Событие | Шлёт | Слушает |
| --- | --- | --- |
| `year` | `hooks/useHashSync` | `layers/placeModels` |
| `dossier` | слои, граф, карточки | `search/ui` |
| `layers` | `presets` | `layers/LayersUI` |
| `evtypes` | `layers/eventsMap` | `layers/eventsMap`, `layers/LayersUI` |
| `history` | сценарии, пресеты, `LayersUI` | `history/ui` |
| `history-state` | `history/ui` | `LayersUI`, `timeline/TimelineTop` |
| `politics-on` | `search/ui` | `history/ui` |
| `toast` | любой модуль | `ui/toast` |
| `overlay`, `overlay-open` | окна без импорта стека / `ui/overlayStack` | `ui/overlayStack` / `ui/toast` |
| `route-to` | `search/cards` | `route/RouteTool` |
| `open-scenario` | `search/EventCard` | `scenarios/ScenariosUI` |
| `flyto` | `LayersUI`, `search/EventCard` | `search/ui` |
| `graph-focus` | `search/cards` | `graph/GraphTools` (открывает окно «Связи» с выбранным узлом) |
| `help`, `welcome`, `tools-close` | `Help`, `App`, `shell/toolRail` | `Help`, `Onboarding`, `hooks/useShellPanels` |
