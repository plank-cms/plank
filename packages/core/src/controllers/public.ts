import type { RequestHandler } from 'express'
import { pool } from '@plank/db'
import { findContentTypeBySlug, assertSafeIdentifier } from '@plank/schema'
import type { ContentType } from '@plank/schema'
import { getProvider } from '../media/index.js'

type SlugParam = RequestHandler<{ slug: string }>
type SlugIdParam = RequestHandler<{ slug: string; id: string }>

type Row = Record<string, unknown> & {
  published_data?: Record<string, unknown> | null
  published_at?: unknown
  _author_first_name?: string | null
  _author_last_name?: string | null
  _author_avatar_url?: string | null
  _author_job_title?: string | null
  _author_organization?: string | null
  _author_country?: string | null
}

// Resolves media IDs to fresh URLs in-place across a list of serialized entries
async function resolveMediaFields(entries: Record<string, unknown>[], ct: ContentType): Promise<void> {
  const singleFields = ct.fields.filter((f) => f.type === 'media').map((f) => f.name)
  const galleryFields = ct.fields.filter((f) => f.type === 'media-gallery').map((f) => f.name)
  if (singleFields.length === 0 && galleryFields.length === 0) return

  const idSet = new Set<string>()
  for (const entry of entries) {
    for (const name of singleFields) {
      const val = entry[name]
      if (typeof val === 'string' && val && !val.startsWith('http')) idSet.add(val)
    }
    for (const name of galleryFields) {
      const val = entry[name]
      if (Array.isArray(val)) {
        for (const id of val) {
          if (typeof id === 'string' && id && !id.startsWith('http')) idSet.add(id)
        }
      }
    }
  }
  if (idSet.size === 0) return

  const { rows } = await pool.query<{ id: string; provider_key: string }>(
    'SELECT id, provider_key FROM plank_media WHERE id = ANY($1)',
    [[...idSet]],
  )

  const provider = await getProvider()
  const urlMap = new Map<string, string>()
  await Promise.all(rows.map(async (r) => {
    urlMap.set(r.id, await provider.getUrl(r.provider_key))
  }))

  for (const entry of entries) {
    for (const name of singleFields) {
      const val = entry[name]
      if (typeof val === 'string' && urlMap.has(val)) entry[name] = urlMap.get(val)
    }
    for (const name of galleryFields) {
      const val = entry[name]
      if (Array.isArray(val)) {
        entry[name] = val.map((id) =>
          typeof id === 'string' && urlMap.has(id) ? urlMap.get(id) : id,
        )
      }
    }
  }
}

const SYSTEM_FIELDS = new Set(['status', 'published_data', 'published_at', 'scheduled_for', 'created_by', 'created_at', 'updated_at'])

function stripSystemFields(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([k]) => !SYSTEM_FIELDS.has(k)))
}

