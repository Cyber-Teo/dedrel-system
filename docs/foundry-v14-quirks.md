# Особенности и "подводные камни" Foundry VTT V14 (и новее)

В этом файле мы собираем все технические особенности, баги и специфическое поведение движка Foundry VTT последней версии, с которыми мы столкнулись в процессе разработки системы Dedrel, чтобы избежать повторения ошибок.

## 1. Токсичные CSS классы: `flexcol` и `flexrow`
В Foundry VTT встроены вспомогательные классы `.flexcol` и `.flexrow`, которые часто используются в базовых шаблонах. 
Однако, начиная с последних версий, класс `.flexcol` содержит крайне агрессивное глобальное правило:
```css
.flexcol > * {
    flex: 1;
}
```
**Проблема:** Это правило принудительно заставляет **все прямые дочерние элементы** растягиваться и делиться высотой строго поровну. Из-за этого ломаются любые кастомные размеры (например, `flex: 0 0 150px` для текстового поля) — Foundry просто переопределяет их, и верстка разъезжается, образуя гигантские пустые пространства.

**Решение:** 
**НИКОГДА** не используйте классы `flexcol` и `flexrow` для построения сложного, кастомного интерфейса (например, чаршита). 
Вместо этого задавайте эти свойства вручную в CSS-файле вашей системы:
```css
.my-custom-column {
    display: flex;
    flex-direction: column;
}
```
Это позволит вам иметь полный контроль над поведением `flex-grow` и `flex-shrink` дочерних элементов.

## 2. Поведение Вкладок (Tabs) и скроллинг
Встроенный в Foundry класс `Tabs` управляет переключением вкладок (например, Основное, Инвентарь и т.д.), прописывая активной вкладке `style="display: block"`.

**Проблема:** Если контент вкладки длинный (например, список навыков), он выталкивает границы контейнера за пределы видимого окна, игнорируя попытки добавить `overflow-y: auto`.

**Решение:**
Чтобы вкладки работали как полноценное "окно" внутри окна (со своим независимым скроллом), нужно привязывать тело вкладок абсолютно:
```css
.sheet-body {
  position: relative;
  flex: 1;
  overflow: hidden;
}

.tab {
  position: absolute;
  top: 10px;
  bottom: 10px;
  left: 10px;
  right: 10px;
  overflow: hidden; /* или auto, если скроллится вся вкладка целиком */
}
```
А всем внутренним `flex`-контейнерам, где ожидается скроллинг дочерних элементов, обязательно добавлять магическое правило **`min-height: 0;`**, чтобы они могли корректно "ужиматься" под размер окна.

## 3. Встроенный редактор (ProseMirror) в {{editor}}
В Foundry V14 по умолчанию используется редактор ProseMirror (раньше был TinyMCE). 

**Проблема:** При использовании хелпера `{{editor target="system.details.biography"}}` движок ProseMirror может вставлять сложную структуру iframe-ов и собственных контейнеров, которые могут игнорировать внешние CSS-ограничения по высоте и ломать `flex`-верстку, растягивая контейнер до бесконечности.

**Решение:**
Если вам нужно простое, предсказуемое поле для текста (например, для краткого описания происхождения или языков, как в макетах), лучше использовать обычный `<textarea>`. 
Редактор `{{editor}}` стоит оставлять только для действительно больших массивов текста (например, подробные статьи Журнала или описания предметов), выделяя ему отдельную полноразмерную вкладку (например, "Биография"), где он не сможет сломать сетку атрибутов.

## 4. Вкладки (Tabs) и разметка в ApplicationV2 (V2 Sheets)
При миграции листов `Actor` и `Item` на современный фреймворк `ApplicationV2` (классы `ActorSheetV2` / `ItemSheetV2`) возникают следующие нюансы:

### 1) Обязательный единый корневой HTML-элемент для каждой `PART`
Каждая часть шаблона, определенная в `static PARTS`, должна возвращать ровно **один корневой элемент HTML**. В V1 допускалось иметь несколько параллельных тегов на верхнем уровне шаблона (например, `<nav>`, `<header>`, `<section>`). В V2 попытка рендеринга такого шаблона выбросит ошибку:
`Template part "sheet" must render a single HTML element.`
- **Решение:** Оберните всё содержимое шаблона в один контейнерный тег, например: `<div class="sheet-content">...</div>`.

### 2) Корневой тег `<form>` и CSS-специфичность
Если в настройках `DEFAULT_OPTIONS` указано `tag: "form"`, то фреймворк автоматически рендерит корневой контейнер окна как тег `<form>`. 
- **Решение:** 
  1. Удалите открывающий `<form>` и закрывающий `</form>` из Handlebars-шаблонов во избежание невалидной вложенности HTML-форм.
  2. Обновите CSS-селекторы. Правило типа `.dedrel.sheet.actor form` (которое искало вложенную форму в V1) перестанет работать, так как форма сама стала корневым элементом. Измените его на `form.dedrel.sheet.actor`.

