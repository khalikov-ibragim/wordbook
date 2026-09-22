# Инфраструктурная памятка — Wordbook

Формат — как будто короткая внутренняя записка от дежурного инженера:
что вообще есть, что на чём крутится, каких портов живёт. Деплой —
через `docker compose` (см. `docker-compose.yaml` в корне репозитория).

## Состав системы (6 сервисов)

| сервис            | что делает                                   | образ / контейнер                  |
|--------------------|-----------------------------------------------|-------------------------------------|
| `frontend`         | PWA: ввод слова, список записей, офлайн-режим | nginx + статика (`glimpl/wordbook-frontend`), порт 80 |
| `backend`          | REST API: перевод, CRUD записей, словарь      | Node.js/Express (`glimpl/wordbook-backend`), порт 3000 |
| `bd`               | хранит `entries` и `dictionary`               | postgres:16-alpine, инициализация `schema.sql` |
| `libretranslate`   | сам перевод текста (Argos-модели)             | libretranslate/libretranslate, порт 5000 |
| `pgadmin`          | веб-консоль Postgres                          | dpage/pgadmin4, порт 4567 |
| `cloudflared`      | публичный HTTPS-туннель без проброса портов   | cloudflare/cloudflared (tunnel)     |

Схема запросов:

```
Телефон (браузер/PWA)
      │
      │  Cloudflare Tunnel (без проброса портов на роутере)
      ▼
  frontend (nginx, 80:80 внутри docker-сети)
      │
      │  статика (PWA, service worker)
      │  /api/*  → proxy_pass http://backend:3000
      ▼
  backend (Node, порт 3000, внутри docker-сети)
      │
      ├──► bd (Postgres, порт 5432, внутри docker-сети)
      │      healthcheck: pg_isready, схема через docker-entrypoint-initdb
      │
      └──► libretranslate (http://libretranslate:5000, внутри docker-сети)
```

Проброшенные наружу порты (в `docker-compose.yaml`):

| порт  | сервис / что | доступен снаружи? |
|-------|--------------|--------------------|
| 80    | frontend (nginx: статика + `/api` → backend) | через cloudflared-туннель (публичный HTTPS по домену) |
| 5000  | libretranslate | наружу (для отладки; в рабочем сценарии ходит только backend) |
| 4567  | pgadmin | наружу (веб-консоль БД; доступ закрывать после настройки) |
| 3000  | backend | нет, только внутри docker-сети (`proxy_pass http://backend:3000`) |
| 5432  | bd (Postgres) | нет, только внутри docker-сети |

Backend и Postgres слушают только внутри docker-сети — напрямую снаружи
нельзя дотянуться, только через nginx-прокси `/api` (frontend-контейнер).
Cloudflare-туннель выходит в интернет без открытия портов на роутере.

## Авторизация API

Сам nginx не мешает никому, кто узнает домен, обращаться к `/api/*`.
Поэтому backend проверяет заголовок `X-API-Key` на всех `/api/*`-запросах,
кроме `/api/health` (специально без авторизации — иначе мониторинг по
крону не смог бы его дёргать).

- Ключ задаётся в корневом `.env` → `API_KEY` (генерировать: `openssl rand -hex 24`).
- Тот же ключ нужно один раз вписать во фронтенде: шестерёнка в шапке
  приложения → «API-ключ» → сохранить. Хранится в `localStorage` браузера,
  подставляется в заголовок ко всем запросам (`app.js`, `apiFetch()`).
- Если `API_KEY` не задан — авторизация выключена (для локальной разработки
  нормально, backend при старте пишет в лог предупреждение об этом).
- CORS (`FRONTEND_ORIGIN`) — отдельный механизм и не заменяет `API_KEY`:
  CORS ограничивает, каким браузерным origin разрешено делать
  кросс-доменные запросы, а `API_KEY` — авторизация самого запроса,
  откуда бы он ни пришёл (в т.ч. curl/Postman).

## Требуемые версии / рантаймы

Всё приезжает в образах — на самом хосте нужен только docker/podman
с compose-плагином:

- **Node.js 20 LTS** — внутри `backend`-образа (backend не работает на < 18,
  нужен встроенный `fetch` в `translate.js`).
- **PostgreSQL 16** — образ `postgres:16-alpine` (используется `gin`-индекс
  по `to_tsvector`).
- **nginx** — внутри `frontend`-образа (reverse proxy + статика, ничего
  специфического не используется).
- **cloudflared** — официальный образ Cloudflare для туннеля (HTTPS без
  проброса портов).
- **LibreTranslate** — официальный образ (перевод идёт внутри docker-сети).

## Переменные окружения

Полный список — в корневом `.env.example` (копировать: `cp .env.example .env`).
Backend получает переменные через `environment` в `docker-compose.yaml`.
Коротко, что важно понимать на уровне инфраструктуры:

