# Настройка сервера — Wordbook (docker compose)

Деплой через `docker compose` прямо из репозитория. Всё необходимое
(nginx, Node, PostgreSQL, LibreTranslate, pgAdmin, Cloudflare-туннель)
живёт в образах — на хосте нужен только docker/podman с compose-плагином.

## 1. Что нужно на хосте

- Linux (Ubuntu/Debian и подобные — как настройка самого docker, так и
  rest сервисов в контейнерах не зависят от конкретной ОС).
- docker с compose-плагином **или** podman + podman-compose.
- Доступ к интернету (docker pull образов).
- (Опционально) домен/DuckDNS для публичного доступа через туннель.

Проверка:
```bash
docker compose version    # или podman-compose --version
```

## 2. Клонировать репозиторий

```bash
git clone https://github.com/khalikov-ibragim/wordbook.git
cd wordbook
```

## 3. Настроить окружение

```bash
cp .env.example .env
# открыть .env, вписать свои значения (пароли Postgres, API_KEY, и т.д.)
```

Сразу сгенерируй и впиши `API_KEY` (сервер будет открыт через туннель —
без ключа `/api/*` останется без авторизации, backend напомнит в логе):

```bash
openssl rand -hex 24   # результат вписать в .env → API_KEY
```

## 4. Запустить

```bash
docker compose up -d          # или podman-compose up -d
docker compose ps             # все контейнеры healthy?
```

При первом старте:
- `bd` разворачивает схему из `backend/src/schema.sql`
  (`docker-entrypoint-initdb.d`);
- если в `.env` оставлен `AUTO_IMPORT_DICTIONARY=true` (по умолчанию),
  backend сам скачает и загрузит словарь в фоне — в логе будет виден
  прогресс, сервер при этом отвечает сразу, ждать не нужно. Подробнее —
  в `docs/INFRA.md` («Данные для словаря»).

Проверка руками:
```bash
docker compose logs backend      # живой ли, что пишет
curl http://localhost:80/api/health   # через frontend-nginx, без ключа (единственный открытый эндпоинт)
curl -X POST http://localhost:80/api/translate \
     -H "Content-Type: application/json" \
     -H "X-API-Key: тот-же-ключ-что-в-.env" \
     -d '{"text":"hello"}'
```

Замечание: frontend-nginx слушает порт 80 на хосте; внутри docker-сети он
проксирует `/api` на `backend:3000`.

## 5. Перезапуск / обновления

```bash
docker compose down       # остановить (тома с данными сохраняются)
docker compose up -d      # поднять снова / подтянуть новые образы
docker compose pull && docker compose up -d   # обновить до последних образов
```

Никогда не делай `docker compose down -v` на истории/проде — удалит том
`postgres_data` вместе с записями (см. раздел про бэкапы в `INFRA.md`).

## 6. Публичный доступ (HTTPS без проброса портов)

По умолчанию доступ открывается через **Cloudflare Tunnel**: сервис
`cloudflared` в `docker-compose.yaml` проксирует запросы на контейнер
`frontend` (nginx, порт 80). Порт 80 на роутере пробрасывать не нужно.

Туннель — двусторонний: машина сама устанавливает исходящее соединение
с облаком Cloudflare, поэтому порты наружу открывать не требуется.
Настройка домена, привязанного к туннелю, — в процессе настройки самого
cloudflared (вне этого репозитория).

Локально проект отвечает на `http://localhost` (порт 80).

Альтернативный вариант (традиционный, с пробросом 443/80): frontend-nginx
проксирует `/api` на backend, внешний DNS и Let's Encrypt настраиваются
на хосте — но при использовании туннеля это не нужно.

## 7. Проверка, что всё вместе работает

```bash
curl http://localhost:80/api/health       # {"ok":true}
curl -X POST http://localhost:80/api/translate \
     -H "Content-Type: application/json" \
     -H "X-API-Key: тот-же-ключ-что-в-.env" \
     -d '{"text":"hello"}'
```

Дальше — открыть `https://твой-домен/` в телефоне, добавить на главный
экран («Добавить на экран Домой» / «Установить приложение») — это и
даёт PWA с офлайн-запуском. Если задавал `API_KEY` — сразу после установки
открой шестерёнку в шапке приложения и впиши тот же ключ один раз, иначе
запросы будут падать с 401.

## 8. Ежедневный бэкап (крон)

Данные в docker-томе `postgres_data` — дампим через контейнер `bd`:

```bash
crontab -e
```
```
0 3 * * * docker compose -f /путь/до/wordbook/docker-compose.yaml exec -T bd pg_dump -U ${POSTGRES_USER} ${POSTGRES_NAME} > /home/твой-пользователь/backups/wordbook-$(date +\%F).sql
```

Дальше — по желанию: копировать эти дампы куда-то за пределы того же
диска (см. `INFRA.md`, раздел про бэкапы).

## 9. (Опционально) уведомления, если backend упал

```bash
crontab -e
```
```
*/5 * * * * HEALTH_URL=http://localhost:80/api/health TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... /путь/до/wordbook/backend/scripts/health-check.sh
```

Настройка бота и получение `chat_id` — в комментариях самого файла
`backend/scripts/health-check.sh`.

## 10. Общие операции

```bash
docker compose up -d          # запустить всё
docker compose ps             # статус всех контейнеров
docker compose logs -f backend   # логи backend вживую
docker compose pull           # подтянуть свежие образы
docker compose down           # остановить и убрать сеть (данные сохраняются)
```