### 3) Декларативное переключение вкладок через `actions`
В `ApplicationV2` клики по навигационным элементам перехватываются общей системой действий, если на них установлен атрибут `data-action`.
- **Решение:** Если вы используете ссылки вида `<a data-action="changeTab" data-tab="tab-id" data-group="group-id">`, вам необходимо **явно зарегистрировать** экшн `changeTab` в `DEFAULT_OPTIONS.actions` вашего класса. Иначе клик перехватится обработчиком `_onClickAction`, но ничего не произойдет.
  ```javascript
  // В DEFAULT_OPTIONS
  actions: {
    changeTab: MySheetClass.#onChangeTab
  }

  // Метод класса
  static #onChangeTab(event, target) {
    const tab = target.dataset.tab;
    const group = target.dataset.group || "primary";
    this.changeTab(tab, group, { event });
  }
  ```

### 4) Динамический CSS-класс active при рендере
В `HandlebarsApplicationMixin` при изменении вкладок состояние `tabGroups` обновляется, но стили скрытия/показа неактивных панелей должны быть поддержаны в шаблонах и CSS:
- В методе `_prepareContext` подготовьте вкладки: `context.tabs = this._prepareTabs("primary");`.
- В шаблоне на панели вкладок выведите динамический класс активности: `<div class="tab {{tabs.details.cssClass}}" data-group="primary" data-tab="details">`.
- В файле CSS пропишите скрытие неактивных панелей по умолчанию:
  ```css
  .dedrel .tab {
    display: none;
  }
  .dedrel .tab.active {
    display: flex; /* или block */
  }
  ```

### 5) Регистрация Partial-шаблонов Handlebars (loadTemplates)
В отличие от классического поведения Handlebars, в Foundry V14 (особенно в контексте ApplicationV2) все partial-шаблоны, подключаемые через `{{> "systems/dedrel/templates/..."}}`, **обязаны** быть явно предзагружены ядром. Если вы выносите часть интерфейса в отдельный файл (например, модулируем листы предметов в `parts/`), вы должны добавить его полный путь в массив `foundry.applications.handlebars.loadTemplates([...])` в главном инициализационном файле (в нашем случае `dedrel.mjs`). В противном случае при рендеринге окна Foundry выбросит критическую ошибку `The partial ... could not be found`.

## 5. Сброс скролла при перерисовке листа (ApplicationV2)
**Проблема:** В новой архитектуре `ApplicationV2` каждое изменение данных документа (например, при вводе в текстовое поле или изменении чекбокса с флагом `submitOnChange: true`) вызывает полный ререндер окна или конкретных `PARTS`. При этом позиция скролла (например, в длинном списке инвентаря) мгновенно сбрасывается на самый верх, что делает использование листа невыносимым для игрока.

**Решение:**
Необходимо вручную сохранять позицию скролла перед ререндером и восстанавливать её после. Это делается путем переопределения методов `_preRender` и `_onRender` в классе вашего листа (наследующем `HandlebarsApplicationMixin`):

```javascript
  async _preRender(context, options) {
    await super._preRender(context, options);
    // Находим нужный скроллируемый контейнер (замените селектор на свой)
    this._savedScrollTop = this.element?.querySelector(".scrollable-wrapper")?.scrollTop || 0;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    // Восстанавливаем позицию
    const wrapper = this.element.querySelector(".scrollable-wrapper");
    if (wrapper) {
      wrapper.scrollTop = this._savedScrollTop;
    }
  }
```

## 6. Определение состояния сайдбара (Sidebar) в V14
В версии Foundry V14 архитектура главного правого меню (сайдбара) претерпела фундаментальные изменения. 

**Проблема:** 
Если вашему модулю или системе нужно динамически менять CSS-отступы в зависимости от того, свернут сайдбар или нет, вы можете столкнуться с тем, что:
1. Попытки проверить класс DOM (например, `document.getElementById('sidebar').classList.contains('collapsed')`) внутри методов вроде `_prepareContext` возвращают `false`. В V14 рендер ApplicationV2 полностью асинхронный, и на этапе генерации контекста DOM еще может не обновиться или использовать CSS-слои по умолчанию.
2. Старые скрытые переменные, такие как `ui.sidebar._collapsed` (из V11/V12), удалены из API и возвращают `undefined`.
3. Чтение глобальной настройки `game.settings.get("core", "sidebarCollapsed")` больше не работает для главного меню (в V14 сайдбар загружается в стиле "cabinet", свернутым по умолчанию всегда).

**Решение:**
- **Для перехвата кликов:** Продолжайте использовать встроенный хук `Hooks.on("collapseSidebar", (sidebar, collapsed) => { ... })`.
- **Для чтения состояния "здесь и сейчас" (например, при инициализации приложения):** Используйте исключительно публичный геттер `ui.sidebar.expanded`.

Пример правильного и надежного кода для метода `_prepareContext` в компоненте `ApplicationV2`:
```javascript
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Согласно архитектуре V14, сайдбар всегда свернут по умолчанию.
    // Официальный источник истины — геттер ui.sidebar.expanded
    let isCollapsed = true; 
    if (ui.sidebar && ui.sidebar.expanded !== undefined) {
      isCollapsed = !ui.sidebar.expanded;
    }
    
    context.isCollapsed = isCollapsed;
    return context;
  }
```

