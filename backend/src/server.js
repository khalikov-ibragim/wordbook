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

// Простая проверка API-ключа. Личный проект, сервер открыт наружу через
// nginx — без этого кто угодно, кто узнает домен, мог бы читать/удалять
// записи. Health-check намеренно выше этой строки и без ключа: cron/
// мониторинг должен уметь проверять "жив ли процесс" без секрета.
//
// Если API_KEY не задан в .env — middleware пропускает всё как раньше
// (чтобы не сломать локальную разработку из коробки), но громко
// предупреждает при старте, см. ниже.
app.use('/api', (req, res, next) => {
    const expectedKey = process.env.API_KEY;
    if (!expectedKey) return next(); // авторизация выключена — см. предупреждение при старте

    const providedKey = req.get('X-API-Key');
    if (providedKey && providedKey === expectedKey) return next();

    res.status(401).json({ error: 'Неверный или отсутствующий X-API-Key' });
});

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
