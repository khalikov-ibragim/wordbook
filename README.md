# Wordbook

Личный PWA-словарь (EN↔RU) с офлайн-поддержкой, серверным словарём в PostgreSQL и опциональным онлайн-переводом через LibreTranslate.

Проект поддерживает два режима запуска:
- **Docker/Podman Compose** — для локальной разработки и быстрого старта;
- **Kubernetes (k3s) + Helm** — основной режим развёртывания, чарт лежит в `charts/`.

## Возможности

- **PWA** — устанавливается на телефон/десктоп, работает офлайн.
- **IndexedDB** — локальное хранение записей и очередь синхронизации.
- **Перевод по цепочке**: онлайн (LibreTranslate) → серверный словарь PostgreSQL → офлайн-словарь устройства → ручной ввод.
- **PostgreSQL** — хранение записей и серверного словаря.
- **LibreTranslate** — self-hosted перевод (Argos-модели).
- **Cloudflare Tunnel** — публичный HTTPS-доступ без проброса портов (в compose/k8s-манифестах).
- **Helm-чарт** — деплой в k3s с ConfigMap/Secret/PVC/HPA/Service.

## Стек

| Слой | Технология |
|------|------------|
| Frontend | Vanilla JS, PWA (Service Worker + Manifest), IndexedDB, Nginx |
| Backend | Node.js, Express, PostgreSQL |
| Перевод | LibreTranslate (self-hosted) + словарь в Postgres + офлайн-бандл на устройстве |
| База данных | PostgreSQL 16 |
| Инфраструктура | Docker Compose, Kubernetes (k3s), Helm |
| CI/CD | GitHub Actions, Docker Hub, kubeconform, Helm deploy |

## Структура репозитория

```text
.
├── backend/                  # Node.js/Express API, скрипты словаря, Dockerfile
├── frontend/                 # PWA: HTML/CSS/JS, nginx.conf, Dockerfile
├── charts/                   # Helm-чарт для k3s
│   ├── Chart.yaml
│   ├── values.yaml
│   ├── values-secrets.example.yaml
│   └── templates/
├── docs/                     # Инфраструктура, логика, настройка сервера
├── .github/workflows/ci.yml  # lint + compose-тесты + push + helm deploy
├── docker-compose.yaml       # Локальный/dev запуск
├── .env.example              # Пример env для Docker Compose
└── README.md
```

## Быстрый старт (Docker Compose)

```bash
# 1. Клонировать
git clone https://github.com/khalikov-ibragim/wordbook.git
cd wordbook

# 2. Подготовить env
cp .env.example .env
# Отредактируй .env под свои значения

# 3. Запустить
docker compose up -d

# 4. Проверить
docker compose ps
curl http://localhost:3000/api/health
```

После запуска:
- Frontend: `http://localhost:8080`
- Backend API: `http://localhost:3000/api/health`
- pgAdmin: `http://localhost:4567`
- LibreTranslate: `http://localhost:5000`

> Порты и имена сервисов соответствуют `docker-compose.yaml`. В Helm/k3s используются NodePort/ClusterIP из `charts/values.yaml`.

## Развёртывание в Kubernetes (Helm)

Чарт находится в `charts/`. Перед установкой подготовь файл со секретами по образцу:

```bash
cp charts/values-secrets.example.yaml charts/values-secrets.yaml
# Заполни реальные значения
```

Установка/обновление:

```bash
helm upgrade --install wordbook ./charts \
  --namespace wordbook --create-namespace \
  -f ./charts/values.yaml \
  -f ./charts/values-secrets.yaml
```

Полезные проверки:

```bash
helm lint ./charts -f ./charts/values.yaml
helm template wordbook ./charts -f ./charts/values.yaml -f ./charts/values-secrets.yaml | kubeconform -strict -summary
kubectl get pods,svc,pvc -n wordbook
```

## Переменные окружения

### Docker Compose

Источник: `.env.example`. Ключевые переменные:

| Переменная | Назначение |
|------------|------------|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Подключение backend к PostgreSQL |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Инициализация контейнера PostgreSQL |
| `LIBRETRANSLATE_URL` | URL LibreTranslate, например `http://wordbook-libretranslate:5000/translate` |
| `LT_LOAD_ONLY` | Языковые пары для LibreTranslate, например `en,ru` |
| `FRONTEND_ORIGIN` | CORS-origin фронтенда (для same-origin через nginx обычно не нужен) |
| `AUTO_IMPORT_DICTIONARY` | Автозагрузка словаря при старте backend |
| `DICTIONARY_SOURCE_*`, `DEVICE_BUNDLE_LIMIT_PER_FILE` | Настройки источника и размера офлайн-бандла |
| `PGADMIN_DEFAULT_EMAIL`, `PGADMIN_DEFAULT_PASSWORD` | Доступ к pgAdmin |

### Helm

Секреты передаются через `charts/values-secrets.yaml` (см. `charts/values-secrets.example.yaml`) и рендерятся в Kubernetes Secret. В CI реальный файл создаётся из GitHub Secret во временной директории `$RUNNER_TEMP` и не коммитится.

## CI/CD

Workflow: `.github/workflows/ci.yml`.

| Job | Что делает |
|-----|------------|
| `lint` | hadolint для Dockerfile, yamllint для compose, shellcheck, helm lint + kubeconform |
| `basic` | Сборка compose, запуск, ожидание `/api/health`, Python-тест, push образов в Docker Hub с `latest` и `${GITHUB_SHA::7}` |
| `deploy` | Деплой в k3s через Helm (`helm upgrade --install`, `--wait`, `--rollback-on-failure`) |

Для deploy используются GitHub Secrets: `KUBE_CONFIG_DATA`, `WORDBOOK_SECRETS`, `DOCKER_USERNAME`, `DOCKER_PASSWORD`.

## Документация

- [`docs/INFRA.md`](docs/INFRA.md) — инфраструктура, сервисы, порты, env, данные, бэкапы.
- [`docs/LOGIC.md`](docs/LOGIC.md) — логика перевода, статусы записей, синхронизация.
- [`docs/SERVER_SETUP.md`](docs/SERVER_SETUP.md) — запуск локально, в Compose и через Helm/k3s.

## Лицензия/данные

Данные словаря по умолчанию берутся из [OpenRussian.org / Badestrand/russian-dictionary](https://github.com/Badestrand/russian-dictionary), лицензия CC BY-SA 4.0. При публичном использовании нужна атрибуция.