## 7. Чекбоксы (массивы значений) и FormDataExtended в ApplicationV2
**Проблема:**
Иногда возникает задача сделать мультиселект (выбор нескольких значений из списка) с помощью чекбоксов. Исторически в Foundry это могло быть реализовано в `DataModel` через массив: `action_type: new fields.ArrayField(new fields.StringField())`. 
В шаблоне разработчик пытался сделать чекбоксы с именами, вроде `name="action_type_action"`, и вручную перехватить их в `_prepareSubmitData(event, form, formData)`, чтобы собрать массив и подсунуть в `data`.
Однако в V14 (`ItemSheetV2`) объект `FormDataExtended` обладает агрессивной "магией":
1. Имена инпутов с точками (например, `action_type_checkbox.action`) автоматически разворачиваются во вложенные объекты.
2. Метод `super._prepareSubmitData` фильтрует и сохраняет **только те поля**, которые жестко описаны в `DataModel`. Фиктивные поля с чекбоксами (типа `action_type_action`) будут безжалостно удалены до того, как вы сможете их нормально обработать, а ручная модификация объекта `data` может конфликтовать со строгой валидацией схемы при вызове `document.update()`.

**Решение:**
**НИКОГДА** не пытайтесь вручную обходить `FormDataExtended` для обработки групп чекбоксов в V2. Всегда используйте "The Foundry Way":
1. В `DataModel` замените `ArrayField` на `SchemaField` со словарем булевых значений:
```javascript
  action_type: new fields.SchemaField({
    action: new fields.BooleanField(),
    reaction: new fields.BooleanField(),
    free: new fields.BooleanField(),
    chain: new fields.BooleanField()
  })
```
2. В Handlebars-шаблоне используйте нативный синтаксис Foundry с точками, который идеально мапится на `SchemaField`:
```html
<input type="checkbox" name="system.action_type.action" {{checked system.action_type.action}}/>
<input type="checkbox" name="system.action_type.chain" {{checked system.action_type.chain}}/>
```
При таком подходе Foundry **сам** соберёт состояния чекбоксов и идеально сохранит их в объект без единой строчки дополнительного JavaScript-кода. Если вам нужно перенести старые данные из массива в объект, просто переопределите встроенный метод `static migrateData(source)` в вашем `DataModel`.

## 8. jQuery удалён из Foundry V14
**Проблема:** Foundry VTT V14 **больше не включает jQuery** по умолчанию. Использование `$(selector)` или любых jQuery-методов (`.find()`, `.is()`, `.val()`) приведёт к ошибке `$ is not a function`.

**Решение:**  
Везде заменяйте jQuery на нативный DOM API:
```javascript
// НЕПРАВИЛЬНО (jQuery, ломается в V14):
const html = $(dialog.element);
const isChecked = html.find('[name="specialization"]').is(":checked");
const value = html.find('[name="bonus"]').val();

// ПРАВИЛЬНО (нативный DOM):
const html = dialog.element;
const isChecked = html.querySelector('[name="specialization"]')?.checked ?? false;
const value = html.querySelector('[name="bonus"]')?.value || "0";
```

## 9. `Dialog.confirm()` — deprecated, используйте `DialogV2.confirm()`
**Проблема:** Класс `Dialog` (он же `foundry.appv1.Dialog`) является устаревшим в V14. Вызовы `Dialog.confirm()`, `Dialog.prompt()` и `new Dialog()` работают через shim совместимости, который будет удалён.

**Решение:**  
Используйте `foundry.applications.api.DialogV2`:
```javascript
// НЕПРАВИЛЬНО (deprecated):
const confirm = await Dialog.confirm({
  title: "Заголовок",
  content: "<p>Текст</p>",
  yes: () => true,
  no: () => false
});

// ПРАВИЛЬНО (V14):
const confirm = await foundry.applications.api.DialogV2.confirm({
  window: { title: "Заголовок" },
  content: "<p>Текст</p>",
  modal: true
});
```

## 10. `Roll.evaluate({async: false})` — параметр игнорируется в V14
**Проблема:** В Foundry V14 метод `Roll.evaluate()` **всегда** выполняется асинхронно. Параметр `{async: false}` **молча игнорируется**, и метод возвращает `Promise`, а не объект `Roll`. Это приводит к `NaN` при попытке обратиться к `.total` синхронно.

**Решение:**  
Всегда используйте `await`:
```javascript
// НЕПРАВИЛЬНО (V14 вернёт Promise):
const r = new Roll("1d6");
const result = r.evaluate({async: false}).total; // NaN!

// ПРАВИЛЬНО:
const r = new Roll("1d6");
await r.evaluate();
const result = r.total;
```

## 11. Массив `changes` переехал в `system.changes` (ActiveEffect получил system-модель)
**Проблема:** В Foundry V14 у ActiveEffect появилась вложенная `system`-модель, и массив изменений теперь хранится в `effect.system.changes`, а не `effect.changes`. Старые пути (`effect.changes`, `effect._source.changes`) — это deprecated-шимы, которые в ряде случаев (непереносимые/embedded эффекты на предметах) возвращают `undefined` или пустой массив. Это ломает две вещи:
1. Копирование эффекта на другой документ (кнопка "Применить эффекты"): изменения теряются.
2. Запись обратно через top-level `changes`: миграция ядра может затереть реальный `system.changes`.

