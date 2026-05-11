import type { RequestHandler } from 'express'
import { pool, createId } from '@plank-cms/db'
import {
  findContentTypeBySlug,
  validate,
  assertSafeIdentifier,
  isVirtualRelation,
  quoteIdentifier,
} from '@plank-cms/schema'
import type { FieldDefinition } from '@plank-cms/schema'
import { getProvider } from '../media/index.js'
import { triggerPreviewSyncWebhook, triggerWebhooks } from './webhooks.js'

type Locale = string | undefined
type LocalizedValues = Record<string, Record<string, unknown>> & {
  _meta?: { enabled?: boolean; primary?: string }
}

function resolveLocalizedRow(
  row: Record<string, unknown>,
  ct: { fields: FieldDefinition[] },
  locale: Locale,
  fallbacks: string[] = [],
) {
  const localized: LocalizedValues =
    row.localized && typeof row.localized === 'object' ? (row.localized as LocalizedValues) : {}
  const resolved: Record<string, unknown> = { ...row }
  const localizableTypes = new Set(['string', 'text', 'richtext', 'uid'])
  for (const f of ct.fields) {
    if (!localizableTypes.has(f.type)) continue
    let val: unknown = undefined
    if (locale && localized[locale] && localized[locale][f.name] !== undefined) {
      val = localized[locale][f.name]
    } else {
      for (const fb of fallbacks) {
        if (localized[fb] && localized[fb][f.name] !== undefined) {
          val = localized[fb][f.name]
          break
        }
      }
    }
    if (val !== undefined) resolved[f.name] = val
  }
  return resolved
}

function junctionTableName(sourceTable: string, fieldName: string): string {
  return `_rel_${sourceTable}_${fieldName}`
}

function normalizeNavigationItems(value: unknown): unknown {
  if (!Array.isArray(value)) return value
  return value.map((item) => {
    if (typeof item !== 'object' || item === null) return item
    const raw = item as Record<string, unknown>
    const normalized: Record<string, unknown> = {
      label: raw.label,
      href: raw.href,
    }
    if (Array.isArray(raw.items)) {
      const normalizedChildren = normalizeNavigationItems(raw.items)
      if (Array.isArray(normalizedChildren) && normalizedChildren.length > 0) {
        normalized.items = normalizedChildren
      }
    } else if (raw.items !== undefined) {
      normalized.items = raw.items
    }
    for (const [key, val] of Object.entries(raw)) {
      if (key === 'label' || key === 'href' || key === 'items') continue
      normalized[key] = val
    }
    return normalized
  })
}

function normalizeNavigationFields(
  row: Record<string, unknown>,
  fields: import('@plank-cms/schema').FieldDefinition[],
): Record<string, unknown> {
  const out = { ...row }
  for (const field of fields) {
    if (field.type !== 'navigation') continue
    out[field.name] = normalizeNavigationItems(out[field.name])
  }
  return out
}

