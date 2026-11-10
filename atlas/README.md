# Атлас Дедрела

Интерактивная карта мира Дедрел: хронология с 1200 г. до н. э. по 1006 г., границы государств по годам, досье мест, людей
и организаций, тематические слои, маршруты, сценарии и режим мастера. Данные — по материалам вики https://dedrel.teo.uy.

## Быстрый старт

Нужны Node 22+ и pnpm 10.

```bash
pnpm install
pnpm dev            # http://localhost:5173
```

## Команды

| Команда                    | Что делает                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm dev`                 | сервер разработки                                                                                 |
| `pnpm build`               | собирает мастер-данные, проверяет типы, собирает `dist/`                                          |
| `pnpm preview`             | раздаёт `dist/`                                                                                   |
| `pnpm test`                | модульные тесты (vitest)                                                                          |
| `pnpm validate`            | проверка данных: схемы, ссылки, геометрия (ссылки на страницы вики сверяются с `data/site/pages.json`, в репозиторий системы он не входит, без него проверка сообщает об ошибках ссылок) |
| `pnpm lint`, `pnpm format` | eslint, prettier                                                                                  |
| `pnpm typecheck`           | tsc для `src` и для скриптов                                                                      |
| `pnpm e2e`                 | сквозные тесты Playwright на собранном `dist` (один раз: `pnpm exec playwright install chromium`) |
| `pnpm check`               | typecheck + lint + test + validate                                                                |
| `pnpm dev:api`             | локальный сервер мастер-режима (переменные из `.env.local`, см. `.env.example`)                   |

## Тайлы карты

Растровые тайлы в репозиторий не входят. Собрать их из `data/raw/media/dedrel_optimized.webp`:

```bash
pip install -r scripts/geo/requirements.txt
pnpm tiles          # public/tiles/{drawn,muted}/z/x/y.webp
```

## Запуск внутри Foundry

Атлас лежит в системе как папка `atlas/` (`Data/systems/dedrel/atlas`). Нужны Node 22+, pnpm 10, Python 3 и Pillow (для тайлов):

```bash
cd atlas
pnpm install
pnpm tiles                  # растровые тайлы из data/raw/media, см. выше
VITE_MASTER=off pnpm build  # собирает atlas/dist, тайлы копируются в dist/tiles
```

`VITE_MASTER=off` отключает режим мастера (серверной части в Foundry нет). Сборка использует относительные пути, поэтому
работает из `systems/dedrel/atlas/dist/index.html`. Затем в мире откройте журнал «Атлас мира» из компендиума *Rules*:
его страница ссылается на этот файл.

## Деплой на Vercel

Проект с `rootDirectory = atlas`. Переменные окружения: `MASTER_PASSWORD` (пароль мастера) и `MASTER_SECRET` (отдельный
секрет подписи сессии). Команда сборки и каталог вывода заданы в `vercel.json`.

## Документация

- `docs/architecture.md` — устройство кода
- `docs/scripts.md`, `scripts/README.md` — скрипты
- `data/README.md` — наборы данных
- `docs/PLAN.md`, `docs/decisions.md`, `docs/layers.md`, `docs/errata.md` — план, решения, реестр слоёв, расхождения вики и карты

## Лицензии

Код — MIT. Данные, растровая карта и гербы — CC BY-NC 4.0 (источник — вики dedrel.teo.uy). Значки — game-icons.net, CC BY 3.0.
Шрифты — SIL OFL 1.1. Подробности — в `NOTICE`.