**Решение:** читать и писать через `system.changes` с fallback:
```javascript
// Чтение исходных изменений:
const src = e._source.system?.changes ?? e._source.changes ?? [];

// Запись в копию (НЕ через top-level data.changes):
const data = e.toObject();
delete data.changes;                       // убрать легаси-шим, чтобы он не затёр system.changes
data.system = { ...(data.system || {}), changes: foundry.utils.deepClone(src) };
```
Для `updateSource`/диффов апдейта тоже целитесь в `"system.changes"`, а не `"changes"`.

## 12. Кастомные фазы ActiveEffect не выполняются сами по себе
**Проблема:** В V14 у change-строк эффектов есть поле `phase`. Ядро исполняет только две встроенные фазы: `"initial"` (в `prepareEmbeddedDocuments`, ДО `prepareDerivedData`) и `"final"` (после `prepareData`). Изменение с любой другой фазой (например, `"apply"`) **молча не применяется**: ошибки нет, статус висит, но значение поля не меняется.

**Решение:** кастомная фаза требует ДВУХ шагов:
1. Регистрация в `init`-хуке: `CONFIG.ActiveEffect.phases.apply = { label: "...", hint: "..." };`
2. Ручной вызов в нужной точке жизненного цикла актёра, например:
```javascript
prepareEmbeddedDocuments() {
  super.prepareEmbeddedDocuments(); // ядро применяет фазу "initial"
  this.applyActiveEffects("apply"); // наша фаза
}
```
В системе Dedrel фаза `"apply"` (автоматически проставляется всем `system.*`-изменениям хуком `preCreateActiveEffect`) зарегистрирована в `dedrel.mjs` и вызывается в `DedrelActor#prepareEmbeddedDocuments` — до расчёта производных характеристик.

## 13. Системные подтипы RegionBehavior и события регионов на всех клиентах
**Контекст:** V14 позволяет системе объявлять собственные поведения регионов (используется для аур, см. `src/data/region-behaviors/aura.mjs`).

**Регистрация подтипа требует ТРЁХ шагов:**
1. Объявление в `system.json`: `"documentTypes": { "RegionBehavior": { "dedrelAura": {} } }` (без этого документ с таким `type` не пройдёт валидацию).
2. Модель данных в `init`-хуке: `CONFIG.RegionBehavior.dataModels.dedrelAura = DedrelAuraRegionBehaviorType;` (класс наследует `foundry.data.regionBehaviors.RegionBehaviorType`). Иконка — `CONFIG.RegionBehavior.typeIcons.dedrelAura = "fa-solid fa-..."`.
3. Название типа — ТОП-УРОВНЕВЫЙ ключ локализации `TYPES.RegionBehavior.dedrelAura` (вне корня `DEDREL`!). Подписи полей схемы — через `static LOCALIZATION_PREFIXES = ["DEDREL.RegionBehaviors.Aura"]` и ключи `...FIELDS.<имя>.label/hint`.

**Ловушка с событиями:** события регионов (`tokenEnter`, `tokenExit` и т.д.) рассылаются сокетом ВСЕМ клиентам, и `static events`-обработчики behavior-типа исполняются на каждом. Ядро в своих поведениях гейтится на `event.user.isSelf` (клиент, вызвавший событие), но у игрока обычно НЕТ прав создавать/удалять эффекты на чужих актёрах. Для системной логики гейтимся на `game.users.activeGM?.isSelf` — исполняется ровно один раз и с правами ГМа. Следствие: без подключённого ГМа автоматика не работает; рассинхрон лечится сверкой на `canvasReady` (см. `src/canvas/aura-regions.mjs`).

**Бонус V14 (нативные ауры):** регион с `attachment: {token: id}` ядро само двигает за токеном (обычные формы транслируются, эманации пересчитываются — см. `TokenDocument#computeAttachedRegionUpdates`) и удаляет вместе с токеном. Фабрика `createTokenEmanation(token, range, ...)` строит эманацию от футпринта токена — на квадратном токене это КВАДРАТ со скруглёнными углами; для круглой ауры создавайте регион вручную с shape `circle` от центра токена. `range`/`radius` — в единицах дистанции сцены (метры), НЕ в клетках. Массив `behaviors` можно передать прямо в данные создания региона.

**Ловушка с tokenEnter/tokenExit (тайминг!):**
- При УДАЛЕНИИ региона ядро синтезирует `tokenExit` для всех токенов внутри синхронно (`_onDeleteOperation` обходит `region.tokens`).
- При СОЗДАНИИ региона `tokenEnter` для токенов, уже стоящих внутри, ТОЖЕ приходит, но АСИНХРОННО: `#updateTokens` пересчитывает containment и обновляет `token._regions` отдельным серверным раунд-трипом; сервер выставляет `operation._priorRegions` при ЛЮБОМ изменении `_regions` (не только при движении, вопреки комментарию в клиентском коде), после чего клиент шлёт `tokenEnter`. СЛЕДСТВИЕ: не применяйте эффекты «вручную» сразу после создания региона — ручное применение гоняется с этим отложенным событием и даёт дубли; идемпотентность по данным не спасает, пока первый create не закоммичен.
- Токен, к которому регион ПРИВЯЗАН, исключается из пересчёта containment при своём движении (`_identifyRegions` замораживает membership привязанных регионов) — носитель ауры не генерирует enter/exit о собственную ауру, пока двигается; его membership фиксируется при создании региона.

