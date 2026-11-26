# Настройка и запуск — Wordbook

Документ описывает текущие способы запуска проекта: локально через Docker/Podman Compose и деплой в k3s через Helm.

## 1. Предварительные требования

### Для Docker Compose

- Linux/macOS/WSL с Docker Engine + Compose plugin (или Podman + podman-compose).
- Доступ в интернет для pull/build образов.
- Свободные порты `8080`, `3000`, `5000`, `4567` или возможность поменять маппинг.

Проверка:

```bash
docker compose version
# или
podman-compose --version
```

### Для k3s + Helm

- Доступный Kubernetes-кластер (k3s).
- `kubectl`, настроенный на нужный кластер.
- `helm`.
- Доступ к образам в Docker Hub или свой registry.
- Файл секретов, подготовленный по `charts/values-secrets.example.yaml`.

## 2. Локальный запуск через Docker Compose

### Клонирование и env

```bash
git clone https://github.com/khalikov-ibragim/wordbook.git
cd wordbook
cp .env.example .env
```

Отредактируй `.env`: как минимум проверь пароли Postgres/pgAdmin, `CLOUDFLARE_TUNNEL_TOKEN` (если нужен tunnel), `LIBRETRANSLATE_URL`, `FRONTEND_ORIGIN`.

### Запуск

```bash
docker compose up -d --build
docker compose ps
```

### Проверка

```bash
curl http://localhost:8080/api/health
curl http://localhost:3000/api/health
docker compose logs -f wordbook-backend
```

Полезные URL:

- Frontend/PWA: `http://localhost:8080`
- Backend API: `http://localhost:3000`
- LibreTranslate: `http://localhost:5000`
- pgAdmin: `http://localhost:4567`

### Первый старт

- PostgreSQL инициализируется с volume `db_data`.
- При `AUTO_IMPORT_DICTIONARY=true` backend может автоматически скачать/загрузить словарь.
- LibreTranslate при первом старте может долго инициализировать модели; до готовности онлайн-перевод может быть недоступен, backend будет использовать fallback по цепочке из `docs/LOGIC.md`.

## 3. Обычные операции Compose

```bash
# Запуск
docker compose up -d

# Пересборка
docker compose up -d --build

# Логи
docker compose logs -f wordbook-backend
docker compose logs -f wordbook-libretranslate

# Остановка
docker compose down

# Обновить образы и поднять
docker compose pull
docker compose up -d
```

Осторожно: `docker compose down -v` удалит volumes (`db_data`, `libretranslate`) и данные.

## 4. Деплой в k3s через Helm

Чарт находится в `charts/`.

### Подготовка секретов

```bash
cp charts/values-secrets.example.yaml charts/values-secrets.yaml
# Заполни реальные значения
```

`charts/values-secrets.yaml` не коммитить. Проверь `.gitignore`/статус git перед push.

### Установка или обновление

```bash
helm upgrade --install wordbook ./charts \
  --namespace wordbook --create-namespace \
  -f ./charts/values.yaml \
  -f ./charts/values-secrets.yaml
```

Проверка перед деплоем:

```bash
helm lint ./charts -f ./charts/values.yaml
helm template wordbook ./charts \
  -f ./charts/values.yaml \
  -f ./charts/values-secrets.yaml | kubeconform -strict -summary -
```

### Проверка после деплоя

```bash
kubectl get pods,svc,pvc -n wordbook
kubectl logs -n wordbook deploy/wordbook-backend --tail=100
kubectl logs -n wordbook deploy/wordbook-libretranslate --tail=100
curl http://<NODE_IP>:30099/api/health
```

> `30099` — NodePort frontend из `charts/values.yaml`. Backend в чарте по умолчанию ClusterIP.

## 5. CI/CD деплой

GitHub Actions workflow: `.github/workflows/ci.yml`.

Текущие jobs:

- `lint` — Dockerfile/compose/shell/Helm checks.
- `basic` — compose smoke test, Python test, push образов в Docker Hub.
- `deploy` — Helm deploy в k3s.

Нужные GitHub Secrets:

| Secret | Назначение |
|--------|------------|
| `DOCKER_USERNAME`, `DOCKER_PASSWORD` | Push образов в Docker Hub |
| `KUBE_CONFIG_DATA` | kubeconfig для доступа к кластеру |
| `WORDBOOK_SECRETS` | Содержимое `values-secrets.yaml` |

Рекомендованный паттерн для секретов в CI: писать файл в `$RUNNER_TEMP`, ставить `umask 077`, передавать в Helm через `-f`, удалять в `if: always()`.

## 6. Cloudflare Tunnel

В проекте есть Cloudflare Tunnel и в Compose, и в Helm values.

- **Compose**: сервис `cloudflare`, использует `CLOUDFLARE_TUNNEL_TOKEN` из `.env`.
- **Helm**: deployment `cloudflare`, command в `charts/values.yaml` сейчас `tunnel --no-autoupdate run`.

Перед использованием проверь, что command/args совместимы с образом `cloudflare/cloudflared` и что tunnel настроен на нужный внутренний сервис (обычно frontend/nginx).

## 7. Бэкапы

Критичные данные — PostgreSQL volume/PVC с таблицей `entries`.

Пример для Compose:

```bash
mkdir -p ~/backups
docker compose exec -T wordbook-bd pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > ~/backups/wordbook-$(date +%F).sql
```

Для cron лучше использовать абсолютные пути и явно указать путь к compose-файлу. Копии хранить не только на том же диске.

## 8. Диагностика

```bash
# Compose
docker compose ps
docker compose logs --tail=100 wordbook-backend
docker compose logs --tail=100 wordbook-bd
docker compose logs --tail=100 wordbook-libretranslate

# k3s
kubectl get pods -n wordbook
kubectl describe pod -n wordbook <pod-name>
kubectl logs -n wordbook deploy/wordbook-backend --tail=100
kubectl get events -n wordbook --sort-by=.lastTimestamp | tail -30
```

Если backend отвечает, но перевод работает только как “словарь сервера”, проверяй доступность LibreTranslate по `LIBRETRANSLATE_URL` и логи `wordbook-libretranslate`.
