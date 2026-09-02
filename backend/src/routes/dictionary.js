const express = require('express');
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// GET /api/dictionary/lookup?word=hello&pair=en-ru
router.get('/lookup', asyncHandler(async (req, res) => {
    const { word, pair } = req.query;
    if (!word || !pair) {
        return res.status(400).json({ error: 'word и pair обязательны' });
    }

    const { rows } = await pool.query(
        'SELECT translation FROM dictionary WHERE word = $1 AND lang_pair = $2 LIMIT 1',
        [word.trim().toLowerCase(), pair]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Слово не найдено в серверном словаре' });
    res.json({ word, translation: rows[0].translation, pair });
}));

// GET /api/dictionary/count  — сколько слов сейчас загружено в серверный словарь
router.get('/count', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        'SELECT lang_pair, COUNT(*)::int AS count FROM dictionary GROUP BY lang_pair'
    );
    res.json(rows);
}));

// GET /api/dictionary/device-bundle?pair=en-ru
// Отдаёт заранее собранный компактный бандл для офлайн-словаря на
// устройстве (см. scripts/fetch-source-dictionary.js и docs/INFRA.md).
// Фронтенд сам зовёт это при первом запуске приложения и кладёт результат
// в IndexedDB через WordbookDB.bulkImportDeviceDictionary() — см. app.js.
router.get('/device-bundle', asyncHandler(async (req, res) => {
    const { pair } = req.query;
    if (!['en-ru', 'ru-en'].includes(pair)) {
        return res.status(400).json({ error: 'pair должен быть en-ru или ru-en' });
    }

    const bundlePath = path.join(__dirname, '..', '..', 'data', `device-bundle-${pair}.json`);
    fs.readFile(bundlePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(404).json({
                error: 'Офлайн-бандл ещё не собран. Либо подожди автозагрузку при старте backend ' +
                    '(AUTO_IMPORT_DICTIONARY=true), либо собери руками: npm run ensure-dictionary',
            });
        }
        res.type('application/json').send(data);
    });
}));

module.exports = router;
