import { pool, createId } from '@plank-cms/db'
import {
  findContentTypeBySlug,
  validate,
  assertSafeIdentifier,
  isVirtualField,
  ownsManyToManyRelation,
  quoteIdentifier,
} from '@plank-cms/schema'
import type { FieldDefinition } from '@plank-cms/schema'
import { getProvider } from '../media/index.js'
import { triggerPreviewSyncWebhook, triggerWebhooks } from '../controllers/webhooks.js'

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
  const localizableTypes = new Set([
    'string',
    'text',
    'richtext',
    'uid',
    'array',
    'table',
    'navigation',
  ])
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

export function resolveManyToManyBinding(
  tableName: string,
  field: FieldDefinition,
): {
  junctionTable: string
  currentIdColumn: 'source_id' | 'target_id'
  relatedIdColumn: 'source_id' | 'target_id'
} {
  const isInverse =
    (field.relationType ?? 'many-to-one') === 'many-to-many' &&
    typeof field.relatedTable === 'string' &&
    field.relatedTable.length > 0 &&
    typeof field.relatedField === 'string' &&
    field.relatedField.length > 0

  if (isInverse) {
    return {
      junctionTable: junctionTableName(field.relatedTable!, field.relatedField!),
      currentIdColumn: 'target_id',
      relatedIdColumn: 'source_id',
    }
  }

  return {
    junctionTable: junctionTableName(tableName, field.name),
    currentIdColumn: 'source_id',
    relatedIdColumn: 'target_id',
  }
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
  db: Pick<typeof pool, 'query'> = pool,
): Promise<void> {
  const binding = resolveManyToManyBinding(tableName, field)
  await db.query(
    `DELETE FROM ${quoteIdentifier(binding.junctionTable)} WHERE ${quoteIdentifier(binding.currentIdColumn)} = $1`,
    [entryId],
  )
  if (targetIds.length === 0) return
  const tuples = targetIds
    .map((_, i) =>
      binding.currentIdColumn === 'source_id' ? `($1, $${i + 2})` : `($${i + 2}, $1)`,
    )
    .join(', ')
  await db.query(
    `INSERT INTO ${quoteIdentifier(binding.junctionTable)} (source_id, target_id) VALUES ${tuples} ON CONFLICT DO NOTHING`,
    [entryId, ...targetIds],
  )
}

export type EntryContext = {
  slug: string
  id: string
  data: Record<string, unknown>
  query: Record<string, unknown>
  user?: { id: string; roleId: string }
  editorial?: boolean
  db?: Pick<typeof pool, 'query'>
  validationData?: Record<string, unknown>
  draftOnly?: boolean
  notify?: (notification: () => void) => void
  beforeWrite?: (
    ct: import('@plank-cms/schema').ContentType,
    current: Record<string, unknown> | null,
  ) => Promise<void>
}

export class EntryError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function isContributorRole(
  roleId: string | undefined,
  db: Pick<typeof pool, 'query'> = pool,
): Promise<boolean> {
  if (!roleId) return false
  const { rows } = await db.query<{ name: string }>('SELECT name FROM plank_roles WHERE id = $1', [
    roleId,
  ])
  return rows[0]?.name?.toLowerCase() === 'contributor'
}

export async function roleName(
  roleId: string | undefined,
  db: Pick<typeof pool, 'query'> = pool,
): Promise<string> {
  if (!roleId) return ''
  const { rows } = await db.query<{ name: string }>('SELECT name FROM plank_roles WHERE id = $1', [
    roleId,
  ])
  return rows[0]?.name?.toLowerCase() ?? ''
}

