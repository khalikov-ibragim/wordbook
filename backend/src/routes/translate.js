const express = require('express');
const { pool } = require('../db');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Грубое определение языка по наличию кириллицы
function detectLang(text) {
    const hasCyrillic = /[а-яёА-ЯЁ]/.test(text);
    return hasCyrillic ? 'ru' : 'en';
}

function isSingleWord(text) {
    return text.trim().split(/\s+/).length === 1;
}

async function translateOnline(text, source, target) {
    const url = process.env.LIBRETRANSLATE_URL;
    const body = {
        q: text,
        source,
        target,
        format: 'text',
    };
    if (process.env.LIBRETRANSLATE_API_KEY) {
        body.api_key = process.env.LIBRETRANSLATE_API_KEY;
    }

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        // короткий таймаут, чтобы не подвешивать запрос при плохой сети
        signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
        throw new Error(`LibreTranslate вернул статус ${res.status}`);
    }

    const data = await res.json();
    if (!data.translatedText) {
        throw new Error('LibreTranslate не вернул translatedText');
    }
    return data.translatedText;
}

async function translateFromServerDict(text, source, target) {
    const langPair = `${source}-${target}`;
    const { rows } = await pool.query(
        'SELECT translation FROM dictionary WHERE word = $1 AND lang_pair = $2 LIMIT 1',
        [text.trim().toLowerCase(), langPair]
    );
    return rows[0]?.translation ?? null;
}

// POST /api/translate  { text, source?, target? }
router.post('/', asyncHandler(async (req, res) => {
    const { text } = req.body;
    if (typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'Поле text обязательно и должно быть строкой' });
    }

    const source = req.body.source || detectLang(text);
    const target = req.body.target || (source === 'ru' ? 'en' : 'ru');

    // 1. Онлайн-перевод
    try {
        const translatedText = await translateOnline(text, source, target);

        // кэшируем только отдельные слова в серверный словарь
        if (isSingleWord(text)) {
            pool.query(
                `INSERT INTO dictionary (word, translation, lang_pair)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (word, lang_pair) DO NOTHING`,
                [text.trim().toLowerCase(), translatedText, `${source}-${target}`]
            ).catch((err) => console.error('Не удалось закэшировать слово:', err));
        }

        return res.json({ translatedText, source, target, via: 'online' });
    } catch (err) {
        console.warn('Онлайн-перевод недоступен, пробуем серверный словарь:', err.message);
    }

    // 2. Серверный словарь (только отдельные слова)
    if (isSingleWord(text)) {
        try {
            const translation = await translateFromServerDict(text, source, target);
            if (translation) {
                return res.json({ translatedText: translation, source, target, via: 'server_dict' });
            }
        } catch (err) {
            console.error('Ошибка запроса к серверному словарю:', err);
        }
    }

    // 3. Ни онлайн, ни серверный словарь не помогли —
    //    фронтенд должен попробовать свой офлайн-словарь на устройстве (IndexedDB)
    return res.status(503).json({
        error: 'Перевод недоступен: нет интернета и слова нет в серверном словаре',
        fallback: 'device_dict',
        source,
        target,
    });
}));

module.exports = router;
