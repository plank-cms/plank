import type { RequestHandler } from 'express'
import { pool, createId } from '@plank/db'
import { findContentTypeBySlug, validate, assertSafeIdentifier } from '@plank/schema'
import { getProvider } from '../media/index.js'

type SlugParam = RequestHandler<{ slug: string }>
type SlugIdParam = RequestHandler<{ slug: string; id: string }>

export const listEntries: SlugParam = async (req, res) => {
  const ct = await findContentTypeBySlug(req.params.slug)
  if (!ct) { res.status(404).json({ error: 'Content type not found' }); return }

  assertSafeIdentifier(ct.tableName)
  const page = Math.max(1, parseInt(String(req.query.page ?? 1)))
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? 20))))
  const offset = (page - 1) * limit

  const allowedSort = ['created_at', 'updated_at', 'published_at', ...ct.fields.map((f) => f.name)]
  const sortField = allowedSort.includes(String(req.query.sort ?? '')) ? String(req.query.sort) : 'created_at'
  const sortDir = req.query.order === 'asc' ? 'ASC' : 'DESC'
  assertSafeIdentifier(sortField)

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(
      `SELECT e.*, u.first_name AS _author_first_name, u.last_name AS _author_last_name, u.avatar_url AS _author_avatar_url
       FROM ${ct.tableName} e
       LEFT JOIN plank_users u ON u.id = e.created_by
       ORDER BY e.${sortField} ${sortDir}
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    ),
    pool.query(`SELECT COUNT(*) as count FROM ${ct.tableName}`),
  ])

  const provider = await getProvider()
  const data = await Promise.all(
    rows.map(async (row) => {
      const key = row._author_avatar_url as string | null
      if (key && !key.startsWith('http')) {
        return { ...row, _author_avatar_url: await provider.getUrl(key) }
      }
      return row
    }),
  )

  res.json({ data, total: parseInt(countRows[0].count), page, limit })
}

export const getEntry: SlugIdParam = async (req, res) => {
  const ct = await findContentTypeBySlug(req.params.slug)
  if (!ct) { res.status(404).json({ error: 'Content type not found' }); return }

  assertSafeIdentifier(ct.tableName)
  const { rows } = await pool.query(`SELECT * FROM ${ct.tableName} WHERE id = $1`, [req.params.id])

  if (!rows[0]) { res.status(404).json({ error: 'Entry not found' }); return }
  res.json(rows[0])
}

export const createEntry: SlugParam = async (req, res) => {
  const ct = await findContentTypeBySlug(req.params.slug)
  if (!ct) { res.status(404).json({ error: 'Content type not found' }); return }

  validate(ct, req.body)

  assertSafeIdentifier(ct.tableName)
  const fields = ct.fields.filter((f) => req.body[f.name] !== undefined)
  fields.forEach((f) => assertSafeIdentifier(f.name))

  const id = createId()
  const userId = req.user?.id ?? null
  const cols = ['id', 'created_by', ...fields.map((f) => f.name)].join(', ')
  const placeholders = ['$1', '$2', ...fields.map((f, i) =>
    f.type === 'media-gallery' ? `$${i + 3}::jsonb` : `$${i + 3}`,
  )].join(', ')
  const values = [id, userId, ...fields.map((f) => {
    const v = req.body[f.name]
    return f.type === 'media-gallery' ? JSON.stringify(v) : v
  })]

  const { rows } = await pool.query(
    `INSERT INTO ${ct.tableName} (${cols}) VALUES (${placeholders}) RETURNING *`,
    values,
  )
  res.status(201).json(rows[0])
}

export const updateEntry: SlugIdParam = async (req, res) => {
  const ct = await findContentTypeBySlug(req.params.slug)
  if (!ct) { res.status(404).json({ error: 'Content type not found' }); return }

  validate(ct, req.body)

  assertSafeIdentifier(ct.tableName)
  const fields = ct.fields.filter((f) => req.body[f.name] !== undefined)
  fields.forEach((f) => assertSafeIdentifier(f.name))

  const setClauses = fields.map((f, i) =>
    f.type === 'media-gallery' ? `${f.name} = $${i + 1}::jsonb` : `${f.name} = $${i + 1}`,
  ).join(', ')
  const values = [...fields.map((f) => {
    const v = req.body[f.name]
    return f.type === 'media-gallery' ? JSON.stringify(v) : v
  }), req.params.id]

  const { rows } = await pool.query(
    `UPDATE ${ct.tableName} SET ${setClauses}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
    values,
  )

  if (!rows[0]) { res.status(404).json({ error: 'Entry not found' }); return }
  res.json(rows[0])
}

// Columns excluded from the published_data snapshot
const SNAPSHOT_EXCLUDED = ["'id'", "'status'", "'published_data'", "'published_at'", "'scheduled_for'", "'created_at'", "'updated_at'"]

function buildSnapshotExpr(tableName: string): string {
  const strip = SNAPSHOT_EXCLUDED.reduce((expr, col) => `${expr} - ${col}`, `to_jsonb(t.*)`)
  return `(SELECT ${strip} FROM ${tableName} t WHERE t.id = $1)`
}

export const patchEntryStatus: SlugIdParam = async (req, res) => {
  const { status, scheduled_for } = req.body as { status: unknown; scheduled_for?: unknown }
  if (status !== 'draft' && status !== 'published' && status !== 'scheduled') {
    res.status(400).json({ error: 'status must be draft, published, or scheduled' }); return
  }

  if (status === 'scheduled') {
    if (!scheduled_for || typeof scheduled_for !== 'string' || isNaN(Date.parse(scheduled_for))) {
      res.status(400).json({ error: 'scheduled_for must be a valid ISO date string' }); return
    }
    if (new Date(scheduled_for) <= new Date()) {
      res.status(400).json({ error: 'scheduled_for must be in the future' }); return
    }
  }

  const ct = await findContentTypeBySlug(req.params.slug)
  if (!ct) { res.status(404).json({ error: 'Content type not found' }); return }

  assertSafeIdentifier(ct.tableName)

  let sql: string
  let values: unknown[]

  if (status === 'published') {
    sql = `
      UPDATE ${ct.tableName} SET
        status = 'published',
        published_data = ${buildSnapshotExpr(ct.tableName)},
        published_at = NOW(),
        scheduled_for = NULL,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `
    values = [req.params.id]
  } else if (status === 'scheduled') {
    sql = `
      UPDATE ${ct.tableName} SET
        status = 'scheduled',
        scheduled_for = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `
    values = [req.params.id, scheduled_for]
  } else {
    sql = `
      UPDATE ${ct.tableName} SET
        status = 'draft',
        published_data = NULL,
        published_at = NULL,
        scheduled_for = NULL,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `
    values = [req.params.id]
  }

  const { rows } = await pool.query(sql, values)

  if (!rows[0]) { res.status(404).json({ error: 'Entry not found' }); return }
  res.json(rows[0])
}

export const deleteEntry: SlugIdParam = async (req, res) => {
  const ct = await findContentTypeBySlug(req.params.slug)
  if (!ct) { res.status(404).json({ error: 'Content type not found' }); return }

  assertSafeIdentifier(ct.tableName)
  const { rowCount } = await pool.query(
    `DELETE FROM ${ct.tableName} WHERE id = $1`,
    [req.params.id],
  )

  if (!rowCount) { res.status(404).json({ error: 'Entry not found' }); return }
  res.status(204).end()
}