export async function listEntryData(context: EntryContext) {
  const db = context.db ?? pool
  const ct = await findContentTypeBySlug(context.slug, context.db ?? pool)
  if (!ct) {
    throw new EntryError(404, 'Content type not found')
  }

  assertSafeIdentifier(ct.tableName)
  const quotedTableName = quoteIdentifier(ct.tableName)
  const page = Math.max(1, parseInt(String(context.query.page ?? 1)))
  const limit = Math.min(100, Math.max(1, parseInt(String(context.query.limit ?? 20))))
  const offset = (page - 1) * limit

  const allowedSort = [
    'created_at',
    'updated_at',
    'published_at',
    ...ct.fields.filter((field) => field.type !== 'separator').map((field) => field.name),
  ]
  const sortField = allowedSort.includes(String(context.query.sort ?? ''))
    ? String(context.query.sort)
    : 'created_at'
  const sortDir = context.query.order === 'asc' ? 'ASC' : 'DESC'
  assertSafeIdentifier(sortField)
  const quotedSortField = quoteIdentifier(sortField)

  const locale = context.query.locale ? String(context.query.locale) : undefined
  const displayLocale = context.query.displayLocale ? String(context.query.displayLocale) : locale
  const fallbacks = context.query.fallback ? String(context.query.fallback).split(',') : []

  const search = context.query.search ? String(context.query.search).trim() : ''
  const rawSearchFields = context.query.searchFields
    ? String(context.query.searchFields).split(',')
    : []
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
  const statusFilter = context.query.status ? String(context.query.status) : ''
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
    db.query(
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
    db.query(`SELECT COUNT(*) as count FROM ${quotedTableName} e ${countWhereClause}`, countParams),
    db.query<{ status: string }>(
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
      const mmIds = await loadManyToManyIds(row.id, ct.tableName, ct.fields, db)
      const resolved = resolveLocalizedRow(row, ct, displayLocale, fallbacks)
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
      const { rows: allRows } = await db.query<Record<string, unknown>>(
        `SELECT localized FROM ${quotedTableName}`,
      )
      const matching = allRows.filter((r) => entryMatchesLocale(r, locale))
      total = matching.length
    } catch {
      // fallback to previous total
    }
  }

  return {
    data,
    total,
    page,
    limit,
    available_statuses: statusRows
      .map((row) => row.status)
      .filter((value) => allowedStatuses.includes(value)),
  }
}

export async function loadManyToManyIds(
  entryId: string,
  tableName: string,
  fields: import('@plank-cms/schema').FieldDefinition[],
  db: Pick<typeof pool, 'query'> = pool,
): Promise<Record<string, string[]>> {
  const mmFields = fields.filter(
    (f) => f.type === 'relation' && (f.relationType ?? 'many-to-one') === 'many-to-many',
  )
  if (mmFields.length === 0) return {}
  const result: Record<string, string[]> = {}
  await Promise.all(
    mmFields.map(async (f) => {
      const binding = resolveManyToManyBinding(tableName, f)
      try {
        const { rows } = await db.query<Record<'related_id', string>>(
          `SELECT ${quoteIdentifier(binding.relatedIdColumn)} AS related_id
           FROM ${quoteIdentifier(binding.junctionTable)}
           WHERE ${quoteIdentifier(binding.currentIdColumn)} = $1`,
          [entryId],
        )
        result[f.name] = rows.map((r) => r.related_id)
      } catch (error) {
        const code = (error as { code?: string }).code
        if (code !== '42P01' || ownsManyToManyRelation(f)) throw error
        result[f.name] = []
      }
    }),
  )
  return result
}

