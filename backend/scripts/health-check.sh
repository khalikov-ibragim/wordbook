#!/usr/bin/env bash
# Простой health-check для крона: дёргает GET /api/health и, если ответ
# не 200, шлёт уведомление в Telegram. Без внешних зависимостей — только
# curl, который на любом Ubuntu/Debian есть из коробки.
#
# Настройка:
#   1. Создать бота через @BotFather в Telegram, получить токен.
#   2. Узнать свой chat_id (например, написать боту и открыть
#      https://api.telegram.org/bot<TOKEN>/getUpdates — id будет в ответе).
#   3. Прописать три переменные ниже (или вынести их в отдельный
#      health-check.env и подключить через `source`, если не хочется
#      хранить токен прямо в этом файле).
#   4. Добавить в crontab (проверка раз в 5 минут):
#        crontab -e
#        */5 * * * * /путь/до/wordbook/backend/scripts/health-check.sh
#
# Намеренно не требует X-API-Key: /api/health — единственный эндпоинт,
# который сервер отвечает без авторизации (см. server.js), специально
# для мониторинга.

set -euo pipefail

# --- настройки ---
HEALTH_URL="${HEALTH_URL:-https://твой-домен/api/health}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"
# -----------------

status_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$HEALTH_URL" || echo "000")

if [ "$status_code" = "200" ]; then
    exit 0
fi

message="⚠️ Wordbook backend не отвечает (HTTP ${status_code}) — ${HEALTH_URL}"
echo "$message" >&2

if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        -d chat_id="${TELEGRAM_CHAT_ID}" \
        -d text="${message}" > /dev/null
else
    echo "TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID не заданы — уведомление только в лог (см. journalctl/cron mail)." >&2
fi

exit 1