## 14. Удаление ключей "-=key" — deprecated, используйте ForcedDeletion / _del
**Проблема:** легаси-синтаксис принудительного удаления ключа в update-объектах (`{"flags.dedrel.-=applyTo": null}`) в V14 выбрасывает предупреждение:
`Error: You are specifying a forced deletion or replacement key "-=applyTo" using legacy syntax...`

**Решение:** вместо префикса `-=` ключу присваивается оператор `foundry.data.operators.ForcedDeletion`. Ядро предоставляет готовый глобальный синглтон `_del`:
```javascript
// Было (V13):
await effect.update({ "flags.dedrel.-=applyTo": null });
// Стало (V14):
await effect.update({ "flags.dedrel.applyTo": _del });
// Эквивалент без глобала:
await effect.update({ "flags.dedrel.applyTo": new foundry.data.operators.ForcedDeletion() });
```
Для принудительной замены значения без рекурсивного мержа есть парный оператор `ForcedReplacement` (глобал `_replace`: `_replace(value)`). В дифах, приходящих в хуки `preUpdate*`/`update*`, удаляемый ключ теперь присутствует со значением-инстансом `ForcedDeletion` (проверка `"key" in diff` продолжает работать).

## 15. Истёкшие ActiveEffect по умолчанию не удаляются, а становятся «зомби»
**Проблема:** Когда у временного эффекта заканчивается длительность, ядро по умолчанию (`CONFIG.ActiveEffect.expiryAction: "update"`) лишь помечает его `duration.expired`. Такой эффект подавляется (`isSuppressed` → `active === false`): иконка с токена пропадает, change-строки перестают применяться, но **документ остаётся в `actor.effects`**. Любой код, ищущий эффект по статусу (`toggleStatusEffect`, стакающиеся кондиции), находит этого «зомби» и считает, что состояние всё ещё висит — например, отказывается наложить кондицию заново из-за «максимума стаков».

**Решение:** В системе Dedrel в init-хуке выставлено `CONFIG.ActiveEffect.expiryAction = "delete"` — реестр (`ActiveEffect.registry.refresh`, вызывается ядром на событиях хода и `updateWorldTime`) удаляет истёкшие эффекты. Дополнительно `DedrelActor#addConditionStack` заменяет неактивный остаток (`!effect.active`) свежим наложением — на случай, если эффект истёк до срабатывания реестра или был выключен вручную.

## 16. Тип change-строки — строковый `type`, а не числовой `mode`
**Проблема:** В V14 у элемента `system.changes` тип операции хранится в строковом поле **`change.type`** (`"add"`, `"multiply"`, `"override"`, `"upgrade"`, `"downgrade"`, `"custom.<N>"`). Числовое `change.mode` (`CONST.ACTIVE_EFFECT_MODES.ADD` и т.п.) — это deprecated-**геттер-шим** (удаляется в v16), который к тому же навешивается ядром (`_shimChanges`) только на *подготовленные* объекты и **отсутствует на «сырых» данных** — например, на клонах из `CONFIG.statusEffects[...].changes`. Проверка вида `if (change.mode === CONST.ACTIVE_EFFECT_MODES.ADD)` на таких объектах молча даёт `false` (`change.mode === undefined`).

**Симптом из практики:** масштабирование change-строк по числу стаков (`DedrelActor#addConditionStack`) не срабатывало — стаки множили только тик-урон (он идёт отдельным путём через `@stacks` в формуле), а бонусы/штрафы эффекта оставались базовыми.

**Решение:** сверяйтесь со строковым `type`:
```javascript
const isAdd = (ch.type === "add") || (ch.mode === CONST.ACTIVE_EFFECT_MODES.ADD); // второе — запас для легаси-данных
```
Соответствие: `0 custom`, `1 multiply`, `2 add`, `3 downgrade`, `4 upgrade`, `5 override`.

**Оборотная сторона: словарь закрыт, а выдуманный тип не ругается.** Валидны только шесть значений выше (`custom` — в форме `custom.<N>`); ядро (`BaseActiveEffect.#MODES_TO_TYPES`) других не знает. Записать в `type` любую правдоподобную строку можно — схема это проглотит, эффект будет висеть на листе и выглядеть рабочим, а величина **никуда не пойдёт**, молча и без предупреждения в консоли.

**Симптом из практики (2026-09-10):** мутации «Маленький размер» и «Огромный размер» несли `type: "subtract"` — их описания обещали −2 к Блоку и −2 к Уклонению, но штрафы не применялись. Отдельного типа для вычитания в V14 нет и не было: **штраф — это `add` с отрицательным значением** (`effect-keys.md` §2.1).

**Решение:** `data_validation_macro.js` проверяет типы операций и помечает неизвестные как ERROR; массовая починка — `fix_invalid_change_types_macro.js` (конвертирует `subtract N` → `add −N`, прочие неизвестные типы показывает для ручной правки).

