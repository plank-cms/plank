import type { RequestHandler } from 'express'
import { pool, createId } from '@plank/db'
import { findContentTypeBySlug, validate, assertSafeIdentifier } from '@plank/schema'

type SlugParam = RequestHandler<{ slug: string }>
type SlugIdParam = RequestHandler<{ slug: string; id: string }>

export const listEntries: SlugParam = async (req, res) => {
  const ct = await findContentTypeBySlug(req.params.slug)
  if (!ct) { res.status(404).json({ error: 'Content type not found' }); return }

  assertSafeIdentifier(ct.tableName)
  const page = Math.max(1, parseInt(String(req.query.page ?? 1)))
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? 20))))
  const offset = (page - 1) * limit

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(`SELECT * FROM ${ct.tableName} ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]),
    pool.query(`SELECT COUNT(*) as count FROM ${ct.tableName}`),
  ])

  res.json({ data: rows, total: parseInt(countRows[0].count), page, limit })
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
  const cols = ['id', ...fields.map((f) => f.name)].join(', ')
  const placeholders = ['$1', ...fields.map((_, i) => `$${i + 2}`)].join(', ')
  const values = [id, ...fields.map((f) => req.body[f.name])]

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

  const setClauses = fields.map((f, i) => `${f.name} = $${i + 1}`).join(', ')
  const values = [...fields.map((f) => req.body[f.name]), req.params.id]

  const { rows } = await pool.query(
    `UPDATE ${ct.tableName} SET ${setClauses}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
    values,
  )

  if (!rows[0]) { res.status(404).json({ error: 'Entry not found' }); return }
  res.json(rows[0])
}

export const patchEntryStatus: SlugIdParam = async (req, res) => {
  const { status } = req.body as { status: unknown }
  if (status !== 'draft' && status !== 'published') {
    res.status(400).json({ error: 'status must be draft or published' }); return
  }

  const ct = await findContentTypeBySlug(req.params.slug)
  if (!ct) { res.status(404).json({ error: 'Content type not found' }); return }

  assertSafeIdentifier(ct.tableName)

  let sql: string
  let values: unknown[]

  if (status === 'published') {
    const excludedCols = ["'id'", "'status'", "'published_data'", "'published_at'", "'created_at'", "'updated_at'"]
    const stripExpr = excludedCols.reduce((expr, col) => `${expr} - ${col}`, `to_jsonb(t.*)`)
    sql = `
      UPDATE ${ct.tableName} SET
        status = 'published',
        published_data = (SELECT ${stripExpr} FROM ${ct.tableName} t WHERE t.id = $1),
        published_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `
    values = [req.params.id]
  } else {
    sql = `UPDATE ${ct.tableName} SET status = 'draft', published_data = NULL, published_at = NULL, updated_at = NOW() WHERE id = $1 RETURNING *`
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
