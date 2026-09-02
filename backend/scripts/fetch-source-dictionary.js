// Скачивает исходные данные словаря и строит из них:
//  - data/dictionary-ru-en.csv, data/dictionary-en-ru.csv — для импорта в
//    Postgres (backend/scripts/import-dictionary.js), это и есть "большой
//    словарь для сервера";
//  - data/device-bundle-ru-en.json, data/device-bundle-en-ru.json —
//    компактные бандлы для офлайн-словаря на устройстве (раздаются через
//    GET /api/dictionary/device-bundle, см. routes/dictionary.js), это и
//    есть "маленький словарь для устройств".
//
// Источник по умолчанию — открытые данные проекта OpenRussian.org
// (репозиторий Badestrand/russian-dictionary на GitHub, лицензия
// CC BY-SA 4.0 — при публичном использовании нужна атрибуция, см.
// docs/INFRA.md). Формат источника — TSV с заголовком, нужные колонки:
// "bare" (русское слово без ударения) и "translations_en" (список
// английских переводов через запятую). Файлы уже отсортированы по
// частотности слова — этим мы и пользуемся для отбора "top-N" на устройство,
// без отдельного частотного словаря.
//
// Можно передать свой источник в том же формате через переменные
// окружения DICTIONARY_SOURCE_BASE_URL / DICTIONARY_SOURCE_FILES (см.
// backend/.env.example).
//
// CLI (только скачать и собрать файлы, без записи в Postgres):
//   node scripts/fetch-source-dictionary.js
// Обычно вызывается не напрямую, а через ensure-dictionary.js, который
// после сборки файлов ещё и грузит их в Postgres.

const fs = require('fs');
const path = require('path');

const DEFAULT_BASE_URL = 'https://github.com/Badestrand/russian-dictionary/raw/refs/heads/master';
const DEFAULT_FILES = ['others.csv', 'nouns.csv', 'verbs.csv', 'adjectives.csv'];

// Разбирает один исходный TSV-файл. Возвращает массив { ru, enField } в
// исходном порядке (= порядке убывания частотности в источнике).
function parseSourceFile(text, fileLabel, log) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (!lines.length) return [];

    const header = lines[0].split('\t').map((h) => h.trim().toLowerCase());
    const bareIdx = header.indexOf('bare');
    const transIdx = header.indexOf('translations_en');

    if (bareIdx === -1 || transIdx === -1) {
        log(`  ! ${fileLabel}: не нашёл колонки "bare"/"translations_en" (заголовок: ${header.join(' | ')}) — файл пропущен`);
        return [];
    }

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split('\t');
        const ru = (cols[bareIdx] || '').trim().toLowerCase();
        const enField = (cols[transIdx] || '').trim();
        // В таблице dictionary хранятся только одиночные слова (см.
        // docs/LOGIC.md) — пропускаем составные "bare"-значения, если вдруг
        // встретятся (в этих файлах это не ожидается, но на всякий случай).
        if (!ru || !enField || /\s/.test(ru)) continue;
        rows.push({ ru, enField });
    }
    return rows;
}

// Строит CSV-строки (для Postgres) и элементы офлайн-бандла (для
// устройства) из уже распарсенных файлов.
function buildArtifacts(perFileRows, deviceLimitPerFile) {
    const ruEnSeen = new Set();
    const enRuSeen = new Set();
    const ruEnLines = [];
    const enRuLines = [];
    const deviceRuEn = [];
    const deviceEnRu = [];

    for (const { rows } of perFileRows) {
        rows.forEach((row, idx) => {
            const withinDeviceLimit = idx < deviceLimitPerFile;

            // ru -> en: перевод храним целиком (может быть несколько
            // значений через запятую) — запятую заменяем на "; ", чтобы не
            // сломать простой парсер в import-dictionary.js (word,translation).
            if (!ruEnSeen.has(row.ru)) {
                ruEnSeen.add(row.ru);
                const translationSafe = row.enField.replace(/,/g, '; ').replace(/\s+/g, ' ').trim();
                ruEnLines.push(`${row.ru},${translationSafe}`);
                if (withinDeviceLimit) deviceRuEn.push({ word: row.ru, translation: translationSafe });
            }

            // en -> ru: разбиваем список переводов на отдельные слова и
            // берём только однословные (словарь — не для фраз).
            row.enField.split(',').forEach((glossRaw) => {
                const gloss = glossRaw.trim().toLowerCase();
                if (!gloss || /\s/.test(gloss) || enRuSeen.has(gloss)) return;
                enRuSeen.add(gloss);
                enRuLines.push(`${gloss},${row.ru}`);
                if (withinDeviceLimit) deviceEnRu.push({ word: gloss, translation: row.ru });
            });
        });
    }

    return { ruEnLines, enRuLines, deviceRuEn, deviceEnRu };
}

