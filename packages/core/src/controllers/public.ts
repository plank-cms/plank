import type { RequestHandler } from 'express'
import { pool } from '@plank/db'
import { findContentTypeBySlug, assertSafeIdentifier } from '@plank/schema'
import type { ContentType } from '@plank/schema'

type SlugParam = RequestHandler<{ slug: string }>
type SlugIdParam = RequestHandler<{ slug: string; id: string }>

type Row = Record<string, unknown> & { published_data?: Record<string, unknown> | null }

// Builds an ordered response: id first, then CT fields in builder order, then system fields
function serializeEntry(row: Row, ct: ContentType, statusParam: string): Record<string, unknown> {
  const { published_data, ...rest } = row
  const source = statusParam === 'published' && published_data ? published_data : rest

  const out: Record<string, unknown> = { id: row.id }
  for (const field of ct.fields) {
    if (field.name in source) out[field.name] = source[field.name]
  }
  out.status = row.status
  out.created_at = row.created_at
  out.updated_at = row.updated_at
  return out
}

export const listPublicEntries: SlugParam = async (req, res) => {
  const ct = await findContentTypeBySlug(req.params.slug)
  if (!ct) { res.status(404).json({ error: 'Not found' }); return }

  assertSafeIdentifier(ct.tableName)
  const page = Math.max(1, parseInt(String(req.query.page ?? 1)))
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? 20))))
  const offset = (page - 1) * limit

  const knownFields = new Set(ct.fields.map((f) => f.name))
  const filterClauses: string[] = []
  const filterValues: unknown[] = []

  // Status filter: default published, opt-in to draft or all
  const statusParam = String(req.query.status ?? 'published')
  if (statusParam === 'published' || statusParam === 'draft') {
    filterClauses.push(`status = $${filterValues.length + 1}`)
    filterValues.push(statusParam)
  }
  // statusParam === 'all' skips the filter entirely

  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'page' || key === 'limit' || key === 'status') continue
    if (knownFields.has(key)) {
      assertSafeIdentifier(key)
      filterClauses.push(`${key} = $${filterValues.length + 1}`)
      filterValues.push(value)
    }
  }

  const where = filterClauses.length > 0 ? `WHERE ${filterClauses.join(' AND ')}` : ''
  const limitParam = filterValues.length + 1
  const offsetParam = filterValues.length + 2

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(
      `SELECT * FROM ${ct.tableName} ${where} ORDER BY created_at DESC LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...filterValues, limit, offset],
    ),
    pool.query(`SELECT COUNT(*) as count FROM ${ct.tableName} ${where}`, filterValues),
  ])

  const data = rows.map((row) => serializeEntry(row, ct, statusParam))
  res.json({ data, total: parseInt(countRows[0].count), page, limit })
}

export const getPublicEntry: SlugIdParam = async (req, res) => {
  const ct = await findContentTypeBySlug(req.params.slug)
  if (!ct) { res.status(404).json({ error: 'Not found' }); return }

  assertSafeIdentifier(ct.tableName)
  const statusParam = String(req.query.status ?? 'published')
  const statusClause =
    statusParam === 'published' || statusParam === 'draft'
      ? ` AND status = $2`
      : ''
  const values: unknown[] = statusClause ? [req.params.id, statusParam] : [req.params.id]

  const { rows } = await pool.query(
    `SELECT * FROM ${ct.tableName} WHERE id = $1${statusClause}`,
    values,
  )

  if (!rows[0]) { res.status(404).json({ error: 'Not found' }); return }
  res.json(serializeEntry(rows[0], ct, statusParam))
}
