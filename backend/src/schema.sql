-- Схема БД для wordbook
-- Применить: psql -U wordbook_user -d wordbook -f schema.sql

CREATE TABLE IF NOT EXISTS entries (
    id              SERIAL PRIMARY KEY,
    source_text     TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    source_lang     VARCHAR(2) NOT NULL,      -- 'en' | 'ru'
    target_lang     VARCHAR(2) NOT NULL,      -- 'en' | 'ru'
    status          VARCHAR(20) NOT NULL DEFAULT 'learning',
                    -- 'learning' | 'read' | 'learned' | 'reviewing'
    source          VARCHAR(20) NOT NULL DEFAULT 'online',
                    -- откуда пришёл перевод: 'online' | 'server_dict' | 'device_dict' | 'manual'
    context         TEXT,
                    -- необязательное предложение/фраза-источник, где встретилось
                    -- слово (например, строка из документации) — помогает вспомнить
                    -- смысл технического термина позже, вне отрыва от контекста
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ALTER ... IF NOT EXISTS делает этот файл безопасным для повторного
-- запуска на уже существующей базе (миграция для тех, кто разворачивал
-- schema.sql раньше, до появления поля context).
ALTER TABLE entries ADD COLUMN IF NOT EXISTS context TEXT;

CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);

-- Поиск в entries.js делается через `LOWER(source_text || ' ' || translated_text)
-- LIKE '%...%'` (подстрока, а не полнотекстовый поиск по словам), поэтому
-- обычный gin(to_tsvector(...)) индекс планировщиком для него не
-- используется — это была бы просто мёртвая нагрузка на запись при таком
-- запросе. pg_trgm умеет ускорять именно LIKE '%...%' по произвольной
-- подстроке, и выражение здесь дословно совпадает с тем, что в запросе.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_entries_search
    ON entries USING gin ((LOWER(source_text || ' ' || translated_text)) gin_trgm_ops);

-- Большой серверный словарь (для отдельных слов, не фраз)
CREATE TABLE IF NOT EXISTS dictionary (
    id          SERIAL PRIMARY KEY,
    word        TEXT NOT NULL,
    translation TEXT NOT NULL,
    lang_pair   VARCHAR(5) NOT NULL,  -- 'en-ru' | 'ru-en'
    UNIQUE (word, lang_pair)
);

CREATE INDEX IF NOT EXISTS idx_dictionary_word ON dictionary(word, lang_pair);