async function resolveRelationFields(entries: Record<string, unknown>[], ct: ContentType): Promise<void> {
  const scalarFields = ct.fields.filter(
    (f) => f.type === 'relation' &&
      (f.relationType === 'many-to-one' || f.relationType === 'one-to-one' || !f.relationType) &&
      f.relatedTable,
  )
  const mmFields = ct.fields.filter(
    (f) => f.type === 'relation' && (f.relationType ?? 'many-to-one') === 'many-to-many' && f.relatedTable,
  )

  const entryIds = entries.map((e) => e.id as string)

  await Promise.all([
    ...scalarFields.map(async (field) => {
      const ids = entries.map((e) => e[field.name] as string).filter(Boolean)
      if (ids.length === 0) return
      assertSafeIdentifier(field.relatedTable!)
      const { rows } = await pool.query(`SELECT * FROM ${field.relatedTable} WHERE id = ANY($1)`, [ids])
      const map = new Map(rows.map((r) => [r.id as string, stripSystemFields(r)]))
      for (const entry of entries) {
        const id = entry[field.name] as string | null
        entry[field.name] = id ? (map.get(id) ?? null) : null
      }
    }),
    ...mmFields.map(async (field) => {
      if (entryIds.length === 0) return
      const jt = `_rel_${ct.tableName}_${field.name}`
      const { rows: jRows } = await pool.query<{ source_id: string; target_id: string }>(
        `SELECT source_id, target_id FROM ${jt} WHERE source_id = ANY($1)`,
        [entryIds],
      )
      const allTargetIds = [...new Set(jRows.map((r) => r.target_id))]
      const relatedMap = new Map<string, Record<string, unknown>>()
      if (allTargetIds.length > 0) {
        assertSafeIdentifier(field.relatedTable!)
        const { rows: relRows } = await pool.query(`SELECT * FROM ${field.relatedTable} WHERE id = ANY($1)`, [allTargetIds])
        for (const row of relRows) relatedMap.set(row.id as string, stripSystemFields(row))
      }
      const sourceMap = new Map<string, Record<string, unknown>[]>()
      for (const row of jRows) {
        const obj = relatedMap.get(row.target_id)
        if (!obj) continue
        const list = sourceMap.get(row.source_id)
        if (list) list.push(obj)
        else sourceMap.set(row.source_id, [obj])
      }
      for (const entry of entries) {
        entry[field.name] = sourceMap.get(entry.id as string) ?? []
      }
    }),
  ])
}

async function resolveAuthorAvatars(entries: Record<string, unknown>[]): Promise<void> {
  const provider = await getProvider()
  await Promise.all(
    entries.map(async (entry) => {
      const author = entry.author as { avatar_url: string | null } | null
      if (author?.avatar_url && !author.avatar_url.startsWith('http')) {
        author.avatar_url = await provider.getUrl(author.avatar_url)
      }
    }),
  )
}

// Builds an ordered response: id first, then CT fields in builder order, then system fields
function serializeEntry(row: Row, ct: ContentType, statusParam: string): Record<string, unknown> {
  const { published_data, _author_first_name, _author_last_name, _author_avatar_url, _author_job_title, _author_organization, _author_country, ...rest } = row
  const source = statusParam === 'published' && published_data ? published_data : rest

  const out: Record<string, unknown> = { id: row.id }
  for (const field of ct.fields) {
    if (field.name in source) out[field.name] = source[field.name]
  }
  out.status = row.status
  out.published_at = row.published_at ?? null
  out.created_at = row.created_at
  out.updated_at = row.updated_at
  out.author = _author_first_name || _author_last_name
    ? {
        first_name: _author_first_name ?? null,
        last_name: _author_last_name ?? null,
        avatar_url: _author_avatar_url ?? null,
        job_title: _author_job_title ?? null,
        organization: _author_organization ?? null,
        country: _author_country ?? null,
      }
    : null
  return out
}