## 17. Длительность эффекта живёт в `start`, а не в `duration.start*`
**Проблема:** В V14 схема `duration` у ActiveEffect — это **только** `{ value, units, expiry, expired }`. Полей `duration.startRound / startTime / startTurn / rounds / turns` в схеме **нет вовсе**. «Момент начала» вынесен в отдельный nullable-объект **`effect.start`** = `{ combat, combatant, initiative, round, turn, time }`, и остаток (`duration.remaining` / `duration.label`) вычисляется в `ActiveEffect#_prepareDuration` именно от него (для боевых единиц — `start.round`/`start.turn`/`start.combat`, для временны́х — `start.time`).

**Симптом из практики:** «сброс таймера» кондиции через `effect.update({ "duration.startRound": game.combat.round, "duration.startTime": ... })` не делал ничего — писал в несуществующие поля, а guard `if (effect.duration.rounds || effect.duration.turns)` всегда был `false`.

**Решение:** сбрасывать/задавать начало через объект `start`, каноническим статиком ядра (тем же, что вызывается в `ActiveEffect#_preCreate`):
```javascript
await effect.update({ start: effect.constructor.getEffectStart() });
// getEffectStart(combat = game.combat) → {time, combat, combatant, initiative, round, turn} на текущий момент
```
Это корректно и в бою (по раундам/ходам), и вне боя (по времени). Дисплей остатка — подготавливаемое значение: чтобы счётчик уменьшался вживую при смене раунда, актёра нужно переподготовить и перерисовать UI (в Dedrel — `ActiveEffectsHUD#_onTimeChange` на хуках `updateWorldTime`/`updateCombat`), т.к. ядро на `updateWorldTime` лишь прогоняет реестр истечения, но `duration.label` не пересчитывает.

## 18. Эффекты умеют менять токен нативно: change-ключи `token.*` (свет, зрение, текстура)
**Проблема:** до V14 у ActiveEffect не было пути к данным TokenDocument (свет, зрение живут не в system-данных актёра), из-за чего свет от эффектов приходилось реализовывать кастомным хуком с физической записью в документ токена (`doc.update({light})` + сохранение исходного в флаг). Такой подход требует ГМа онлайн, мутирует сцену и «застревает» при рассинхроне.

**Решение:** в V14 change-строка с ключом-префиксом **`token.`** применяется не к актёру, а к его токенам — **эфемерно, на каждом клиенте, без записи в БД**. `Actor#applyActiveEffects` откладывает такие изменения в `actor.tokenActiveEffectChanges`, а `TokenDocument#applyActiveEffects` применяет их при подготовке данных токена (фазы `initial`/`final`; наша кастомная фаза `apply` токеном НЕ исполняется — не ставьте её на `token.*`-ключи). Снятие/подавление/истечение эффекта гасит изменения само: `TokenDocument#_onRelatedUpdate` сбрасывает подготовку и перерисовывает канву.

Разрешённые корни ключей — `TokenDocument._ACTIVE_EFFECT_TARGETABLE_KEYS`: `name`, `width/height/depth/shape` (не применяются автоматически, см. `_onOverrideSize`), `texture`, `alpha`, `disposition`, `light`, `sight`, `detectionModes`, `ring`, `turnMarker`, `movementAction`, `flags`.

```javascript
// Факел: эффект на предмете с transfer: true (+ гейтинг экипировки Dedrel)
system: { changes: [
  { key: "token.light.dim",    type: "override", value: "8" },
  { key: "token.light.bright", type: "override", value: "4" },
  { key: "token.light.color",  type: "override", value: "#ff9329" },
  { key: "token.light.animation.type", type: "override", value: "torch" }
]}
```
Значения — строки: касты к типам полей `LightData` ядро выполняет само. Гейтинг Dedrel (`DedrelActor#allApplicableEffects`) работает и здесь: свет от неэкипированного предмета не применяется. В Dedrel свет токена хранится именно так (пресет `light` в `src/config/effect-library.mjs`, диалог — `item-sheet.mjs`); легаси-маркер `flags.dedrel.tokenLight` конвертируется миграцией `DedrelMigration.migrateEffectData`.

## 19. Выгрузка `toObject()` не показывает поля, снятые со схемы
**Проблема:** после удаления поля из `defineSchema()` его больше не видно ни в `item.system`, ни в `item._source`, ни в JSON-выгрузке (`export_packs_to_json_macro.js` зовёт `doc.toObject()`, а тот отдаёт **очищенный** источник). В БД ключ при этом физически лежит на месте. Отсюда ловушка при реворках: смотришь свежую выгрузку, видишь `grants` ноль раз и делаешь вывод «поле никогда не заполнялось, сношу без миграции» — а на деле данные есть и их сейчас потеряют.

**Решение:** судить о наличии легаси-данных по выгрузке, снятой **до** правки схемы, либо по косвенным следам — если `migrateData` конвертирует старое поле в новое, заполненность нового и есть доказательство, что старое было непустым. Пример из реворка материалов (2026-07-15): `grants` в выгрузке отсутствовал совсем, но у 19 материалов оказались непустые `slots` — ровно те, кому `migrateData` перенёс данные из `grants`.