async function fetchSourceDictionary({
    baseUrl = process.env.DICTIONARY_SOURCE_BASE_URL || DEFAULT_BASE_URL,
    files = (process.env.DICTIONARY_SOURCE_FILES || DEFAULT_FILES.join(',')).split(',').map((s) => s.trim()).filter(Boolean),
    deviceLimit = Number(process.env.DEVICE_BUNDLE_LIMIT_PER_FILE || 8000),
    outDir,
    log = console.log,
} = {}) {
    await fs.promises.mkdir(outDir, { recursive: true });

    const perFileRows = [];
    for (const file of files) {
        const url = `${baseUrl}/${file}`;
        log(`  Скачиваю ${url}`);
        let res;
        try {
            res = await fetch(url, { signal: AbortSignal.timeout(30000) });
        } catch (err) {
            log(`  ! ${file}: не удалось скачать (${err.message}) — файл пропущен`);
            continue;
        }
        if (!res.ok) {
            log(`  ! ${file}: источник ответил ${res.status} — файл пропущен`);
            continue;
        }
        const text = await res.text();
        const rows = parseSourceFile(text, file, log);
        log(`    ${file}: ${rows.length} слов`);
        perFileRows.push({ file, rows });
    }

    if (!perFileRows.some((f) => f.rows.length)) {
        throw new Error('Не удалось скачать/разобрать ни один исходный файл словаря (проверь сеть и DICTIONARY_SOURCE_BASE_URL)');
    }

    const { ruEnLines, enRuLines, deviceRuEn, deviceEnRu } = buildArtifacts(perFileRows, deviceLimit);

    const ruEnPath = path.join(outDir, 'dictionary-ru-en.csv');
    const enRuPath = path.join(outDir, 'dictionary-en-ru.csv');
    const bundleRuEnPath = path.join(outDir, 'device-bundle-ru-en.json');
    const bundleEnRuPath = path.join(outDir, 'device-bundle-en-ru.json');

    await fs.promises.writeFile(ruEnPath, ruEnLines.join('\n') + '\n', 'utf8');
    await fs.promises.writeFile(enRuPath, enRuLines.join('\n') + '\n', 'utf8');
    await fs.promises.writeFile(bundleRuEnPath, JSON.stringify({
        pair: 'ru-en',
        generatedAt: new Date().toISOString(),
        count: deviceRuEn.length,
        items: deviceRuEn,
    }), 'utf8');
    await fs.promises.writeFile(bundleEnRuPath, JSON.stringify({
        pair: 'en-ru',
        generatedAt: new Date().toISOString(),
        count: deviceEnRu.length,
        items: deviceEnRu,
    }), 'utf8');

    log(`  ru-en: ${ruEnLines.length} строк для сервера, ${deviceRuEn.length} — в офлайн-бандл устройства`);
    log(`  en-ru: ${enRuLines.length} строк для сервера, ${deviceEnRu.length} — в офлайн-бандл устройства`);

    return { ruEnPath, enRuPath, bundleRuEnPath, bundleEnRuPath };
}

module.exports = { fetchSourceDictionary, parseSourceFile, buildArtifacts };

if (require.main === module) {
    require('dotenv').config();
    const outDir = path.join(__dirname, '..', 'data');
    fetchSourceDictionary({ outDir })
        .then((paths) => {
            console.log('Готово:', paths);
        })
        .catch((err) => {
            console.error('Не удалось скачать/собрать словарь:', err);
            process.exit(1);
        });
}
