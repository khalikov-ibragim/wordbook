const { Pool } = require('pg');
// --- Postgres (stores file metadata) ---
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'gallerydb',
});

pool.on('error', (err) => {
    console.error('Неожиданная ошибка Postgres pool:', err);
});

const fs = require('fs');
const path = require('path');

// Схема — часть приложения: лежит в образе рядом с кодом (COPY src/ ./src/)
// и применяется самим backend-ом при старте. Так код и его схема едут на сервер
// одним образом с одним тегом — нельзя получить новый backend со старой схемой.
// Раньше схему применял postgres из bind-mount ./backend/src/schema.sql, но
// это требовало исходников на проде, а каталог /docker-entrypoint-initdb.d
// отрабатывает только на пустом томе, т.е. изменение schema.sql на уже
// развёрнутой базе молча не применялось.
//
// Файл целиком уходит в pool.query() без параметров — драйвер отправляет его по
// simple query protocol, который допускает несколько statements через ';'
// (с параметрами это не работает: они требуют extended protocol, а он не
// принимает мульти-statement). Наивное разбиение файла по ';' сломало бы
// функции с $$ ... $$ и ';' внутри строковых литералов.
//
// Идемпотентность обязательна: initDb() зовётся при каждом старте контейнера,
// а рестарты будут (деплой, падение, перезагрузка машины). Файл применяется
// повторно и обязан давать тот же результат — все конструкции в schema.sql
// имеют IF NOT EXISTS, поэтому повторный прогон ничего не ломает.
async function initDb() {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    await pool.query(schema);
}

module.exports = { pool, initDb };



