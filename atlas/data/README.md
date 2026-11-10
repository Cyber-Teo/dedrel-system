# Данные атласа

Источник истины — YAML в этой папке. Браузер получает их как JSON, собранный на этапе сборки (`scripts/build/data-json.ts`);
схемы zod лежат в `src/data/schema.ts`, проверка — `pnpm validate`.

## Канонические наборы (правятся вручную)

`places`, `people`, `orgs`, `events`, `relations`, `layers`, `areas`, `routes` и `flows`, `resources`, `military`, `magic`,
`hazards`, `religion`, `fortress-dates`, `guild-hq`, `people-loc`, `anchors`, `capitals`, `coats`, `miniatures`, `illior-scheme`,
`zones`, `chronicle` (династии и правители), `wiki-titles` (названия страниц вики), `scenarios/*.yaml` (экскурсии),
`master/*.yaml` (секретные события мастера: в публичную сборку не попадают).

## Производные

- `geo/*.geojson` — границы, реки, дороги, ячейки, местность; строятся из растра скриптами `scripts/geo/vectorize/*`.
- `history/owners.yaml` — владельцы ячеек по годам; `history/landscape.yaml` — ландшафт эпох.
- `routes.yaml` и `geo/routes.geojson` — собираются из `flows.yaml` скриптом `scripts/geo/build-routes.py`.

## Правки поверх импорта

`events-overrides.yaml` применяется в конце пересборки хроники (`scripts/import/chronicle-overrides.ts`). Скрипты импорта
(`scripts/import/`) запускают один раз: повторный прогон затирает ручные правки.

## Не входят в репозиторий

`raw/site`, `site`, `raw/map`, большие исходные картинки. Растр карты `raw/media/dedrel_optimized.webp` входит: из него строятся тайлы (`pnpm tiles`).

Лицензия данных — CC BY-NC 4.0, см. `NOTICE`.