Прямой вывод для миграционных макросов: **проверка вида `if (!item._source.system.legacy_field) skip` не работает** — условие всегда истинно, ветка очистки никогда не выполнится. Удаление легаси-ключа (`{"system.legacy_field": _del}`, см. §14) при этом безвредно, но и бесполезно: ключ уходит из БД сам при первой же записи документа, потому что пишется очищенный источник.

## 20. Длительность эффекта в `months` конвертируется в 0 секунд
**Проблема:** единицы времени длительности эффекта (`hours`, `days`, `months`...) ядро переводит в секунды через `game.time.calendar.componentsToTime({<единица>: value})` (см. `BaseActiveEffect.shimData`). Но базовый `CalendarData.componentsToTime` учитывает ТОЛЬКО компоненты `year`, `day`, `hour`, `minute`, `second` — компонент `month` молча игнорируется. Итог: эффект с `duration: { value: 1, units: "months" }` получает длительность **0 секунд**, немедленно считается истёкшим и (при нашем `expiryAction: "delete"`, §15) удаляется на ближайшем `refresh` реестра.

**Решение:** не использовать `units: "months"`. Месяц Дедрела — ровно 30 дней (см. `src/config/calendar.mjs`), поэтому длительность в месяц задаётся как `{ value: 30, units: "days" }`. Кнопка «+1 месяц» в TimeHUD по той же причине двигает время на 30 дней в секундах, а не компонентом `month`.

## 21. `yearZero` календаря — декларация без реализации
**Проблема:** поле `years.yearZero` в конфиге `CalendarData` описано в типах как «год, который отображается как 0», но в ядре V14 оно **нигде не используется**: ни `timeToComponents`/`componentsToTime`, ни встроенные форматтеры (`formatTimestamp`) его не применяют. `components.year` — это просто число полных лет, прошедших от `worldTime = 0`.

**Решение:** смещение эпохи прибавлять самостоятельно при отображении: `components.year + (calendar.years.yearZero ?? 0)` (так делает TimeHUD, `src/apps/time-hud.mjs`). В расчётах длительностей смещение не участвует и ни на что не влияет.

## 22. `_id` документа — ровно 16 буквенно-цифровых символов, иначе документ не создаётся
**Проблема:** «говорящие» фиксированные `_id` в макросах импорта (`keepId: true`) удобны — они держат `@UUID`-ссылки живыми между прогонами. Но ядро валидирует их по жёсткому шаблону `/^[a-zA-Z0-9]{16}$/`: ровно **16** символов, только латиница и цифры, без дефисов, подчёркиваний и пробелов. Любое отклонение — и создание падает с

```
DataModelValidationError: [Compendium.dedrel.actors.Actor.LunaRojaThug01] validation errors:
  _id: must be a valid 16-character alphanumeric ID
```

Ошибка вылезает **не при написании данных, а при `createDocuments`** — то есть после того, как идемпотентный макрос уже удалил старую версию документа. Результат: сущность пропала, новая не создалась, а сообщение об ошибке говорит про валидацию, а не про длину строки, и читается как «битые данные».

Чаще всего ловится на ровном месте: `"LunaRojaThug01"` — 14 символов, `"BanditSorcerer001"` — 17. Глазами длина не считается.

**Решение:**

1. Придумывая `_id`, дополняй имя нулями до 16 (`BanditBruiser001`, `LunaRojaThug0001`) и проверяй длину, а не «на глаз».
2. В макрос импорта ставь гард **до** первого удаления/создания:

```javascript
const badIds = ROSTER.filter(s => !/^[A-Za-z0-9]{16}$/.test(s._id));
if (badIds.length) {
  return ui.notifications.error(
    `Некорректные _id (нужно ровно 16 букв/цифр): ${badIds.map(s => `${s._id} (${s._id.length})`).join(", ")}`
  );
}
```

3. Если «говорящий» id не нужен — не передавай `_id` вовсе и не ставь `keepId`: ядро сгенерирует валидный само. Фиксированный id нужен только там, где на документ есть внешние `@UUID`-ссылки (описания, цепи манёвров, `adds_items`).

То же правило действует для вложенных документов (`ActiveEffect` внутри предмета, предметы внутри актора) — там оно всплывает при `createEmbeddedDocuments(..., { keepId: true })`.

## 23. `DialogV2` не скроллит контент: на длинном списке кнопки уезжают за край экрана
**Проблема:** `DialogV2` растит окно под размер содержимого и не ограничивает его высотой вьюпорта. Как только контент перерастает экран, строка кнопок («Да» / «Нет») оказывается ниже нижнего края и становится недоступной — окно выглядит зависшим: текст виден, реакции на клики нет, `await` никогда не разрешается. Особенно легко напороться в макросах-планировщиках, где контент диалога — список обрабатываемых сущностей: макрос работал, в каталог добавили несколько записей, и он «перестал запускаться».

