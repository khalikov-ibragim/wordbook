const express = require('express');
const { pool } = require('../db');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

const VALID_STATUSES = ['learning', 'read', 'learned', 'reviewing'];

function isValidId(id) {
    return /^\d+$/.test(id);
}

// GET /api/entries?search=&status=&limit=&offset=
router.get('/', asyncHandler(async (req, res) => {
    const { search, status, limit = 50, offset = 0 } = req.query;

    const conditions = [];
    const params = [];

    if (status && VALID_STATUSES.includes(status)) {
        params.push(status);
        conditions.push(`status = $${params.length}`);
    }

    if (search && search.trim()) {
        // Выражение должно дословно совпадать с тем, что проиндексировано
        // в schema.sql (idx_entries_search, pg_trgm), иначе индекс не
        // используется и поиск на большой базе будет full scan.
        params.push(`%${search.trim().toLowerCase()}%`);
        conditions.push(`LOWER(source_text || ' ' || translated_text) LIKE $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(Number(limit) || 50);
    params.push(Number(offset) || 0);

    const { rows } = await pool.query(
        `SELECT * FROM entries ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
    );

    res.json(rows);
}));

// GET /api/entries/stats  — счётчики по статусам + общий
router.get('/stats', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT status, COUNT(*)::int AS count FROM entries GROUP BY status`
    );
    const total = rows.reduce((sum, r) => sum + r.count, 0);
    const byStatus = Object.fromEntries(VALID_STATUSES.map((s) => [s, 0]));
    rows.forEach((r) => { byStatus[r.status] = r.count; });

    res.json({ total, byStatus });
}));

// POST /api/entries  { source_text, translated_text, source_lang, target_lang, status?, source?, context? }
router.post('/', asyncHandler(async (req, res) => {
    const {
        source_text, translated_text, source_lang, target_lang,
        status = 'learning', source = 'online', context = null,
    } = req.body;

    if (!source_text || !translated_text || !source_lang || !target_lang) {
        return res.status(400).json({ error: 'source_text, translated_text, source_lang, target_lang обязательны' });
    }
    if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status должен быть одним из: ${VALID_STATUSES.join(', ')}` });
    }

    const { rows } = await pool.query(
        `INSERT INTO entries (source_text, translated_text, source_lang, target_lang, status, source, context)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [source_text, translated_text, source_lang, target_lang, status, source, context && context.trim() ? context.trim() : null]
    );

    res.status(201).json(rows[0]);
}));

// PATCH /api/entries/:id  { source_text?, translated_text?, status? }
router.patch('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isValidId(id)) {
        return res.status(400).json({ error: 'id должен быть числом' });
    }

    const { source_text, translated_text, status, context } = req.body;

    if (status && !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status должен быть одним из: ${VALID_STATUSES.join(', ')}` });
    }

    const fields = [];
    const params = [];

    if (source_text !== undefined) { params.push(source_text); fields.push(`source_text = $${params.length}`); }
    if (translated_text !== undefined) { params.push(translated_text); fields.push(`translated_text = $${params.length}`); }
    if (status !== undefined) { params.push(status); fields.push(`status = $${params.length}`); }
    if (context !== undefined) { params.push(context && context.trim() ? context.trim() : null); fields.push(`context = $${params.length}`); }

    if (!fields.length) {
        return res.status(400).json({ error: 'Нечего обновлять' });
    }

    fields.push(`updated_at = now()`);
    params.push(id);

    const { rows } = await pool.query(
        `UPDATE entries SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params
    );

    if (!rows[0]) return res.status(404).json({ error: 'Запись не найдена' });
    res.json(rows[0]);
}));

// DELETE /api/entries/:id
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isValidId(id)) {
        return res.status(400).json({ error: 'id должен быть числом' });
    }
    const { rowCount } = await pool.query('DELETE FROM entries WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Запись не найдена' });
    res.status(204).send();
}));

module.exports = router;
