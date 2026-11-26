# Инфраструктурная памятка — Wordbook

Короткая внутренняя записка: что есть в проекте, как сервисы связаны, где что запускается, какие порты/env используются.

Проект поддерживает два режима:

- **Docker/Podman Compose** — локальная разработка и быстрый запуск (`docker-compose.yaml`).
- **Kubernetes (k3s) + Helm** — основной режим деплоя (`charts/`).

## Состав системы

| Сервис | Роль | Compose | Helm/k3s |
|--------|------|---------|----------|
| `wordbook-frontend` / `frontend` | PWA + Nginx, статика, прокси `/api` | контейнер `glimpl/wordbook-frontend`, порт `8080:80` | Deployment, Service `NodePort` `8080 -> 30099`, nginx ConfigMap |
| `wordbook-backend` / `backend` | REST API: перевод, записи, словарь, health | контейнер `glimpl/wordbook-backend`, порт `3000:3000` | Deployment, Service `ClusterIP` `3000` |
| `wordbook-bd` / `bd` | PostgreSQL, таблицы `entries` и `dictionary` | `postgres:16-alpine`, порт только внутри сети, volume `db_data` | Deployment/Service `ClusterIP` `5432`, PVC `5Gi` |
| `wordbook-libretranslate` / `libretranslate` | Self-hosted перевод (Argos) | `libretranslate/libretranslate`, порт `5000:5000`, volume `libretranslate` | Deployment/Service `ClusterIP` `5000`, PVC `10Gi` |
| `wordbook-pgadmin` / `pgadmin` | Веб-консоль PostgreSQL | `dpage/pgadmin4`, порт `4567:80` | Deployment, Service `NodePort` `4567 -> 30100` |
| `cloudflare` / `cloudflared` | Публичный HTTPS-туннель | `cloudflare/cloudflared:latest`, token из env | Deployment, без Service, command `tunnel --no-autoupdate run` |

> В Helm имена Kubernetes-ресурсов формируются через шаблоны чарта (`wordbook.fullname`), обычно получаются `wordbook-frontend`, `wordbook-backend` и т.д.

## Схема запросов

```text
Браузер / PWA
    │
    ├─ Compose: http://localhost:8080
    │     └─ frontend nginx
    │           ├─ статика PWA
    │           └─ /api/* -> http://wordbook-backend:3000
    │
    └─ k3s: NodePort/Ingress/Tunnel (в зависимости от настройки)
          └─ frontend nginx
                ├─ статика PWA
                └─ /api/* -> http://wordbook-backend:3000

backend
  ├─ PostgreSQL (bd): entries + dictionary
  └─ LibreTranslate: /translate
```

Внутри docker/k8s-сети backend и PostgreSQL обычно не публикуются наружу напрямую; наружу отдаётся frontend/nginx. В compose для отладки также проброшены `3000`, `5000`, `4567`.

## Порты

### Docker Compose

| Порт хоста | Сервис | Назначение |
|------------|--------|------------|
| `8080` | `wordbook-frontend` | Веб-интерфейс PWA |
| `3000` | `wordbook-backend` | API напрямую (удобно для локальной отладки) |
| `5000` | `wordbook-libretranslate` | LibreTranslate напрямую (отладка) |
| `4567` | `wordbook-pgadmin` | pgAdmin |
| `5432` | `wordbook-bd` | Только внутри docker-сети |

### Helm/k3s (`charts/values.yaml`)

| Сервис | Service type | Port | NodePort/Target |
|--------|--------------|------|-----------------|
| frontend | NodePort | `8080` | nodePort `30099`, container `80` |
| backend | ClusterIP | `3000` | target `3000` |
| bd | ClusterIP | `5432` | target `5432` |
| libretranslate | ClusterIP | `5000` | target `5000` |
| pgadmin | NodePort | `4567` | nodePort `30100`, target `80` |
| cloudflare | нет | — | запускает `cloudflared tunnel --no-autoupdate run` |

## Конфигурация и секреты

### Docker Compose

- Шаблон: `.env.example` → копируется в `.env`.
- `.env` не коммитится.
- Backend получает переменные через `environment:` в `docker-compose.yaml`.

Ключевые переменные:

| Переменная | Назначение |
|------------|------------|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Подключение backend к PostgreSQL |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Инициализация контейнера PostgreSQL |
| `DATABASE_URL` | Строка подключения (если используется) |
| `LIBRETRANSLATE_URL` | URL перевода, обычно `http://wordbook-libretranslate:5000/translate` |
| `LIBRETRANSLATE_API_KEY` | API key для внешнего LibreTranslate, если нужен |
| `LT_LOAD_ONLY` | Языки/модели LibreTranslate, например `en,ru` |
| `FRONTEND_ORIGIN` | CORS-origin; при same-origin через nginx обычно не нужен |
| `AUTO_IMPORT_DICTIONARY` | Автозагрузка словаря при старте backend |
| `DICTIONARY_SOURCE_BASE_URL`, `DICTIONARY_SOURCE_FILES` | Источник словаря |
| `DEVICE_BUNDLE_LIMIT_PER_FILE` | Размер офлайн-бандла для устройства |
| `PGADMIN_DEFAULT_EMAIL`, `PGADMIN_DEFAULT_PASSWORD` | Доступ к pgAdmin |
| `CLOUDFLARE_TUNNEL_TOKEN` | Токен Cloudflare Tunnel для compose-сервиса `cloudflare` |

### Helm/k3s

- Шаблон: `charts/values-secrets.example.yaml` → локальный `charts/values-secrets.yaml`.
- Реальные секреты не коммитятся.
- В CI секрет берётся из GitHub Secret `WORDBOOK_SECRETS`, записывается во временный файл в `$RUNNER_TEMP` и передаётся в Helm через `-f`.

Секреты рендерятся в Kubernetes Secret (`wordbook-secrets`) и подключаются через `envFrom` там, где это указано в `values.yaml`.

## Данные и хранилища

### PostgreSQL

- Основные данные: таблица `entries` (личные записи) и `dictionary` (серверный словарь).
- В Compose данные живут в named volume `db_data`.
- В Helm используется PVC `wordbook-bd` (по умолчанию 5Gi, `local-path`).
- `dictionary` можно пересобрать/перезалить; `entries` — пользовательские данные, их терять нежелательно.

### LibreTranslate

- В Compose: volume `libretranslate` монтируется в `/home/libretranslate/.local/share/argos-translate`.
- В Helm: PVC `wordbook-libretranslate` (10Gi по умолчанию).
- Первый старт может быть долгим из-за загрузки/инициализации моделей.

## Словарь и офлайн-бандл

Логика словаря описана в [`LOGIC.md`](./LOGIC.md), инфраструктурно важно:

- `backend/scripts/fetch-source-dictionary.js` — скачивает/собирает исходные данные.
- `backend/scripts/ensure-dictionary.js` — при старте backend проверяет, нужно ли наполнить `dictionary`.
- `AUTO_IMPORT_DICTIONARY=true` — включает автозагрузку.
- Фронтенд может забирать device-bundle через API и складывать в IndexedDB.

Источник по умолчанию — OpenRussian.org / Badestrand/russian-dictionary (CC BY-SA 4.0). При публичном использовании нужна атрибуция.

## CI/CD

Workflow: `.github/workflows/ci.yml`.

| Job | Триггер/зависимости | Что делает |
|-----|---------------------|------------|
| `lint` | push в `main` | hadolint Dockerfile, yamllint compose, shellcheck, установка Helm/kubeconform, `helm lint`, `helm template | kubeconform` |
| `basic` | после `lint` | `docker compose up -d --build`, ожидание `/api/health`, запуск Python-теста, push образов backend/frontend в Docker Hub (`latest` и `${GITHUB_SHA::7}`) |
| `deploy` | после `basic` | настройка kubeconfig, создание временного `values-secrets.yaml`, `helm upgrade --install ... --wait --rollback-on-failure`, cleanup |

GitHub Secrets, используемые workflow: `DOCKER_USERNAME`, `DOCKER_PASSWORD`, `KUBE_CONFIG_DATA`, `WORDBOOK_SECRETS`.

## Бэкапы и эксплуатация

Минимум для pet-проекта:

- **Бэкапить `entries`**. `dictionary` можно восстановить автозагрузкой/скриптами.
- Для Compose: `pg_dump` по cron из контейнера `wordbook-bd`.
- Для k3s: `kubectl exec`/job/cron с `pg_dump` и хранение дампов вне тома.
- Не делать `docker compose down -v` и не удалять PVC без бэкапа.

Полезные проверки:

```bash
# Compose
docker compose ps
docker compose logs -f wordbook-backend
curl http://localhost:8080/api/health

# k3s
kubectl get pods,svc,pvc -n wordbook
kubectl logs -n wordbook deploy/wordbook-backend --tail=100
kubectl logs -n wordbook deploy/wordbook-libretranslate --tail=100
```
