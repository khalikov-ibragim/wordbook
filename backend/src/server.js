require('dotenv').config();
const express = require('express');
const cors = require('cors');

const translateRoute = require('./routes/translate');
const entriesRoute = require('./routes/entries');
const dictionaryRoute = require('./routes/dictionary');
const { ensureDictionary } = require('../scripts/ensure-dictionary');

const app = express();

// CORS: без FRONTEND_ORIGIN в .env раньше падало на '*' (полностью открытый
// CORS) — теперь по умолчанию кросс-доменные запросы просто запрещены.
// На проде фронтенд и бэкенд идут через один и тот же домен (nginx
// проксирует /api), так что same-origin запросы работают всегда, вне
// зависимости от этой настройки — CORS вообще не про это. Задавать
// FRONTEND_ORIGIN нужно только если реально держишь фронтенд на другом
// origin (например, локальная разработка с live-server на другом порту).
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || false }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Доступ к /api закрыт nginx-ом снаружи (см. backend/nginx.conf: proxy_pass
// только на frontend-контейнер и отдельный локейшен на back за auth_basic).
// Прямой доступ к back наружу недоступен, поэтому отдельная X-API-Key-защита
// в middleware не нужна: она только рассинхронизирует CI и локаль, когда в
// .env.example попадает реальный ключ. Если когда-нибудь back начнёт
// публиковаться отдельно — включать авторизацию на уровне nginx (http_auth),
// а не в middleware приложения.

app.use('/api/translate', translateRoute);
app.use('/api/entries', entriesRoute);
app.use('/api/dictionary', dictionaryRoute);

// Общий обработчик ошибок — чтобы одна упавшая ручка не роняла процесс
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`wordbook backend слушает порт ${PORT}`);

    if (!process.env.API_KEY) {
        console.warn(
            'ВНИМАНИЕ: API_KEY не задан в .env — API открыт без авторизации. ' +
            'Если сервер доступен снаружи (через nginx на 443/80), задай API_KEY ' +
            'в backend/.env и тот же ключ во фронтенде (шестерёнка в шапке приложения).'
        );
    }

    // Автозагрузка словаря: см. docs/INFRA.md ("Данные для словаря") и
    // backend/.env.example. Не блокирует старт сервера — health-check и
    // онлайн-перевод работают сразу, а словарь донаполняется в фоне.
    // Идемпотентно: если dictionary уже не пустая, ensureDictionary() сама
    // выйдет почти мгновенно, так что флаг можно держать включённым всегда.
    if (process.env.AUTO_IMPORT_DICTIONARY === 'true') {
        ensureDictionary().catch((err) => {
            console.error('Автозагрузка словаря не удалась (сервер продолжает работать без неё):', err);
        });
    }
});
