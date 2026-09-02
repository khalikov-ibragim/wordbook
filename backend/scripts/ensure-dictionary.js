// Идемпотентная проверка: если таблица dictionary в Postgres пустая —
// скачивает исходные данные (fetch-source-dictionary.js) и грузит их
// (import-dictionary.js). Если уже наполнена — просто выходит, поэтому
// безопасно вызывать это на каждом старте backend.
//
// Это и есть "автозагрузка большого словаря при запуске приложения" —
// включается флагом AUTO_IMPORT_DICTIONARY=true в backend/.env
// (см. server.js и docs/INFRA.md).

require('dotenv').config();
const path = require('path');
const { pool } = require('../src/db');
const { fetchSourceDictionary } = require('./fetch-source-dictionary');
const { importCsvFile } = require('./import-dictionary');

async function ensureDictionary({ force = false, log = console.log } = {}) {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM dictionary');
    const existingCount = rows[0].count;

    if (existingCount > 0 && !force) {
        log(`Словарь уже наполнен (${existingCount} слов) — автозагрузка пропущена.`);
        return { skipped: true, existingCount };
    }

    log('Словарь пуст — запускаю автозагрузку исходных данных (см. docs/INFRA.md)...');
    const outDir = path.join(__dirname, '..', 'data');
    const { ruEnPath, enRuPath } = await fetchSourceDictionary({ outDir, log });

    log('Загружаю в Postgres (таблица dictionary)...');
    const ruEnCount = await importCsvFile(ruEnPath, 'ru-en', { log });
    const enRuCount = await importCsvFile(enRuPath, 'en-ru', { log });

    log(`Автозагрузка словаря завершена: ru-en — ${ruEnCount} слов, en-ru — ${enRuCount} слов. Офлайн-бандлы для устройства — в ${outDir}.`);
    return { skipped: false, ruEnCount, enRuCount };
}

module.exports = { ensureDictionary };

if (require.main === module) {
    const force = process.argv.includes('--force');
    ensureDictionary({ force })
        .then(() => pool.end())
        .catch((err) => {
            console.error('Автозагрузка словаря упала:', err);
            process.exit(1);
        });
}
