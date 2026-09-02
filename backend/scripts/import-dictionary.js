// Импорт большого словаря в таблицу dictionary.
// Ожидает CSV без заголовка: word,translation
// Направление задаётся флагом --pair=en-ru или --pair=ru-en
//
// Использование (руками, разово):
//   node scripts/import-dictionary.js --file=./en-ru.csv --pair=en-ru
//
// importCsvFile() из этого файла переиспользуется в scripts/ensure-dictionary.js
// для автоматического наполнения при старте бэкенда — см. docs/INFRA.md
// (раздел "Данные для словаря") про то, откуда берутся сами CSV.

require('dotenv').config();
const fs = require('fs');
const readline = require('readline');
const { pool } = require('../src/db');

// word,translation — если translation сам содержит запятую, это сломает
// наивный split(','), поэтому все генераторы CSV в этом проекте (см.
// scripts/fetch-source-dictionary.js) обязаны экранировать внутренние
// запятые в translation на "; " ещё на этапе генерации файла.
async function importCsvFile(file, pair, { batchSize = 500, log = console.log } = {}) {
    const rl = readline.createInterface({ input: fs.createReadStream(file) });

    let batch = [];
    let total = 0;

    async function flush() {
        if (!batch.length) return;
        const values = [];
        const placeholders = batch.map(([word, translation], i) => {
            values.push(word.trim().toLowerCase(), translation.trim(), pair);
            const base = i * 3;
            return `($${base + 1}, $${base + 2}, $${base + 3})`;
        });

        await pool.query(
            `INSERT INTO dictionary (word, translation, lang_pair)
             VALUES ${placeholders.join(', ')}
             ON CONFLICT (word, lang_pair) DO NOTHING`,
            values
        );

        total += batch.length;
        batch = [];
    }

    for await (const line of rl) {
        if (!line.trim()) continue;
        const [word, translation] = line.split(',');
        if (!word || !translation) continue;
        batch.push([word, translation]);
        if (batch.length >= batchSize) await flush();
    }
    await flush();

    log(`  ${pair}: импортировано строк из ${file} — ${total}`);
    return total;
}

function parseArgs() {
    const args = Object.fromEntries(
        process.argv.slice(2).map((arg) => {
            const [key, value] = arg.replace(/^--/, '').split('=');
            return [key, value];
        })
    );
    if (!args.file || !args.pair) {
        console.error('Нужны флаги --file=путь.csv --pair=en-ru');
        process.exit(1);
    }
    return args;
}

async function main() {
    const { file, pair } = parseArgs();
    const total = await importCsvFile(file, pair);
    console.log(`Готово. Импортировано строк: ${total}`);
    await pool.end();
}

module.exports = { importCsvFile };

// Запущен напрямую (node scripts/import-dictionary.js ...), а не через require()
if (require.main === module) {
    main().catch((err) => {
        console.error('Импорт упал:', err);
        process.exit(1);
    });
}
