# Contributing to Dedrel

[English](#english) · [Русский](#русский)

---

## English

Thanks for your interest in Dedrel! The system is in **alpha**: it is developed by one
author and tested at live playtests, so things change quickly. Contributions of every
size are welcome — from a typo report to a pull request.

### Ways to help

- **Report a bug** — use the *Bug report* issue form. Foundry and system versions and
  the browser console output (F12) are the most useful part.
- **Propose a mechanic or a rules change** — use the *Mechanic proposal* form. Rules and
  balance are discussed in an issue first; please don't open a pull request for a rules
  change before the discussion.
- **Fix code** — pull requests are welcome. For anything bigger than a small fix, open
  an issue first so we can agree on the approach before you spend time on it.
- **Improve the English translation** — interface strings live in `lang/en.json`,
  compendium texts in `translations/en/<pack>.json`.

The setting (lore, history, characters) is the author's canon and is not open to
pull requests, but questions and ideas in issues are always welcome.

### Development setup

1. Install Foundry VTT **V14**.
2. Clone this repository into `Data/systems/dedrel` of your Foundry user data folder.
   The folder must be named `dedrel` — it is the system id.
3. Install [Node.js](https://nodejs.org) 22 or newer, then run `npm install` and
   `npm run build-packs` in the repository folder. Compendiums are stored as JSON in
   `packs/_source/`; this builds the databases Foundry reads.
4. Create a world with the Dedrel system. Code needs no build step: reload the world (F5)
   after editing a file. Changes to `system.json` need a Foundry restart.

Working with compendiums:

- After editing content **in Foundry**, run `npm run save-packs` — it writes the packs
  out to `packs/_source/` — and commit the changed JSON files.
- After the JSON changed **in files** (a `git pull`, a manual edit), stop Foundry and run
  `npm run build-packs`.
- `npm run packs-status` shows which side changed. Both commands refuse to overwrite
  changes made on the other side since the last sync; `--force` overrides that.

Where to start reading: [docs/README.md](docs/README.md) (in Russian for now; the
English version is planned). [docs/architecture.md](docs/architecture.md) is the map
of the code.

### Guidelines

- Follow the development checklist in
  [docs/adding-item-type.md](docs/adding-item-type.md#5-чеклист-разработки). The short version:
  - no jQuery, no `Dialog.*` (use `DialogV2`), always `await roll.evaluate()`;
  - effect change rows go into `system.changes` with a string `type`;
  - find entities by `system.key`, never by the display `name`;
  - every UI string goes through `game.i18n` and is added to **both** `lang/ru.json` and `lang/en.json`.
- Read [docs/foundry-v14-quirks.md](docs/foundry-v14-quirks.md) before touching sheets or
  Active Effects — most V14 pitfalls are already documented there.
- Keep pull requests small and focused. In the description say what you changed, why,
  and how you tested it in Foundry.
- **Compendium content** lives in `packs/_source/<pack>/`, one JSON file per document.
  Commit only these files — the databases in `packs/<pack>/` are build output and are
  ignored by git. For larger content changes (new maneuvers, talents, spells…) open an
  issue first, so the mechanics can be discussed before the work is done.
- When editing `translations/en/*.json`, keep the `_src` field untouched: it tracks which
  Russian original the translation was made from.

### Licensing of contributions

The project uses two licenses: **code** is under the MIT License (`LICENSE`), **rules,
texts and artwork** are under CC BY-NC 4.0 (`LICENSE-CONTENT`). See `NOTICE` for which
folder falls under which license.

By submitting a contribution — a pull request, a patch, or text, rules, a translation or
artwork posted in an issue with the intent to be included — you confirm that:

1. You created the contribution yourself or otherwise have the right to submit it under
   the terms below.
2. **Code** contributions are licensed under the MIT License, the same as the project's code.
3. **Content** contributions (rules and texts, compendium content, translations, artwork)
   are licensed to the public under CC BY-NC 4.0, the same as the project's content.
   **In addition, you grant the project author (Teo) a perpetual, worldwide,
   non-exclusive, royalty-free, irrevocable license to use, modify, distribute,
   sublicense and relicense your contribution under any terms, including commercial
   ones.**

You keep the copyright to your contribution, and your authorship stays visible in the
git history.

*Why the extra grant?* CC BY-NC binds everyone, including the project author, with
respect to other people's work. Without the grant, a single contributed paragraph could
block a printed edition of the rules or a port of the system to another platform. The
grant only concerns content — MIT code can already be reused by anyone, commercially
included.

**Third-party material.** Assets and texts you didn't create must come with a license
that allows commercial use (for example CC0, CC BY, MIT or the SIL Open Font License).
Name the source and the author in the pull request. Icons from
[game-icons.net](https://game-icons.net) (CC BY 3.0) are welcome — mention the original
icon's name and author, and they'll be added to `assets/ICON_CREDITS.md`.

**AI tools.** The project itself is built with the help of AI assistants (see `NOTICE`),
so AI-assisted contributions are fine. If a substantial part of your contribution was
generated, say so in the pull request, and make sure you have reviewed and tested it.
For generated artwork, name the generator.

### Code of Conduct

Everyone taking part in the project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
Reports and questions: [admin@teo.uy](mailto:admin@teo.uy).

---

## Русский

Спасибо за интерес к Dedrel! Система в **альфе**: её делает один автор и проверяет на живых
плейтестах, поэтому всё быстро меняется. Помощь любого размера приветствуется — от
сообщения об опечатке до пул-реквеста.

### Чем можно помочь

- **Сообщить о баге** — форма *Bug report*. Самое ценное в ней — версии Foundry и системы
  и вывод консоли браузера (F12).
- **Предложить механику или правку правил** — форма *Mechanic proposal*. Правила и баланс
  сначала обсуждаются в issue; пул-реквест с правкой правил до обсуждения не открывайте.
- **Исправить код** — пул-реквесты приветствуются. Для всего, что больше мелкого фикса,
  сначала откройте issue: договоримся о подходе до того, как вы потратите время.
- **Улучшить английский перевод** — строки интерфейса лежат в `lang/en.json`, тексты
  компендиумов — в `translations/en/<пак>.json`.

Сеттинг (лор, история, персонажи) — авторский канон и пул-реквестам не открыт, но вопросы
и идеи в issue всегда кстати.

### Как развернуть для разработки

1. Установите Foundry VTT **V14**.
2. Клонируйте репозиторий в `Data/systems/dedrel` папки пользовательских данных Foundry.
   Папка должна называться `dedrel` — это id системы.
3. Установите [Node.js](https://nodejs.org) 22 или новее и выполните в папке репозитория
   `npm install` и `npm run build-packs`. Компендиумы хранятся в виде JSON в `packs/_source/`,
   команда собирает из них базы, которые читает Foundry.
4. Создайте мир на системе Dedrel. Код сборки не требует: после правки файла перезагрузите
   мир (F5). Изменения `system.json` требуют перезапуска Foundry.

Работа с компендиумами:

- Поправили контент **в Foundry** — выполните `npm run save-packs` (выгружает паки
  в `packs/_source/`) и закоммитьте изменившиеся JSON.
- JSON изменился **в файлах** (`git pull`, ручная правка) — остановите Foundry и выполните
  `npm run build-packs`.
- `npm run packs-status` показывает, какая сторона изменилась. Обе команды отказываются
  затирать правки, сделанные на другой стороне после прошлой синхронизации; `--force`
  снимает эту защиту.

С чего начать чтение: [docs/README.md](docs/README.md), карта кода —
[docs/architecture.md](docs/architecture.md).

### Правила

- Следуйте чеклисту разработки из
  [docs/adding-item-type.md](docs/adding-item-type.md#5-чеклист-разработки). Коротко:
  - никакого jQuery и `Dialog.*` (только `DialogV2`), всегда `await roll.evaluate()`;
  - change-строки эффектов — в `system.changes` со строковым `type`;
  - сущности ищутся по `system.key`, а не по отображаемому `name`;
  - любая строка интерфейса идёт через `game.i18n` и добавляется в **оба** файла — `lang/ru.json` и `lang/en.json`.
- Прежде чем трогать листы или Active Effects, прочитайте
  [docs/foundry-v14-quirks.md](docs/foundry-v14-quirks.md): большинство ловушек V14 там уже описано.
- Пул-реквесты — небольшие и про одно. В описании укажите, что изменено, зачем и как вы
  проверили это в Foundry.
- **Содержимое компендиумов** лежит в `packs/_source/<пак>/`, по JSON-файлу на документ.
  Коммитьте только их: базы в `packs/<пак>/` — результат сборки, git их игнорирует.
  Крупные правки контента (новые манёвры, таланты, заклинания…) сначала обсудите в issue,
  чтобы договориться о механике до того, как работа сделана.
- В `translations/en/*.json` не трогайте поле `_src`: по нему отслеживается, с какой версии
  русского оригинала сделан перевод.

### Лицензирование вклада

В проекте две лицензии: **код** — MIT (`LICENSE`), **правила, тексты и арт** — CC BY-NC 4.0
(`LICENSE-CONTENT`). Какая папка под какой лицензией — в `NOTICE`.

Отправляя вклад — пул-реквест, патч или текст, правила, перевод либо арт в issue с намерением
включить их в проект, — вы подтверждаете, что:

1. Вы создали вклад сами или иным образом имеете право передать его на условиях ниже.
2. **Код** лицензируется под MIT, как и весь код проекта.
3. **Контент** (правила и тексты, содержимое компендиумов, переводы, арт) лицензируется для
   всех под CC BY-NC 4.0, как и весь контент проекта. **Дополнительно вы предоставляете
   автору проекта (Тео) бессрочную, всемирную, неисключительную, безвозмездную и безотзывную
   лицензию использовать, изменять, распространять, сублицензировать и перелицензировать
   ваш вклад на любых условиях, включая коммерческие.**

Авторское право на вклад остаётся за вами, а авторство видно в истории git.

*Зачем дополнительное разрешение?* CC BY-NC в отношении чужого вклада связывает всех,
включая автора проекта. Без этого разрешения один присланный абзац мог бы заблокировать
печатное издание правил или перенос системы на другую платформу. Разрешение касается только
контента: код под MIT и так может использовать кто угодно, в том числе коммерчески.

**Чужие материалы.** Ассеты и тексты, созданные не вами, должны идти под лицензией,
разрешающей коммерческое использование (например, CC0, CC BY, MIT или SIL Open Font
License). Укажите в пул-реквесте источник и автора. Иконки с
[game-icons.net](https://game-icons.net) (CC BY 3.0) приветствуются — назовите исходную иконку
и её автора, и они попадут в `assets/ICON_CREDITS.md`.

**ИИ-инструменты.** Сам проект делается с помощью ИИ-ассистентов (см. `NOTICE`), так что
вклад, сделанный с ИИ, — это нормально. Если существенная часть вклада сгенерирована,
скажите об этом в пул-реквесте и убедитесь, что вы её проверили и протестировали.
Для сгенерированного арта назовите генератор.

### Кодекс поведения

Все участники проекта следуют [кодексу поведения](CODE_OF_CONDUCT.md).
Жалобы и вопросы: [admin@teo.uy](mailto:admin@teo.uy).
