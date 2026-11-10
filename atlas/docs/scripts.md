# Скрипты

Карта папок и команды — в `scripts/README.md`. Здесь: что делает каждый скрипт и что он читает и пишет.

## build/

| Скрипт | Читает | Пишет |
|---|---|---|
| `data-json.ts` | `data/*.yaml`, `data/history`, `data/scenarios`, `data/geo/sunny-islands-inset.yaml` | в dev отдаёт `/data/<имя>.json`, в сборке кладёт `dist/data/*.json` и добавляет `<link rel="preload">` в `index.html` |
| `build-master.ts` | `data/master/*.yaml` | `api/_data/master.json` (в `dist` не попадает; `pnpm check:master` проверяет это) |
| `build-icons.mjs` | game-icons.net (кэш `$ICON_CACHE`, по умолчанию `/tmp/gi`) | `public/icons/*.svg`, `ATTRIBUTION.md` |
| `sync.ts` | `https://dedrel.teo.uy/static/contentIndex.json` | `data/raw/site/contentIndex.json`, `data/site/pages.json`, отчёт отличий |

Набор данных браузера = `data/*.yaml` верхнего уровня минус `events-overrides`, `flows`, `zones` (они нужны только сборке и
проверке) плюс `history/owners`, `history/landscape`, `geo/sunny-islands-inset`, `areas`, `scenarios`. Список `DATA_NAMES` определяется
автоматически, новый `data/<имя>.yaml` появляется в браузере без правки кода.

## check/

`validate.ts` (`pnpm validate`) проверяет схемы zod, ссылки между наборами, геометрию, источники, владельцев ячеек, маршруты,
сценарии и граф связей. Проверки сгруппированы в `check/lib/*-check.ts`, у каждой есть чистая функция, которую тестирует vitest.
Ошибки останавливают прогон, предупреждения печатаются. `check-dist-master.mjs` убеждается, что в `dist` нет мастер-данных.

## import/

| Скрипт | Назначение |
|---|---|
| `build-registry.ts` | реестр мест, людей, организаций, потоков из выжимок лора |
| `build-chronicle.ts` | пересборка `data/events.yaml` из сырых событий: склейка дублей, `alt[]`, слухи в `data/master` |
| `chronicle-lib.ts`, `chronicle-fixes.ts`, `chronicle-overrides.ts`, `territory-manual.ts` | правила склейки, ручные исправления, правки поверх пересборки, ручная территория |
| `check-chronicle.ts` | проверяет, что пересборка хроники воспроизводится (нужны входы импорта) |
| `build-owners.ts` | `data/history/owners.yaml` из реконструкции владельцев по опорным кадрам |
| `merge-gazetteer.ts`, `match-wiki.ts`, `build-wiki-titles.mjs` | газеттир, сверка с вики, `data/wiki-titles.yaml` |
| `dedup-people.py` | склейка дублей персонажей |

## geo/

| Скрипт | Назначение |
|---|---|
| `tiles.py` | нарезка `data/raw/media/dedrel_optimized.webp` в `public/tiles/{drawn,muted}/z/x/y.webp` (`pnpm tiles`) |
| `vectorize/*.py` | растр → GeoJSON: суша, реки, дороги, государства, ячейки, местность; `*-check.py` проверяют результат |
| `build-routes.py` | `data/flows.yaml` → `data/routes.yaml` и `data/geo/routes.geojson` |
| `build-layers.py`, `build-anchors.py`, `build-resources.py`, `layer_links.py` | реестр слоёв, привязки мест, ресурсы, штабы гильдий |

## Известные особенности

- Отладочные дампы `vectorize/*.py` пишут в `/tmp/w3` и `/tmp/_*.npy`; каталог `/tmp/w3` нужно создать самому.
- Строгие флаги `noUnusedLocals`/`noUnusedParameters` включены в `tsconfig.base.json` для всех конфигов.