**Решение:**
Оборачивай контент в скроллируемый контейнер — высоту задавай во вьюпортных единицах, чтобы осталось место под заголовок и кнопки:
```javascript
const confirmed = await foundry.applications.api.DialogV2.confirm({
  window: { title: "Заголовок" },
  content: `
    <div style="max-height: 55vh; overflow-y: auto;">
      ${longList}
    </div>
  `,
  rejectClose: false,
  modal: true
});
```
Отладка: если диалог «висит», сначала проверь, видно ли кнопки, и только потом ищи ошибку в коде. Прецедент 2026-09-15: `rework_flesh_catalog_macro.js` после разбивки «Слабости» на четыре записи.

## 24. Отклонённый по валидации `update()` не бросает исключение — макрос рапортует об успехе
**Проблема:** когда `Document#update()` не проходит валидацию схемы (`DataModelValidationError`), ядро V14 обрабатывает ошибку **внутри себя** — через `onError` клиентского бэкенда: в консоль летит `validation errors: SchemaField#_updateDiff`, всплывает уведомление, запись не происходит. Но промис при этом **не реджектится**: `await doc.update(...)` спокойно возвращает управление, а `try/catch` вокруг него ничего не ловит. Для макроса массовой правки это худший из режимов отказа — он проходит по всем документам, ничего не записывает и печатает отчёт «изменено 8».

Самый частый источник — **правка enum в `src/constants.mjs` при запущенном мире**. Константы попадают в схему при инициализации и живут в памяти до перезапуска, поэтому новое значение схема отвергает, хотя файл на диске уже верный (и `systems/dedrel` — симлинк на репозиторий, то есть «файл не доехал» тут ни при чём). Прецедент 2026-09-22: класс материала `processed`.

**Решение:**
1. **Гард на живую схему** в начале макроса, если он пишет значения enum. Спрашивать нужно саму схему, а не файл констант:
```javascript
const field = CONFIG.Item.dataModels.craft_material.schema.getField("material_class");
const unknown = needClasses.filter(c => !(field?.choices ?? []).includes(c));
if (unknown.length) return ui.notifications.error(
  `Схема мира не знает класс(ы) «${unknown.join(", ")}». Перезапустите мир (Ctrl+Shift+R) и прогоните макрос заново.`,
  { permanent: true }
);
```
2. **Сверять результат по живому документу** после каждой записи — отклонённый `update()` оставляет документ в прежнем виде, поэтому достаточно перечитать поле:
```javascript
await doc.update(upd);
const stuck = Object.entries(upd).every(([path, value]) => foundry.utils.getProperty(doc, path) === value);
if (!stuck) failed.push(`${doc.name}: изменения не записались`);
```
Готовые образцы обоих приёмов — `set_processed_materials_macro.js` (гард + сверка) и `rework_magic_items_macro.js` (хелпер `safeUpdate`).

**После правки enum в константах мир нужно перезапустить с жёсткой перезагрузкой страницы** (Ctrl+Shift+R): обычный F5 может отдать `constants.mjs` из кеша браузера.

## 25. `init` срабатывает раньше языковых файлов, а паки — ещё позже; индекс пака приходит без системных полей
**Проблема 1 — порядок загрузки.** В `Game#initialize` (14.368) хук `init` вызывается **до** `await this.i18n.initialize()`, а паки создаются ещё позже, в `Game#setupGame` (`initializePacks` → `initializeDocuments` → хук `setup`). Хуки синхронны, ядро не ждёт промисов из обработчиков, а `esmodules` системы подключаются обычным `<script type="module">` — top-level await в модуле тоже ничего не гарантирует. Если на `init` запустить `fetch` словаря, первые документы из паков могут собраться раньше, чем он придёт.

**Решение:** обернуть `game.i18n.initialize` в `init` — ядро её **ждёт** (`await`), и всё, что загружено внутри обёртки, гарантированно готово до создания паков. Объект `game.i18n` существует с конструктора `Game`, метод на экземпляре переопределяется.
```javascript
const initialize = game.i18n.initialize.bind(game.i18n);
game.i18n.initialize = async (...args) => { await initialize(...args); await loadMyData(); };
```
Пример — `src/l10n/compendium-translation.mjs` (слой перевода компендиумов).

**Проблема 2 — индекс пака.** Сервер присылает начальный индекс только с полями ядра (`name`, `img`, `type`, `sort`, `folder`); окно компендиума и поиск сайдбара читают `pack.index` **напрямую**, без `getIndex()`. Каждый `getIndex({fields})` вливает в записи свежие данные сервера (`mergeObject`) и перезаписывает всё, что вы туда положили локально. Чтобы держать в индексе своё (например, переведённое имя): добавить поле в `CONFIG.Item.compendiumIndexFields` на `init`, обернуть `CompendiumCollection.prototype.getIndex` и править записи после оригинала, а на `setup` один раз вызвать `getIndex()` и `pack.initializeTree()` — дерево пака строится из индекса и само не пересобирается.

**Попутно:** документ, создаваемый в паке (`Document.create(data, {pack})`), сначала строится на клиенте как черновик с опцией `creation: true` (`ClientDatabaseBackend#preCreateDocumentArray`), и именно его данные уходят на сервер. Любую подмену `_source` в `_initializeSource` при `options.creation` надо пропускать, иначе она запишется в пак.
