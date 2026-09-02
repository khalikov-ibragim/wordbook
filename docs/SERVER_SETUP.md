# Настройка сервера — Wordbook (без docker)

Рассчитано на Ubuntu/Debian-подобную систему (домашний мини-сервер,
старый ноутбук, рабочая машина или дешёвый VPS — разница только в шаге
про проброс порта наружу). Дальше — по шагам.

## 1. Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # должно быть 20.x
```

## 2. PostgreSQL

```bash
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql

sudo -u postgres psql -c "CREATE USER wordbook_user WITH PASSWORD 'придумай-пароль';"
sudo -u postgres psql -c "CREATE DATABASE wordbook OWNER wordbook_user;"
```

Применить схему:

```bash
psql -U wordbook_user -d wordbook -h localhost -f backend/src/schema.sql
```

## 3. Backend

```bash
cd backend
cp .env.example .env
# открыть .env, вписать DATABASE_URL с паролем из шага 2

# Сервер будет открыт наружу через nginx — сразу сгенерируй и впиши API_KEY,
# иначе /api/* останется без авторизации (backend напомнит об этом в логе):
openssl rand -hex 24   # результат вписать в .env → API_KEY

npm install
node src/server.js   # проверка руками: curl http://localhost:3000/api/health
```

При первом запуске (если в `.env` оставлен `AUTO_IMPORT_DICTIONARY=true`,
что по умолчанию) backend сам скачает и загрузит словарь в фоне — в
логе будет видно прогресс, сервер при этом отвечает сразу, ждать
загрузки не нужно. Подробности и как отключить/перезалить — в
`docs/INFRA.md` ("Данные для словаря").

Если всё ок — держим процесс живым через systemd (переживёт перезагрузку
и упадёт — сам перезапустится):

```ini
# /etc/systemd/system/wordbook-backend.service
[Unit]
Description=Wordbook backend
After=network.target postgresql.service

[Service]
Type=simple
User=твой-пользователь
WorkingDirectory=/путь/до/wordbook/backend
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
EnvironmentFile=/путь/до/wordbook/backend/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now wordbook-backend
sudo systemctl status wordbook-backend
```

## 4. (Опционально) свой LibreTranslate вместо публичного

Публичный `libretranslate.com` работает из коробки, но с лимитами и
иногда просит платный ключ. Свой инстанс без docker ставится через pip:

```bash
sudo apt-get install -y python3-pip
pip install libretranslate --break-system-packages
libretranslate --host 127.0.0.1 --port 5001
```

(тоже стоит завернуть в systemd-сервис по аналогии с backend, если
решишь оставить его постоянно включённым — он прожорливый по памяти
из-за моделей перевода, так что на слабом домашнем сервере подумай,
нужен ли он вообще, публичного API может быть достаточно).

Если поднял — поменяй в `backend/.env`:
```
LIBRETRANSLATE_URL=http://localhost:5001/translate
```

## 5. Frontend

Статика — ничего собирать не нужно, это просто HTML/CSS/JS. Копируем
папку `frontend/` туда, откуда её будет отдавать nginx:

```bash
sudo mkdir -p /var/www/wordbook
sudo cp -r frontend/* /var/www/wordbook/
```

## 6. nginx — reverse proxy + статика

```bash
sudo apt-get install -y nginx
```

```nginx
# /etc/nginx/sites-available/wordbook
server {
    listen 80;
    server_name твой-домен-или-IP;

    root /var/www/wordbook;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/wordbook /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 7. HTTPS (нужен обязательно — PWA и service worker без HTTPS не
    установятся, кроме localhost)

Если есть свой домен:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d твой-домен
```

Certbot сам допишет конфиг nginx под 443 и настроит автопродление.

Если домена нет (чисто домашний сервер) — вариантов два:
- завести бесплатный поддомен (DuckDNS, No-IP и т.п.) и получить
  сертификат так же через certbot;
- либо использовать self-signed сертификат — тогда браузер будет ругаться
  при каждом заходе, PWA всё равно установится, но с предупреждением.

## 8. Доступ снаружи (если сервер дома, не на статике)

- Пробросить порт 443 (и 80 для certbot) на сервер в настройках роутера.
- Если провайдер даёт динамический IP — нужен DDNS-клиент (та же
  DuckDNS умеет автоматически обновлять IP).
- Если сервер стоит на работе за корпоративным NAT — обычно проще
  наоборот: заходить туда через VPN/Tailscale, а не пробрасывать порт
  наружу — вопрос политики конкретного места, тут решать на месте.

## 9. Проверка, что всё вместе работает

```bash
curl https://твой-домен/api/health          # {"ok":true}, без ключа — это единственный открытый эндпоинт
curl -X POST https://твой-домен/api/translate \
     -H "Content-Type: application/json" \
     -H "X-API-Key: тот-же-ключ-что-в-.env" \
     -d '{"text":"hello"}'
```

Дальше — открыть `https://твой-домен/` в телефоне, добавить на главный
экран («Добавить на экран Домой» / «Установить приложение») — это и
даёт PWA с офлайн-запуском. Если задавал `API_KEY` — сразу после установки
открой шестерёнку в шапке приложения и впиши тот же ключ один раз, иначе
запросы будут падать с 401.

## 10. Ежедневный бэкап (крон)

```bash
crontab -e
```
```
0 3 * * * pg_dump -U wordbook_user -h localhost wordbook > /home/твой-пользователь/backups/wordbook-$(date +\%F).sql
```

Дальше — по желанию: копировать эти дампы куда-то за пределы того же
диска (см. `INFRA.md`, раздел про бэкапы).

## 11. (Опционально) уведомления, если backend упал

```bash
crontab -e
```
```
*/5 * * * * HEALTH_URL=https://твой-домен/api/health TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... /путь/до/wordbook/backend/scripts/health-check.sh
```

Настройка бота и получение `chat_id` — в комментариях самого файла
`backend/scripts/health-check.sh`.