export async function loadHydratedEntry(
  entryId: string,
  tableName: string,
  fields: import('@plank-cms/schema').FieldDefinition[],
  locale?: string,
  fallbacks: string[] = [],
  db: Pick<typeof pool, 'query'> = pool,
): Promise<Record<string, unknown> | null> {
  const { rows } = await db.query(
    `SELECT e.*, u.first_name AS _author_first_name, u.last_name AS _author_last_name, u.avatar_url AS _author_avatar_url,
            ed.first_name AS _editor_first_name, ed.last_name AS _editor_last_name, ed.avatar_url AS _editor_avatar_url
     FROM ${quoteIdentifier(tableName)} e
     LEFT JOIN plank_users u ON u.id = e.created_by
     LEFT JOIN plank_users ed ON ed.id = e.editor_id
     WHERE e.id = $1`,
    [entryId],
  )

  if (!rows[0]) return null

  const mmIds = await loadManyToManyIds(entryId, tableName, fields, db)
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

export async function getEntryData(context: EntryContext) {
  const ct = await findContentTypeBySlug(context.slug, context.db ?? pool)
  if (!ct) {
    throw new EntryError(404, 'Content type not found')
  }

  assertSafeIdentifier(ct.tableName)
  const locale = context.query.locale ? String(context.query.locale) : undefined
  const displayLocale = context.query.displayLocale ? String(context.query.displayLocale) : locale
  const fallbacks = context.query.fallback ? String(context.query.fallback).split(',') : []
  const entry = await loadHydratedEntry(
    context.id,
    ct.tableName,
    ct.fields,
    displayLocale,
    fallbacks,
  )
  if (!entry) {
    throw new EntryError(404, 'Entry not found')
  }
  return entry
}

export async function createEntryData(context: EntryContext) {
  const db = context.db ?? pool
  const ct = await findContentTypeBySlug(context.slug, context.db ?? pool)
  if (!ct) {
    throw new EntryError(404, 'Content type not found')
  }

  await context.beforeWrite?.(ct, null)
  validate(ct, context.validationData ?? context.data)

  assertSafeIdentifier(ct.tableName)
  const quotedTableName = quoteIdentifier(ct.tableName)
  const isContributor = await isContributorRole(context.user?.roleId, db)
  if (isContributor && ct.kind === 'single') {
    throw new EntryError(403, 'Single types are read-only for Contributor role')
  }

  // M:M fields are virtual — managed via junction tables, not columns
  const mmFields = ct.fields.filter(
    (f) =>
      f.type === 'relation' &&
      (f.relationType ?? 'many-to-one') === 'many-to-many' &&
      context.data[f.name] !== undefined,
  )
  const fields = ct.fields.filter((f) => context.data[f.name] !== undefined && !isVirtualField(f))
  fields.forEach((f) => assertSafeIdentifier(f.name))

  // Single Types: upsert — update the existing entry if one already exists
  if (ct.kind === 'single') {
    const { rows: existing } = await db.query(`SELECT id FROM ${quotedTableName} LIMIT 1`)
    if (existing[0]) {
      const setClauses = fields
        .map((f, i) =>
          f.type === 'media-gallery' ||
          f.type === 'array' ||
          f.type === 'table' ||
          f.type === 'navigation'
            ? `${quoteIdentifier(f.name)} = $${i + 1}::jsonb`
            : `${quoteIdentifier(f.name)} = $${i + 1}`,
        )
        .join(', ')
      const extraClauses: string[] = []
      const extraValues: unknown[] = []
      if (context.data.localized !== undefined) {
        extraClauses.push(`localized = $${fields.length + 1}::jsonb`)
        extraValues.push(JSON.stringify(context.data.localized))
      }
      const allClauses = [setClauses, ...extraClauses].filter(Boolean).join(', ')
      const values = [
        ...fields.map((f) => {
          const v = context.data[f.name]
          const normalized = f.type === 'navigation' ? normalizeNavigationItems(v) : v
          return f.type === 'media-gallery' ||
            f.type === 'array' ||
            f.type === 'table' ||
            f.type === 'navigation'
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
      const { rows } = await db.query(updateSql, updateValues)
      await Promise.all(
        mmFields.map((f) => {
          const ids = Array.isArray(context.data[f.name]) ? (context.data[f.name] as string[]) : []
          return syncManyToMany(existing[0].id, ct.tableName, f, ids, db)
        }),
      )
      return { entry: normalizeNavigationFields(rows[0], ct.fields), created: false }
    }
  }

  const id = createId()
  const userId = context.user?.id ?? null
  const extraCols: string[] = []
  const extraPlaceholders: string[] = []
  const extraValues: unknown[] = []
  if (context.data.localized !== undefined) {
    extraCols.push('localized')
    extraPlaceholders.push(`$${3 + fields.length}::jsonb`)
    extraValues.push(JSON.stringify(context.data.localized))
  }
  if (context.draftOnly) {
    extraCols.push('status')
    extraPlaceholders.push(`$${3 + fields.length + extraValues.length}`)
    extraValues.push('draft')
  }
  const cols = ['id', 'created_by', ...fields.map((f) => f.name), ...extraCols]
    .map((col) => quoteIdentifier(col))
    .join(', ')
  const placeholders = [
    '$1',
    '$2',
    ...fields.map((f, i) =>
      f.type === 'media-gallery' ||
      f.type === 'array' ||
      f.type === 'table' ||
      f.type === 'navigation'
        ? `$${i + 3}::jsonb`
        : `$${i + 3}`,
    ),
    ...extraPlaceholders,
  ].join(', ')
  const values = [
    id,
    userId,
    ...fields.map((f) => {
      const v = context.data[f.name]
      const normalized = f.type === 'navigation' ? normalizeNavigationItems(v) : v
      return f.type === 'media-gallery' ||
        f.type === 'array' ||
        f.type === 'table' ||
        f.type === 'navigation'
        ? JSON.stringify(normalized)
        : v
    }),
    ...extraValues,
  ]

  const { rows } = await db.query(
    `INSERT INTO ${quotedTableName} (${cols}) VALUES (${placeholders}) RETURNING *`,
    values,
  )
  await Promise.all(
    mmFields.map((f) => {
      const ids = Array.isArray(context.data[f.name]) ? (context.data[f.name] as string[]) : []
      return syncManyToMany(id, ct.tableName, f, ids, db)
    }),
  )
  const notify = () => {
    triggerWebhooks('entry.created', { content_type: context.slug, entry_id: rows[0].id })
    if (ct.previewEnabled !== false)
      triggerPreviewSyncWebhook({ contentType: context.slug, entry: rows[0] })
  }
  if (context.notify) context.notify(notify)
  else notify()
  return { entry: normalizeNavigationFields(rows[0], ct.fields), created: true }
}

export async function getSingleEntryData(context: EntryContext) {
  const db = context.db ?? pool
  const ct = await findContentTypeBySlug(context.slug, context.db ?? pool)
  if (!ct) {
    throw new EntryError(404, 'Content type not found')
  }
  if (ct.kind !== 'single') {
    throw new EntryError(400, 'Content type is not a Single Type')
  }

  assertSafeIdentifier(ct.tableName)
  const quotedTableName = quoteIdentifier(ct.tableName)
  const { rows } = await db.query(`SELECT * FROM ${quotedTableName} LIMIT 1`)

  if (!rows[0]) {
    throw new EntryError(404, 'No entry found')
  }
  const locale = context.query.locale ? String(context.query.locale) : undefined
  const fallbacks = context.query.fallback ? String(context.query.fallback).split(',') : []
  const mmIds = await loadManyToManyIds(rows[0].id, ct.tableName, ct.fields)
  const provider = await getProvider()
  const resolved = resolveLocalizedRow(rows[0], ct, locale, fallbacks)
  const key = resolved._author_avatar_url as string | null
  if (key && !key.startsWith('http')) resolved._author_avatar_url = await provider.getUrl(key)
  return normalizeNavigationFields({ ...resolved, ...mmIds }, ct.fields)
}

export async function updateEntryData(context: EntryContext) {
  const db = context.db ?? pool
  const ct = await findContentTypeBySlug(context.slug, context.db ?? pool)
  if (!ct) {
    throw new EntryError(404, 'Content type not found')
  }

  if (context.beforeWrite) {
    const { rows } = await db.query(
      `SELECT * FROM ${quoteIdentifier(ct.tableName)} WHERE id = $1 FOR UPDATE`,
      [context.id],
    )
    if (!rows[0]) throw new EntryError(404, 'Entry not found')
    await context.beforeWrite(ct, rows[0])
  }
  validate(ct, context.validationData ?? context.data)

  assertSafeIdentifier(ct.tableName)
  const quotedTableName = quoteIdentifier(ct.tableName)
  const editorialMode = context.editorial ?? false
  const currentRole = await roleName(context.user?.roleId, db)
  const isContributor = currentRole === 'contributor'
  const isEditor = currentRole === 'editor'
  if (isContributor && ct.kind === 'single') {
    throw new EntryError(403, 'Single types are read-only for Contributor role')
  }
  if ((isContributor || isEditor) && ct.kind === 'collection') {
    const { rows: authorRows } = await db.query<{
      created_by: string | null
      status: string | null
    }>(`SELECT created_by, status FROM ${quotedTableName} WHERE id = $1`, [context.id])
    if (!authorRows[0]) {
      throw new EntryError(404, 'Entry not found')
    }
    if (authorRows[0].created_by !== context.user?.id) {
      throw new EntryError(403, 'Forbidden')
    }
    if (editorialMode && isContributor && authorRows[0].status === 'in_review') {
      throw new EntryError(403, 'Entry is currently in review and locked for contributor edits')
    }
  }

  // M:M fields are virtual — managed via junction tables, not columns
  const mmFields = ct.fields.filter(
    (f) =>
      f.type === 'relation' &&
      (f.relationType ?? 'many-to-one') === 'many-to-many' &&
      context.data[f.name] !== undefined,
  )
  const fields = ct.fields.filter((f) => context.data[f.name] !== undefined && !isVirtualField(f))
  fields.forEach((f) => assertSafeIdentifier(f.name))

  const setClauses = fields
    .map((f, i) =>
      f.type === 'media-gallery' ||
      f.type === 'array' ||
      f.type === 'table' ||
      f.type === 'navigation'
        ? `${quoteIdentifier(f.name)} = $${i + 1}::jsonb`
        : `${quoteIdentifier(f.name)} = $${i + 1}`,
    )
    .join(', ')
  const extraClauses: string[] = []
  const extraValues: unknown[] = []
  if (context.data.localized !== undefined) {
    extraClauses.push(`localized = $${fields.length + 1}::jsonb`)
    extraValues.push(JSON.stringify(context.data.localized))
  }
  const allClauses = [setClauses, ...extraClauses].filter(Boolean).join(', ')
  const values = [
    ...fields.map((f) => {
      const v = context.data[f.name]
      const normalized = f.type === 'navigation' ? normalizeNavigationItems(v) : v
      return f.type === 'media-gallery' ||
        f.type === 'array' ||
        f.type === 'table' ||
        f.type === 'navigation'
        ? JSON.stringify(normalized)
        : v
    }),
    ...extraValues,
    context.id,
  ]

  const updateSql =
    fields.length + extraValues.length > 0
      ? `UPDATE ${quotedTableName} SET ${allClauses}, updated_at = NOW() WHERE id = $${fields.length + extraValues.length + 1} RETURNING *`
      : `UPDATE ${quotedTableName} SET updated_at = NOW() WHERE id = $1 RETURNING *`
  const updateValues = fields.length + extraValues.length > 0 ? values : [context.id]

  const { rows } = await db.query(updateSql, updateValues)

  if (!rows[0]) {
    throw new EntryError(404, 'Entry not found')
  }

  await Promise.all(
    mmFields.map((f) => {
      const ids = Array.isArray(context.data[f.name]) ? (context.data[f.name] as string[]) : []
      return syncManyToMany(context.id, ct.tableName, f, ids, db)
    }),
  )

  const notify = () => {
    triggerWebhooks('entry.updated', { content_type: context.slug, entry_id: context.id })
    if (ct.previewEnabled !== false) {
      triggerPreviewSyncWebhook({
        contentType: context.slug,
        entry: rows[0],
        status: rows[0].status === 'published' ? 'preview' : undefined,
      })
    }
  }
  if (context.notify) context.notify(notify)
  else notify()
  return normalizeNavigationFields(rows[0], ct.fields)
}