async function syncManyToMany(
  entryId: string,
  tableName: string,
  field: FieldDefinition,
  targetIds: string[],
): Promise<void> {
  const jt = junctionTableName(tableName, field.name)
  await pool.query(`DELETE FROM ${quoteIdentifier(jt)} WHERE source_id = $1`, [entryId])
  if (targetIds.length === 0) return
  const placeholders = targetIds.map((_, i) => `($1, $${i + 2})`).join(', ')
  await pool.query(
    `INSERT INTO ${quoteIdentifier(jt)} (source_id, target_id) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
    [entryId, ...targetIds],
  )
}

type SlugParam = RequestHandler<{ slug: string }>
type SlugIdParam = RequestHandler<{ slug: string; id: string }>

async function isContributorRole(roleId: string | undefined): Promise<boolean> {
  if (!roleId) return false
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM plank_roles WHERE id = $1', [roleId])
  return rows[0]?.name?.toLowerCase() === 'contributor'
}

async function roleName(roleId: string | undefined): Promise<string> {
  if (!roleId) return ''
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM plank_roles WHERE id = $1', [roleId])
  return rows[0]?.name?.toLowerCase() ?? ''
}

export const listEntries: SlugParam = async (req, res) => {
  const ct = await findContentTypeBySlug(req.params.slug)
  if (!ct) {
    res.status(404).json({ error: 'Content type not found' })
    return
  }

  assertSafeIdentifier(ct.tableName)
  const quotedTableName = quoteIdentifier(ct.tableName)
  const page = Math.max(1, parseInt(String(req.query.page ?? 1)))
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? 20))))
  const offset = (page - 1) * limit

  const allowedSort = ['created_at', 'updated_at', 'published_at', ...ct.fields.map((f) => f.name)]
  const sortField = allowedSort.includes(String(req.query.sort ?? ''))
    ? String(req.query.sort)
    : 'created_at'
  const sortDir = req.query.order === 'asc' ? 'ASC' : 'DESC'
  assertSafeIdentifier(sortField)
  const quotedSortField = quoteIdentifier(sortField)

  const locale = req.query.locale ? String(req.query.locale) : undefined
  const fallbacks = req.query.fallback ? String(req.query.fallback).split(',') : []

  const search = req.query.search ? String(req.query.search).trim() : ''
  const rawSearchFields = req.query.searchFields ? String(req.query.searchFields).split(',') : []
  const textLikeTypes = ['string', 'uid', 'text', 'richtext']
  const searchFields = rawSearchFields.filter((name) =>
    ct.fields.some((f) => f.name === name && textLikeTypes.includes(f.type)),
  )

  const mainParams: unknown[] = [limit, offset]
  const countParams: unknown[] = []
  const statusParams: unknown[] = []
  const mainClauses: string[] = []
  const countClauses: string[] = []
  const statusClauses: string[] = []

  const allowedStatuses = ['draft', 'published', 'scheduled', 'pending', 'in_review']
  const statusFilter = req.query.status ? String(req.query.status) : ''
  if (statusFilter && allowedStatuses.includes(statusFilter)) {
    mainParams.push(statusFilter)
    countParams.push(statusFilter)
    mainClauses.push(`e.status = $${mainParams.length}`)
    countClauses.push(`e.status = $${countParams.length}`)
  }

  if (search && searchFields.length > 0) {
    const term = `%${search}%`
    mainParams.push(term)
    countParams.push(term)
    statusParams.push(term)
    const mainIdx = mainParams.length
    const countIdx = countParams.length
    const statusIdx = statusParams.length
    const searchMainConditions = searchFields.map((name) => {
      assertSafeIdentifier(name)
      return `e.${quoteIdentifier(name)}::text ILIKE $${mainIdx}`
    })
    const searchCountConditions = searchFields.map((name) => {
      return `e.${quoteIdentifier(name)}::text ILIKE $${countIdx}`
    })
    const searchStatusConditions = searchFields.map((name) => {
      return `e.${quoteIdentifier(name)}::text ILIKE $${statusIdx}`
    })
    mainClauses.push(`(${searchMainConditions.join(' OR ')})`)
    countClauses.push(`(${searchCountConditions.join(' OR ')})`)
    statusClauses.push(`(${searchStatusConditions.join(' OR ')})`)
  }

  const mainWhereClause = mainClauses.length > 0 ? `WHERE ${mainClauses.join(' AND ')}` : ''
  const countWhereClause = countClauses.length > 0 ? `WHERE ${countClauses.join(' AND ')}` : ''
  const statusWhereClause = statusClauses.length > 0 ? `WHERE ${statusClauses.join(' AND ')}` : ''

  const [{ rows }, { rows: countRows }, { rows: statusRows }] = await Promise.all([
    pool.query(
      `SELECT e.*, u.first_name AS _author_first_name, u.last_name AS _author_last_name, u.avatar_url AS _author_avatar_url,
              ed.first_name AS _editor_first_name, ed.last_name AS _editor_last_name, ed.avatar_url AS _editor_avatar_url
       FROM ${quotedTableName} e
       LEFT JOIN plank_users u ON u.id = e.created_by
       LEFT JOIN plank_users ed ON ed.id = e.editor_id
       ${mainWhereClause}
       ORDER BY e.${quotedSortField} ${sortDir}
       LIMIT $1 OFFSET $2`,
      mainParams,
    ),
    pool.query(
      `SELECT COUNT(*) as count FROM ${quotedTableName} e ${countWhereClause}`,
      countParams,
    ),
    pool.query<{ status: string }>(
      `SELECT DISTINCT e.status
       FROM ${quotedTableName} e
       ${statusWhereClause}
       ORDER BY e.status`,
      statusParams,
    ),
  ])

  const provider = await getProvider()
  function entryMatchesLocale(row: Record<string, unknown>, locale?: string) {
    if (!locale) return true
    const localized: LocalizedValues =
      row.localized && typeof row.localized === 'object' ? (row.localized as LocalizedValues) : {}
    const locales = Object.keys(localized).filter((k) => !k.startsWith('_'))
    const meta = localized._meta ?? {}
    const enabled = meta.enabled ?? locales.length > 0
    const primary: string | undefined = meta.primary
    if (enabled) {
      return Boolean(localized[locale]) || primary === locale
    }
    return primary === locale
  }

  const filtered = rows.filter((r) => entryMatchesLocale(r, locale))

  const data = await Promise.all(
    filtered.map(async (row) => {
      const mmIds = await loadManyToManyIds(row.id, ct.tableName, ct.fields)
      const resolved = resolveLocalizedRow(row, ct, locale, fallbacks)
      const key = resolved._author_avatar_url as string | null
      if (key && !key.startsWith('http')) {
        resolved._author_avatar_url = await provider.getUrl(key)
      }
      const editorKey = resolved._editor_avatar_url as string | null
      if (editorKey && !editorKey.startsWith('http')) {
        resolved._editor_avatar_url = await provider.getUrl(editorKey)
      }
      return normalizeNavigationFields({ ...resolved, ...mmIds }, ct.fields)
    }),
  )

  let total = parseInt(countRows[0].count)
  if (locale) {
    // compute total matching locale across all rows (lightweight: only fetch localized column)
    try {
      const { rows: allRows } = await pool.query<Record<string, unknown>>(
        `SELECT localized FROM ${quotedTableName}`,
      )
      const matching = allRows.filter((r) => entryMatchesLocale(r, locale))
      total = matching.length
    } catch {
      // fallback to previous total
    }
  }

  res.json({
    data,
    total,
    page,
    limit,
    available_statuses: statusRows
      .map((row) => row.status)
      .filter((value) => allowedStatuses.includes(value)),
  })
}

async function loadManyToManyIds(
  entryId: string,
  tableName: string,
  fields: import('@plank-cms/schema').FieldDefinition[],
): Promise<Record<string, string[]>> {
  const mmFields = fields.filter(
    (f) => f.type === 'relation' && (f.relationType ?? 'many-to-one') === 'many-to-many',
  )
  if (mmFields.length === 0) return {}
  const result: Record<string, string[]> = {}
  await Promise.all(
    mmFields.map(async (f) => {
      const jt = junctionTableName(tableName, f.name)
      const { rows } = await pool.query<{ target_id: string }>(
        `SELECT target_id FROM ${quoteIdentifier(jt)} WHERE source_id = $1`,
        [entryId],
      )
      result[f.name] = rows.map((r) => r.target_id)
    }),
  )
  return result
}

async function loadHydratedEntry(
  entryId: string,
  tableName: string,
  fields: import('@plank-cms/schema').FieldDefinition[],
  locale?: string,
  fallbacks: string[] = [],
): Promise<Record<string, unknown> | null> {
  const { rows } = await pool.query(
    `SELECT e.*, u.first_name AS _author_first_name, u.last_name AS _author_last_name, u.avatar_url AS _author_avatar_url,
            ed.first_name AS _editor_first_name, ed.last_name AS _editor_last_name, ed.avatar_url AS _editor_avatar_url
     FROM ${quoteIdentifier(tableName)} e
     LEFT JOIN plank_users u ON u.id = e.created_by
     LEFT JOIN plank_users ed ON ed.id = e.editor_id
     WHERE e.id = $1`,
    [entryId],
  )

  if (!rows[0]) return null

  const mmIds = await loadManyToManyIds(entryId, tableName, fields)
  const provider = await getProvider()
  const resolved = resolveLocalizedRow(rows[0], { fields }, locale, fallbacks)
  const authorKey = resolved._author_avatar_url as string | null
  if (authorKey && !authorKey.startsWith('http')) {
    resolved._author_avatar_url = await provider.getUrl(authorKey)
  }
  const editorKey = resolved._editor_avatar_url as string | null
  if (editorKey && !editorKey.startsWith('http')) {
    resolved._editor_avatar_url = await provider.getUrl(editorKey)
  }

  return normalizeNavigationFields({ ...resolved, ...mmIds }, fields)
}

export const getEntry: SlugIdParam = async (req, res) => {
  const ct = await findContentTypeBySlug(req.params.slug)
  if (!ct) {
    res.status(404).json({ error: 'Content type not found' })
    return
  }

  assertSafeIdentifier(ct.tableName)
  const locale = req.query.locale ? String(req.query.locale) : undefined
  const fallbacks = req.query.fallback ? String(req.query.fallback).split(',') : []
  const entry = await loadHydratedEntry(req.params.id, ct.tableName, ct.fields, locale, fallbacks)
  if (!entry) {
    res.status(404).json({ error: 'Entry not found' })
    return
  }
  res.json(entry)
}

export const createEntry: SlugParam = async (req, res) => {
  const ct = await findContentTypeBySlug(req.params.slug)
  if (!ct) {
    res.status(404).json({ error: 'Content type not found' })
    return
  }

  validate(ct, req.body)

  assertSafeIdentifier(ct.tableName)
  const quotedTableName = quoteIdentifier(ct.tableName)
  const isContributor = await isContributorRole(req.user?.roleId)
  if (isContributor && ct.kind === 'single') {
    res.status(403).json({ error: 'Single types are read-only for Contributor role' })
    return
  }

  // M:M fields are virtual — managed via junction tables, not columns
  const mmFields = ct.fields.filter(
    (f) =>
      f.type === 'relation' &&
      (f.relationType ?? 'many-to-one') === 'many-to-many' &&
      req.body[f.name] !== undefined,
  )
  const fields = ct.fields.filter((f) => req.body[f.name] !== undefined && !isVirtualRelation(f))
  fields.forEach((f) => assertSafeIdentifier(f.name))

  // Single Types: upsert — update the existing entry if one already exists
  if (ct.kind === 'single') {
    const { rows: existing } = await pool.query(`SELECT id FROM ${quotedTableName} LIMIT 1`)
    if (existing[0]) {
      const setClauses = fields
        .map((f, i) =>
          f.type === 'media-gallery' || f.type === 'array'
            || f.type === 'navigation'
            ? `${quoteIdentifier(f.name)} = $${i + 1}::jsonb`
            : `${quoteIdentifier(f.name)} = $${i + 1}`,
        )
        .join(', ')
      const extraClauses: string[] = []
      const extraValues: unknown[] = []
      if (req.body.localized !== undefined) {
        extraClauses.push(`localized = $${fields.length + 1}::jsonb`)
        extraValues.push(JSON.stringify(req.body.localized))
      }
      const allClauses = [setClauses, ...extraClauses].filter(Boolean).join(', ')
      const values = [
        ...fields.map((f) => {
          const v = req.body[f.name]
          const normalized = f.type === 'navigation' ? normalizeNavigationItems(v) : v
          return f.type === 'media-gallery' || f.type === 'array' || f.type === 'navigation'
            ? JSON.stringify(normalized)
            : v
        }),
        ...extraValues,
        existing[0].id,
      ]
      const updateSql =
        fields.length + extraValues.length > 0
          ? `UPDATE ${quotedTableName} SET ${allClauses}, updated_at = NOW() WHERE id = $${fields.length + extraValues.length + 1} RETURNING *`
          : `UPDATE ${quotedTableName} SET updated_at = NOW() WHERE id = $1 RETURNING *`
      const updateValues = fields.length + extraValues.length > 0 ? values : [existing[0].id]
      const { rows } = await pool.query(updateSql, updateValues)
      await Promise.all(
        mmFields.map((f) => {
          const ids = Array.isArray(req.body[f.name]) ? (req.body[f.name] as string[]) : []
          return syncManyToMany(existing[0].id, ct.tableName, f, ids)
        }),
      )
      res.json(normalizeNavigationFields(rows[0], ct.fields))
      return
    }
  }

  const id = createId()
  const userId = req.user?.id ?? null
  const extraCols: string[] = []
  const extraPlaceholders: string[] = []
  const extraValues: unknown[] = []
  if (req.body.localized !== undefined) {
    extraCols.push('localized')
    extraPlaceholders.push(`$${3 + fields.length}::jsonb`)
    extraValues.push(JSON.stringify(req.body.localized))
  }
  const cols = ['id', 'created_by', ...fields.map((f) => f.name), ...extraCols]
    .map((col) => quoteIdentifier(col))
    .join(', ')
  const placeholders = [
    '$1',
    '$2',
    ...fields.map((f, i) =>
      f.type === 'media-gallery' || f.type === 'array' || f.type === 'navigation'
        ? `$${i + 3}::jsonb`
        : `$${i + 3}`,
    ),
    ...extraPlaceholders,
  ].join(', ')
  const values = [
    id,
    userId,
    ...fields.map((f) => {
      const v = req.body[f.name]
      const normalized = f.type === 'navigation' ? normalizeNavigationItems(v) : v
      return f.type === 'media-gallery' || f.type === 'array' || f.type === 'navigation'
        ? JSON.stringify(normalized)
        : v
    }),
    ...extraValues,
  ]

  const { rows } = await pool.query(
    `INSERT INTO ${quotedTableName} (${cols}) VALUES (${placeholders}) RETURNING *`,
    values,
  )
  await Promise.all(
    mmFields.map((f) => {
      const ids = Array.isArray(req.body[f.name]) ? (req.body[f.name] as string[]) : []
      return syncManyToMany(id, ct.tableName, f, ids)
    }),
  )
  res.status(201).json(normalizeNavigationFields(rows[0], ct.fields))
  triggerWebhooks('entry.created', { content_type: req.params.slug, entry_id: rows[0].id })
  if ((ct as { previewEnabled?: boolean }).previewEnabled !== false) {
    triggerPreviewSyncWebhook({ contentType: req.params.slug, entry: rows[0] })
  }
}

export const getSingleEntry: SlugParam = async (req, res) => {
  const ct = await findContentTypeBySlug(req.params.slug)
  if (!ct) {
    res.status(404).json({ error: 'Content type not found' })
    return
  }
  if (ct.kind !== 'single') {
    res.status(400).json({ error: 'Content type is not a Single Type' })
    return
  }

  assertSafeIdentifier(ct.tableName)
  const quotedTableName = quoteIdentifier(ct.tableName)
  const { rows } = await pool.query(`SELECT * FROM ${quotedTableName} LIMIT 1`)

  if (!rows[0]) {
    res.status(404).json({ error: 'No entry found' })
    return
  }
  const locale = req.query.locale ? String(req.query.locale) : undefined
  const fallbacks = req.query.fallback ? String(req.query.fallback).split(',') : []
  const mmIds = await loadManyToManyIds(rows[0].id, ct.tableName, ct.fields)
  const provider = await getProvider()
  const resolved = resolveLocalizedRow(rows[0], ct, locale, fallbacks)
  const key = resolved._author_avatar_url as string | null
  if (key && !key.startsWith('http')) resolved._author_avatar_url = await provider.getUrl(key)
  res.json(normalizeNavigationFields({ ...resolved, ...mmIds }, ct.fields))
}

export const updateEntry: SlugIdParam = async (req, res) => {
  const ct = await findContentTypeBySlug(req.params.slug)
  if (!ct) {
    res.status(404).json({ error: 'Content type not found' })
    return
  }

  validate(ct, req.body)

  assertSafeIdentifier(ct.tableName)
  const quotedTableName = quoteIdentifier(ct.tableName)
  const editorialMode = req.appModes?.editorial ?? false
  const currentRole = await roleName(req.user?.roleId)
  const isContributor = currentRole === 'contributor'
  const isEditor = currentRole === 'editor'
  if (isContributor && ct.kind === 'single') {
    res.status(403).json({ error: 'Single types are read-only for Contributor role' })
    return
  }
  if ((isContributor || isEditor) && ct.kind === 'collection') {
    const { rows: authorRows } = await pool.query<{ created_by: string | null; status: string | null }>(
      `SELECT created_by, status FROM ${quotedTableName} WHERE id = $1`,
      [req.params.id],
    )
    if (!authorRows[0]) {
      res.status(404).json({ error: 'Entry not found' })
      return
    }
    if (authorRows[0].created_by !== req.user?.id) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    if (editorialMode && isContributor && authorRows[0].status === 'in_review') {
      res.status(403).json({ error: 'Entry is currently in review and locked for contributor edits' })
      return
    }
  }

  // M:M fields are virtual — managed via junction tables, not columns
  const mmFields = ct.fields.filter(
    (f) =>
      f.type === 'relation' &&
      (f.relationType ?? 'many-to-one') === 'many-to-many' &&
      req.body[f.name] !== undefined,
  )
  const fields = ct.fields.filter((f) => req.body[f.name] !== undefined && !isVirtualRelation(f))
  fields.forEach((f) => assertSafeIdentifier(f.name))

  const setClauses = fields
    .map((f, i) =>
      f.type === 'media-gallery' || f.type === 'array'
        || f.type === 'navigation'
        ? `${quoteIdentifier(f.name)} = $${i + 1}::jsonb`
        : `${quoteIdentifier(f.name)} = $${i + 1}`,
    )
    .join(', ')
  const extraClauses: string[] = []
  const extraValues: unknown[] = []
  if (req.body.localized !== undefined) {
    extraClauses.push(`localized = $${fields.length + 1}::jsonb`)
    extraValues.push(JSON.stringify(req.body.localized))
  }
  const allClauses = [setClauses, ...extraClauses].filter(Boolean).join(', ')
  const values = [
    ...fields.map((f) => {
      const v = req.body[f.name]
      const normalized = f.type === 'navigation' ? normalizeNavigationItems(v) : v
      return f.type === 'media-gallery' || f.type === 'array' || f.type === 'navigation'
        ? JSON.stringify(normalized)
        : v
    }),
    ...extraValues,
    req.params.id,
  ]

  const updateSql =
    fields.length + extraValues.length > 0
      ? `UPDATE ${quotedTableName} SET ${allClauses}, updated_at = NOW() WHERE id = $${fields.length + extraValues.length + 1} RETURNING *`
      : `UPDATE ${quotedTableName} SET updated_at = NOW() WHERE id = $1 RETURNING *`
  const updateValues = fields.length + extraValues.length > 0 ? values : [req.params.id]

  const { rows } = await pool.query(updateSql, updateValues)

  if (!rows[0]) {
    res.status(404).json({ error: 'Entry not found' })
    return
  }

  await Promise.all(
    mmFields.map((f) => {
      const ids = Array.isArray(req.body[f.name]) ? (req.body[f.name] as string[]) : []
      return syncManyToMany(req.params.id, ct.tableName, f, ids)
    }),
  )

  res.json(normalizeNavigationFields(rows[0], ct.fields))
  triggerWebhooks('entry.updated', { content_type: req.params.slug, entry_id: req.params.id })
  if ((ct as { previewEnabled?: boolean }).previewEnabled !== false) {
    triggerPreviewSyncWebhook({ contentType: req.params.slug, entry: rows[0] })
  }
}

// Columns excluded from the published_data snapshot
const SNAPSHOT_EXCLUDED = [
  "'id'",
  "'status'",
  "'published_data'",
  "'published_at'",
  "'scheduled_for'",
  "'created_at'",
  "'updated_at'",
]

function buildSnapshotExpr(tableName: string): string {
  const strip = SNAPSHOT_EXCLUDED.reduce((expr, col) => `${expr} - ${col}`, `to_jsonb(t.*)`)
  return `(SELECT ${strip} FROM ${quoteIdentifier(tableName)} t WHERE t.id = $1)`
}

export const patchEntryStatus: SlugIdParam = async (req, res) => {
  const {
    status,
    scheduled_for,
    editor_id,
    review_locked_by_editor,
    review_rejected,
  } = req.body as {
    status: unknown
    scheduled_for?: unknown
    editor_id?: unknown
    review_locked_by_editor?: unknown
    review_rejected?: unknown
  }
  if (
    status !== 'draft' &&
    status !== 'published' &&
    status !== 'scheduled' &&
    status !== 'pending' &&
    status !== 'in_review'
  ) {
    res.status(400).json({ error: 'status must be draft, published, scheduled, pending, or in_review' })
    return
  }

  if (status === 'scheduled') {
    if (!scheduled_for || typeof scheduled_for !== 'string' || isNaN(Date.parse(scheduled_for))) {
      res.status(400).json({ error: 'scheduled_for must be a valid ISO date string' })
      return
    }
    if (new Date(scheduled_for) <= new Date()) {
      res.status(400).json({ error: 'scheduled_for must be in the future' })
      return
    }
  }

  const ct = await findContentTypeBySlug(req.params.slug)
  if (!ct) {
    res.status(404).json({ error: 'Content type not found' })
    return
  }

  assertSafeIdentifier(ct.tableName)
  const quotedTableName = quoteIdentifier(ct.tableName)
  const editorialMode = req.appModes?.editorial ?? false
  const currentRole = await roleName(req.user?.roleId)
  const isContributor = currentRole === 'contributor'
  const isAdminRole = currentRole === 'admin' || currentRole === 'super admin'
  const isEditorRole = currentRole === 'editor'

  if (isContributor && ct.kind === 'single') {
    res.status(403).json({ error: 'Single types are read-only for Contributor role' })
    return
  }
  if (isContributor && ct.kind === 'collection') {
    const { rows: authorRows } = await pool.query<{ created_by: string | null; review_locked_by_editor: boolean }>(
      `SELECT created_by, review_locked_by_editor FROM ${quotedTableName} WHERE id = $1`,
      [req.params.id],
    )
    if (!authorRows[0]) {
      res.status(404).json({ error: 'Entry not found' })
      return
    }
    if (authorRows[0].created_by !== req.user?.id) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    // Allow contributors to re-submit to pending even if entry is currently locked.
    if (editorialMode && authorRows[0].review_locked_by_editor && status !== 'pending') {
      res.status(403).json({ error: 'Entry is currently locked for contributor edits' })
      return
    }
  }

  if (editorialMode && isContributor && status === 'published') {
    res.status(403).json({ error: 'Contributors cannot publish in editorial mode' })
    return
  }
  if (editorialMode && isContributor && status === 'scheduled') {
    res.status(403).json({ error: 'Contributors cannot schedule in editorial mode' })
    return
  }

  let sql: string
  let values: unknown[]

  if (status === 'published') {
    sql = `
      UPDATE ${quotedTableName} SET
        status = 'published',
        published_data = ${buildSnapshotExpr(ct.tableName)},
        published_at = COALESCE(published_at, NOW()),
        scheduled_for = NULL,
        review_rejected = FALSE,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `
    values = [req.params.id]
  } else if (status === 'scheduled') {
    sql = `
      UPDATE ${quotedTableName} SET
        status = 'scheduled',
        scheduled_for = $2,
        review_rejected = FALSE,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `
    values = [req.params.id, scheduled_for]
  } else if (status === 'pending') {
    sql = `
      UPDATE ${quotedTableName} SET
        status = 'pending',
        review_rejected = COALESCE($2, FALSE),
        review_locked_by_editor = FALSE,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `
    values = [req.params.id, typeof review_rejected === 'boolean' ? review_rejected : false]
  } else if (status === 'in_review') {
    if (!editorialMode) {
      res.status(403).json({ error: 'In review status requires editorial mode' })
      return
    }
    const { rows: currentRows } = await pool.query<{ status: string | null }>(
      `SELECT status FROM ${quotedTableName} WHERE id = $1`,
      [req.params.id],
    )
    if (!currentRows[0]) {
      res.status(404).json({ error: 'Entry not found' })
      return
    }
    if (currentRows[0].status !== 'pending' && currentRows[0].status !== 'in_review') {
      res.status(400).json({ error: 'Only entries in review flow can be assigned to an Editor' })
      return
    }
    if (!isAdminRole && !isEditorRole) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    const requestedEditorId =
      typeof editor_id === 'string' && editor_id.trim().length > 0
        ? editor_id
        : isEditorRole
          ? req.user?.id ?? null
          : null
    if (isEditorRole && requestedEditorId && requestedEditorId !== req.user?.id) {
      res.status(403).json({ error: 'Editors can only assign themselves' })
      return
    }
    if (requestedEditorId) {
      const { rows: editorRows } = await pool.query<{ role_name: string }>(
        `SELECT r.name as role_name
         FROM plank_users u
         JOIN plank_roles r ON r.id = u.role_id
         WHERE u.id = $1`,
        [requestedEditorId],
      )
      const targetRole = editorRows[0]?.role_name?.toLowerCase()
      if (isAdminRole) {
        if (requestedEditorId !== req.user?.id && targetRole !== 'editor') {
          res.status(403).json({ error: 'Admins can assign only themselves or Editors' })
          return
        }
      } else if (targetRole !== 'editor') {
        res.status(403).json({ error: 'Invalid editor assignee' })
        return
      }
    }
    const nextEditorId =
      requestedEditorId ??
      (isEditorRole ? req.user?.id ?? null : null)
    const lock = typeof review_locked_by_editor === 'boolean' ? review_locked_by_editor : false
    sql = `
      UPDATE ${quotedTableName} SET
        status = 'in_review',
        editor_id = $2,
        review_locked_by_editor = $3,
        review_rejected = FALSE,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `
    values = [req.params.id, nextEditorId, lock]
  } else {
    sql = `
      UPDATE ${quotedTableName} SET
        status = 'draft',
        published_data = NULL,
        published_at = NULL,
        scheduled_for = NULL,
        review_rejected = FALSE,
        review_locked_by_editor = FALSE,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `
    values = [req.params.id]
  }

  const { rows } = await pool.query(sql, values)

  if (!rows[0]) {
    res.status(404).json({ error: 'Entry not found' })
    return
  }
  const entry = await loadHydratedEntry(req.params.id, ct.tableName, ct.fields)
  if (!entry) {
    res.status(404).json({ error: 'Entry not found' })
    return
  }
  res.json(entry)

  const webhookEvent =
    status === 'published' ? 'entry.published' : status === 'draft' ? 'entry.unpublished' : null
  if (webhookEvent)
    triggerWebhooks(webhookEvent, { content_type: req.params.slug, entry_id: req.params.id })
}

export const deleteEntry: SlugIdParam = async (req, res) => {
  const ct = await findContentTypeBySlug(req.params.slug)
  if (!ct) {
    res.status(404).json({ error: 'Content type not found' })
    return
  }

  assertSafeIdentifier(ct.tableName)
  const quotedTableName = quoteIdentifier(ct.tableName)
  const currentRole = await roleName(req.user?.roleId)
  const isContributor = currentRole === 'contributor'
  const isEditor = currentRole === 'editor'
  if (isContributor && ct.kind === 'single') {
    res.status(403).json({ error: 'Single types are read-only for Contributor role' })
    return
  }
  if ((isContributor || isEditor) && ct.kind === 'collection') {
    const { rows: authorRows } = await pool.query<{ created_by: string | null }>(
      `SELECT created_by FROM ${quotedTableName} WHERE id = $1`,
      [req.params.id],
    )
    if (!authorRows[0]) {
      res.status(404).json({ error: 'Entry not found' })
      return
    }
    if (authorRows[0].created_by !== req.user?.id) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
  }
  const { rowCount } = await pool.query(`DELETE FROM ${quotedTableName} WHERE id = $1`, [
    req.params.id,
  ])

  if (!rowCount) {
    res.status(404).json({ error: 'Entry not found' })
    return
  }
  res.status(204).end()
  triggerWebhooks('entry.deleted', { content_type: req.params.slug, entry_id: req.params.id })
}