- `API_KEY` — ключ авторизации `/api/*` (см. раздел выше).
- `LIBRETRANSLATE_URL` — адрес LibreTranslate внутри docker-сети
  (`http://libretranslate:5000/translate`) либо публичный
  `https://libretranslate.com/translate` (есть лимиты, иногда нужен api_key).
- `FRONTEND_ORIGIN` — для CORS. При связке через nginx на одном домене
  (same-origin) можно не задавать — кросс-доменных запросов нет.
- `POSTGRES_*` — пользователь/база/пароль Postgres (используются и `bd`,
  и healthcheck).
- `DUCKDNS_TOKEN` — токен DuckDNS (для динамического DNS, если используется
  сценарий с доменом).

`.env` — только локально, в git не коммитить; коммитится `.env.example`.

## Данные для словаря

Две отдельные сущности, не путать — но наполняются они автоматически и
из одного источника:

- **Серверный словарь** (`dictionary` в Postgres) — большой, все слова
  из источника целиком.
- **Офлайн-словарь на устройстве** (IndexedDB во фронтенде) — по объёму
  сильно меньше: первые N слов на каждый файл-источник (источник уже
  отсортирован по частотности), не гигабайты — браузеры сами ограничивают,
  сколько сайт может закэшировать.

### Автозагрузка (как это работает)

1. `backend/scripts/fetch-source-dictionary.js` скачивает исходные TSV-файлы
   по `DICTIONARY_SOURCE_BASE_URL` (см. `.env.example`) и строит из них:
   `data/dictionary-{ru-en,en-ru}.csv` (для Postgres) и
   `data/device-bundle-{ru-en,en-ru}.json` (для устройства, обрезано по
   `DEVICE_BUNDLE_LIMIT_PER_FILE`).
2. `backend/scripts/ensure-dictionary.js` — если `dictionary` в Postgres
   пустая, вызывает шаг 1, затем грузит оба CSV через
   `import-dictionary.js`. Идемпотентно: если словарь уже наполнен —
   ничего не делает. Вызывается автоматически при каждом старте backend
   (`server.js`), если `AUTO_IMPORT_DICTIONARY=true`.
3. Фронтенд (`app.js`, `ensureOfflineDictionary()`) при первом запуске
   приложения сам забирает `GET /api/dictionary/device-bundle?pair=...`
   и наполняет IndexedDB — без действий пользователя.

Ручной запуск (если нужно пересобрать/перезалить):
```bash
cd backend
npm run fetch-dictionary     # только скачать и собрать CSV/JSON в data/
npm run ensure-dictionary    # то же + сразу залить в Postgres
node scripts/ensure-dictionary.js --force   # перезалить, даже если dictionary не пустая
```

### Источник данных и атрибуция

По умолчанию — открытые данные проекта **OpenRussian.org**
(репозиторий [`Badeststrand/russian-dictionary`](https://github.com/Badeststrand/russian-dictionary)
на GitHub), лицензия **CC BY-SA 4.0**. Это значит: при публичном
использовании нужно упомянуть источник (OpenRussian.org / Badeststrand) и
лицензию, а если делишься производным набором данных дальше — под той же
лицензией. Для личного/некоммерческого использования (как этот проект)
это просто вопрос указать источник где-нибудь в README/о проекте — юридических
рисков для личного разворачивания нет.

Можно заменить на любой другой источник в том же формате (TSV с колонками
`bare` и `translations_en`), поменяв `DICTIONARY_SOURCE_BASE_URL` /
`DICTIONARY_SOURCE_FILES` в `.env` — скрипту всё равно, откуда файлы,
главное совпадает формат колонок.

## Бэкапы (раз ты берёшь девопс на себя — что стоит не забыть)

- Единственные данные, которые жалко потерять, — таблица `entries`
  (твой личный журнал слов). `dictionary` в теории всегда можно
  перезалить заново из исходного CSV.
- Данные Postgres живут в docker-томе `postgres_data` (см. `volumes` в
  `docker-compose.yaml`). Переживают `docker compose down`, теряются при
  `docker compose down -v` (не делать на проде без бэкапа).
- Минимально достаточно: `pg_dump` по крону раз в день, хранить
  последние 7-14 копий локально + желательно куда-то ещё за пределы
  того же диска (второй диск / облако / хотя бы на ноутбук вручную
  время от времени).

## Мониторинг (минимум, без отдельного стека)

Для личного проекта такого масштаба разворачивать Prometheus/Grafana —
избыточно. Достаточно:

- `GET /api/health` на backend — простой health-check. В репозитории уже
  есть готовый скрипт `backend/scripts/health-check.sh`: дёргает health по
  крону и шлёт уведомление в Telegram-бота, если не 200. Настройка (токен
  бота, chat_id) и пример строки для crontab — в комментариях самого файла.
- `docker compose logs backend` — для логов и падений (или
  `docker compose ps` для текущего состояния).
- `df -h` время от времени — Postgres и логи nginx со временем растут.