export const listPublicEntries: SlugParam = async (req, res) => {
  const ct = await findContentTypeBySlug(req.params.slug)
  if (!ct) { res.status(404).json({ error: 'Not found' }); return }

  assertSafeIdentifier(ct.tableName)

  if (ct.kind === 'single') {
    const statusParam = String(req.query.status ?? 'published')
    const statusClause =
      statusParam === 'published' || statusParam === 'draft'
        ? `WHERE e.status = $1`
        : ''
    const values: unknown[] = statusClause ? [statusParam] : []
    const { rows } = await pool.query(
      `SELECT e.*, u.first_name AS _author_first_name, u.last_name AS _author_last_name, u.avatar_url AS _author_avatar_url, u.job_title AS _author_job_title, u.organization AS _author_organization, u.country AS _author_country
       FROM ${ct.tableName} e
       LEFT JOIN plank_users u ON u.id = e.created_by
       ${statusClause} LIMIT 1`,
      values,
    )
    if (!rows[0]) { res.status(404).json({ error: 'Not found' }); return }
    const entry = serializeEntry(rows[0], ct, statusParam)
    await Promise.all([
      resolveMediaFields([entry], ct),
      resolveAuthorAvatars([entry]),
      resolveRelationFields([entry], ct),
    ])
    res.json(entry)
    return
  }

  const page = Math.max(1, parseInt(String(req.query.page ?? 1)))
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? 20))))
  const offset = (page - 1) * limit

  const knownFields = new Set(ct.fields.map((f) => f.name))
  const systemSortFields = new Set(['created_at', 'updated_at', 'published_at'])
  const filterClauses: string[] = []
  const filterValues: unknown[] = []

  // Status filter: default published, opt-in to draft or all
  const statusParam = String(req.query.status ?? 'published')
  if (statusParam === 'published' || statusParam === 'draft') {
    filterClauses.push(`e.status = $${filterValues.length + 1}`)
    filterValues.push(statusParam)
  }
  // statusParam === 'all' skips the filter entirely

  const rawSort = String(req.query.sort ?? 'created_at')
  const sortField = knownFields.has(rawSort) || systemSortFields.has(rawSort) ? rawSort : 'created_at'
  assertSafeIdentifier(sortField)
  const sortDir = String(req.query.order ?? 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC'

  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'page' || key === 'limit' || key === 'status' || key === 'sort' || key === 'order') continue
    if (knownFields.has(key)) {
      assertSafeIdentifier(key)
      filterClauses.push(`e.${key} = $${filterValues.length + 1}`)
      filterValues.push(value)
    }
  }

  const where = filterClauses.length > 0 ? `WHERE ${filterClauses.join(' AND ')}` : ''
  const limitParam = filterValues.length + 1
  const offsetParam = filterValues.length + 2

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(
      `SELECT e.*, u.first_name AS _author_first_name, u.last_name AS _author_last_name, u.avatar_url AS _author_avatar_url, u.job_title AS _author_job_title, u.organization AS _author_organization, u.country AS _author_country
       FROM ${ct.tableName} e
       LEFT JOIN plank_users u ON u.id = e.created_by
       ${where} ORDER BY e.${sortField} ${sortDir} LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...filterValues, limit, offset],
    ),
    pool.query(`SELECT COUNT(*) as count FROM ${ct.tableName} e ${where}`, filterValues),
  ])

  const data = rows.map((row) => serializeEntry(row, ct, statusParam))
  await Promise.all([
    resolveMediaFields(data, ct),
    resolveAuthorAvatars(data),
    resolveRelationFields(data, ct),
  ])
  res.json({ data, total: parseInt(countRows[0].count), page, limit })
}

export const getPublicEntry: SlugIdParam = async (req, res) => {
  const ct = await findContentTypeBySlug(req.params.slug)
  if (!ct) { res.status(404).json({ error: 'Not found' }); return }

  assertSafeIdentifier(ct.tableName)
  const statusParam = String(req.query.status ?? 'published')
  const statusClause =
    statusParam === 'published' || statusParam === 'draft'
      ? ` AND e.status = $2`
      : ''
  const values: unknown[] = statusClause ? [req.params.id, statusParam] : [req.params.id]

  const { rows } = await pool.query(
    `SELECT e.*, u.first_name AS _author_first_name, u.last_name AS _author_last_name, u.avatar_url AS _author_avatar_url, u.job_title AS _author_job_title, u.organization AS _author_organization, u.country AS _author_country
     FROM ${ct.tableName} e
     LEFT JOIN plank_users u ON u.id = e.created_by
     WHERE e.id = $1${statusClause}`,
    values,
  )

  if (!rows[0]) { res.status(404).json({ error: 'Not found' }); return }
  const entry = serializeEntry(rows[0], ct, statusParam)
  await Promise.all([
    resolveMediaFields([entry], ct),
    resolveAuthorAvatars([entry]),
    resolveRelationFields([entry], ct),
  ])
  res.json(entry)
}
