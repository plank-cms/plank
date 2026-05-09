import type { RequestHandler } from 'express'
import { pool } from '@plank-cms/db'
import { findContentTypeBySlug, assertSafeIdentifier } from '@plank-cms/schema'
import type { ContentType, FieldDefinition } from '@plank-cms/schema'
import { getProvider } from '../media/index.js'

type SlugParam = RequestHandler<{ slug: string }>
type SlugIdParam = RequestHandler<{ slug: string; id: string }>
type AuthorSlugParam = RequestHandler<{ slug: string }>

type Row = Record<string, unknown> & {
  published_data?: Record<string, unknown> | null
  published_at?: unknown
  _author_first_name?: string | null
  _author_last_name?: string | null
  _author_slug?: string | null
  _author_avatar_url?: string | null
  _author_job_title?: string | null
  _author_organization?: string | null
  _author_country?: string | null
  _editor_first_name?: string | null
  _editor_last_name?: string | null
  _editor_slug?: string | null
  _editor_avatar_url?: string | null
  _editor_job_title?: string | null
  _editor_organization?: string | null
  _editor_country?: string | null
}
type LocalizedValues = Record<string, Record<string, unknown>>
type FieldSelection = {
  include: Set<string> | null
  exclude: Set<string>
}
type FilterOperator = 'eq' | 'ne' | 'in' | 'nin'
type ParsedFilter = {
  field: FieldDefinition
  operator: FilterOperator
  rawValue: unknown
  rawKey: string
}

type MediaValue = {
  id: string | null
  url: string
  alt: string | null
  figcaption: string | null
  width: number | null
  height: number | null
}

function createMediaValue(
  url: string,
  options?: {
    id?: string | null
    alt?: string | null
    figcaption?: string | null
    width?: number | null
    height?: number | null
  },
): MediaValue {
  return {
    id: options?.id ?? null,
    url,
    alt: options?.alt ?? null,
    figcaption: options?.figcaption ?? null,
    width: options?.width ?? null,
    height: options?.height ?? null,
  }
}

const SYSTEM_RESPONSE_FIELDS = [
  'id',
  'status',
  'published_at',
  'created_at',
  'updated_at',
  'author',
  'editor',
] as const

type PublicAuthor = {
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  job_title: string | null
  organization: string | null
  country: string | null
  slug: string
}

function parseCsvParam(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => parseCsvParam(item))
  }
  return []
}

function coerceFilterValue(raw: string, field: FieldDefinition): unknown {
  if (field.type === 'number') {
    const parsed = field.subtype === 'float' ? Number.parseFloat(raw) : Number.parseInt(raw, 10)
    return Number.isNaN(parsed) ? raw : parsed
  }
  if (field.type === 'boolean') {
    if (raw === 'true') return true
    if (raw === 'false') return false
  }
  return raw
}

function coerceFilterValues(value: unknown, field: FieldDefinition): unknown[] {
  return parseCsvParam(value).map((item) => coerceFilterValue(item, field))
}

function isFilterOperator(value: string): value is FilterOperator {
  return value === 'eq' || value === 'ne' || value === 'in' || value === 'nin'
}

function parseFilters(
  query: Record<string, unknown>,
  fieldMap: Map<string, FieldDefinition>,
): { filters: ParsedFilter[]; invalidFilters: string[] } {
  const filters: ParsedFilter[] = []
  const invalidFilters: string[] = []

  const filtersObject =
    query.filters && typeof query.filters === 'object' && !Array.isArray(query.filters)
      ? (query.filters as Record<string, unknown>)
      : null

  if (filtersObject) {
    for (const [fieldName, operatorValue] of Object.entries(filtersObject)) {
      const field = fieldMap.get(fieldName)
      if (
        !field ||
        typeof operatorValue !== 'object' ||
        operatorValue === null ||
        Array.isArray(operatorValue)
      ) {
        invalidFilters.push(`filters.${fieldName}`)
        continue
      }
      for (const [operatorKey, rawValue] of Object.entries(
        operatorValue as Record<string, unknown>,
      )) {
        if (!isFilterOperator(operatorKey)) {
          invalidFilters.push(`filters.${fieldName}.${operatorKey}`)
          continue
        }
        filters.push({
          field,
          operator: operatorKey,
          rawValue,
          rawKey: `filters[${fieldName}][${operatorKey}]`,
        })
      }
    }
  }

  for (const [key, rawValue] of Object.entries(query)) {
    const match = /^filters\[([^\]]+)\]\[([^\]]+)\]$/.exec(key)
    if (!match) continue
    const [, fieldName, operatorKey] = match
    const field = fieldMap.get(fieldName)
    if (!field || !isFilterOperator(operatorKey)) {
      invalidFilters.push(key)
      continue
    }
    filters.push({ field, operator: operatorKey, rawValue, rawKey: key })
  }

  return { filters, invalidFilters }
}

function parseFieldSelection(
  query: Record<string, unknown>,
  ct: ContentType,
): { selection: FieldSelection; invalidFields: string[] } {
  const includeFields = [...parseCsvParam(query.fields), ...parseCsvParam(query.select)]
  const excludeFields = parseCsvParam(query.exclude)
  const allowedFields = new Set<string>([
    ...ct.fields.map((field) => field.name),
    ...SYSTEM_RESPONSE_FIELDS,
  ])
  const invalidFields = [...includeFields, ...excludeFields].filter(
    (field) => !allowedFields.has(field),
  )

  return {
    selection: {
      include: includeFields.length > 0 ? new Set(includeFields) : null,
      exclude: new Set(excludeFields),
    },
    invalidFields,
  }
}

function selectEntryFields(
  entry: Record<string, unknown>,
  ct: ContentType,
  selection: FieldSelection,
): Record<string, unknown> {
  if (selection.include === null && selection.exclude.size === 0) return entry

  const out: Record<string, unknown> = {}
  const orderedKeys = [
    'id',
    ...ct.fields.map((field) => field.name),
    'status',
    'published_at',
    'created_at',
    'updated_at',
    'author',
    'editor',
  ]

  for (const key of orderedKeys) {
    if (!(key in entry)) continue
    if (selection.include && !selection.include.has(key)) continue
    if (selection.exclude.has(key)) continue
    out[key] = entry[key]
  }

  return out
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

function normalizeArrayItemsBySchema(value: unknown, field: FieldDefinition): unknown {
  if (field.type !== 'array' || !Array.isArray(value)) return value
  const subFields = field.arrayFields ?? []
  if (subFields.length === 0) return value

  return value.map((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return item
    const raw = item as Record<string, unknown>
    const normalized: Record<string, unknown> = {}

    // Keep the same order as configured in the Content Type Builder
    for (const subField of subFields) {
      if (subField.name in raw) normalized[subField.name] = raw[subField.name]
    }

    // Preserve unknown keys after the defined schema keys
    for (const [key, val] of Object.entries(raw)) {
      if (key in normalized) continue
      normalized[key] = val
    }

    return normalized
  })
}

function collectMediaIdsFromValue(
  field: FieldDefinition,
  value: unknown,
  idSet: Set<string>,
): void {
  if (field.type === 'media') {
    if (typeof value === 'string' && value && !value.startsWith('http')) idSet.add(value)
    return
  }

  if (field.type === 'media-gallery') {
    if (!Array.isArray(value)) return
    for (const item of value) {
      if (typeof item === 'string' && item && !item.startsWith('http')) idSet.add(item)
    }
    return
  }

  if (field.type !== 'array' || !Array.isArray(value)) return

  const subFields = field.arrayFields ?? []
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
    const raw = item as Record<string, unknown>
    for (const subField of subFields) {
      collectMediaIdsFromValue(subField as FieldDefinition, raw[subField.name], idSet)
    }
  }
}

function resolveMediaValue(
  field: FieldDefinition,
  value: unknown,
  mediaMap: Map<string, MediaValue>,
): unknown {
  if (field.type === 'media') {
    if (typeof value === 'string' && value.startsWith('http')) return createMediaValue(value)
    if (typeof value === 'string' && mediaMap.has(value)) return mediaMap.get(value)
    return value
  }

  if (field.type === 'media-gallery') {
    if (!Array.isArray(value)) return value
    return value.map((item) => {
      if (typeof item === 'string' && item.startsWith('http')) return createMediaValue(item)
      if (typeof item === 'string' && mediaMap.has(item)) return mediaMap.get(item)
      return item
    })
  }

  if (field.type !== 'array' || !Array.isArray(value)) return value

  const subFields = field.arrayFields ?? []
  return value.map((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return item
    const raw = item as Record<string, unknown>
    const next: Record<string, unknown> = { ...raw }
    for (const subField of subFields) {
      if (!(subField.name in raw)) continue
      next[subField.name] = resolveMediaValue(
        subField as FieldDefinition,
        raw[subField.name],
        mediaMap,
      )
    }
    return next
  })
}

// Resolves media IDs to fresh URLs in-place across a list of serialized entries
async function resolveMediaFields(
  entries: Record<string, unknown>[],
  ct: ContentType,
): Promise<void> {
  const idSet = new Set<string>()
  for (const entry of entries) {
    for (const field of ct.fields) {
      collectMediaIdsFromValue(field, entry[field.name], idSet)
    }
  }

  const mediaMap = new Map<string, MediaValue>()
  if (idSet.size > 0) {
    const { rows } = await pool.query<{
      id: string
      provider_key: string
      alt: string | null
      caption: string | null
      width: number | null
      height: number | null
    }>('SELECT id, provider_key, alt, caption, width, height FROM plank_media WHERE id = ANY($1)', [
      [...idSet],
    ])

    const provider = await getProvider()
    await Promise.all(
      rows.map(async (r) => {
        mediaMap.set(
          r.id,
          createMediaValue(await provider.getUrl(r.provider_key), {
            id: r.id,
            alt: r.alt,
            figcaption: r.caption,
            width: r.width,
            height: r.height,
          }),
        )
      }),
    )
  }

  for (const entry of entries) {
    for (const field of ct.fields) {
      entry[field.name] = resolveMediaValue(field, entry[field.name], mediaMap)
    }
  }
}

const SYSTEM_FIELDS = new Set([
  'status',
  'published_data',
  'published_at',
  'scheduled_for',
  'created_by',
  'created_at',
  'updated_at',
])

function stripSystemFields(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([k]) => !SYSTEM_FIELDS.has(k)))
}

async function resolveRelationFields(
  entries: Record<string, unknown>[],
  ct: ContentType,
): Promise<void> {
  const scalarFields = ct.fields.filter(
    (f) =>
      f.type === 'relation' &&
      (f.relationType === 'many-to-one' || f.relationType === 'one-to-one' || !f.relationType) &&
      f.relatedTable,
  )
  const mmFields = ct.fields.filter(
    (f) =>
      f.type === 'relation' &&
      (f.relationType ?? 'many-to-one') === 'many-to-many' &&
      f.relatedTable,
  )

  const entryIds = entries.map((e) => e.id as string)

  await Promise.all([
    ...scalarFields.map(async (field) => {
      const ids = entries.map((e) => e[field.name] as string).filter(Boolean)
      if (ids.length === 0) return
      assertSafeIdentifier(field.relatedTable!)
      const { rows } = await pool.query(`SELECT * FROM ${field.relatedTable} WHERE id = ANY($1)`, [
        ids,
      ])
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
        const { rows: relRows } = await pool.query(
          `SELECT * FROM ${field.relatedTable} WHERE id = ANY($1)`,
          [allTargetIds],
        )
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
      const editor = entry.editor as { avatar_url: string | null } | null
      if (editor?.avatar_url && !editor.avatar_url.startsWith('http')) {
        editor.avatar_url = await provider.getUrl(editor.avatar_url)
      }
    }),
  )
}

async function resolvePublicAuthorAvatar(author: PublicAuthor): Promise<PublicAuthor> {
  if (!author.avatar_url || author.avatar_url.startsWith('http')) return author
  const provider = await getProvider()
  return { ...author, avatar_url: await provider.getUrl(author.avatar_url) }
}

function serializePublicAuthor(row: {
  public_author_slug: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  job_title: string | null
  organization: string | null
  country: string | null
}): PublicAuthor {
  return {
    first_name: row.first_name,
    last_name: row.last_name,
    avatar_url: row.avatar_url,
    job_title: row.job_title,
    organization: row.organization,
    country: row.country,
    slug: row.public_author_slug,
  }
}

// Builds an ordered response: id first, then CT fields in builder order, then system fields
function serializeEntry(
  row: Row,
  ct: ContentType,
  statusParam: string,
  locale?: string,
  fallbacks: string[] = [],
): Record<string, unknown> {
  const {
    published_data,
    _author_first_name,
    _author_last_name,
    _author_avatar_url,
    _author_job_title,
    _author_organization,
    _author_country,
    _editor_first_name,
    _editor_last_name,
    _editor_avatar_url,
    _editor_job_title,
    _editor_organization,
    _editor_country,
    ...rest
  } = row
  const source =
    statusParam === 'published' && published_data
      ? (published_data as Record<string, unknown>)
      : (rest as Record<string, unknown>)

  // Build an effective source object where localized values (if any) are applied
  const effective: Record<string, unknown> = { ...source }
  if (locale) {
    const sourceObj = source as Record<string, unknown>
    const localizedContainer =
      source &&
      typeof source === 'object' &&
      sourceObj.localized &&
      typeof sourceObj.localized === 'object'
        ? (sourceObj.localized as LocalizedValues)
        : row.localized && typeof row.localized === 'object'
          ? (row.localized as LocalizedValues)
          : {}
    const localizableTypes = new Set(['string', 'text', 'richtext', 'uid'])
    for (const f of ct.fields) {
      if (!localizableTypes.has(f.type)) continue
      let val: unknown = undefined
      if (localizedContainer[locale] && localizedContainer[locale][f.name] !== undefined) {
        val = localizedContainer[locale][f.name]
      } else {
        for (const fb of fallbacks) {
          if (localizedContainer[fb] && localizedContainer[fb][f.name] !== undefined) {
            val = localizedContainer[fb][f.name]
            break
          }
        }
      }
      if (val !== undefined) effective[f.name] = val
    }
  }

  const out: Record<string, unknown> = { id: row.id }
  for (const field of ct.fields) {
    if (!(field.name in effective)) continue
    if (field.type === 'navigation') {
      out[field.name] = normalizeNavigationItems(effective[field.name])
      continue
    }
    if (field.type === 'array') {
      out[field.name] = normalizeArrayItemsBySchema(effective[field.name], field)
      continue
    }
    out[field.name] = effective[field.name]
  }
  out.status = row.status
  out.published_at = row.published_at ?? null
  out.created_at = row.created_at
  out.updated_at = row.updated_at
  out.author =
    _author_first_name || _author_last_name
      ? {
          first_name: _author_first_name ?? null,
          last_name: _author_last_name ?? null,
          avatar_url: _author_avatar_url ?? null,
          job_title: _author_job_title ?? null,
          organization: _author_organization ?? null,
          country: _author_country ?? null,
          slug: row._author_slug ?? null,
        }
      : null
  out.editor =
    _editor_first_name || _editor_last_name
      ? {
          first_name: _editor_first_name ?? null,
          last_name: _editor_last_name ?? null,
          avatar_url: _editor_avatar_url ?? null,
          job_title: _editor_job_title ?? null,
          organization: _editor_organization ?? null,
          country: _editor_country ?? null,
          slug: row._editor_slug ?? null,
        }
      : null
  return out
}

export const listPublicEntries: SlugParam = async (req, res) => {
  const ct = await findContentTypeBySlug(req.params.slug)
  if (!ct) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  const { selection, invalidFields } = parseFieldSelection(req.query as Record<string, unknown>, ct)
  if (invalidFields.length > 0) {
    res.status(400).json({ error: `Unknown fields: ${invalidFields.join(', ')}` })
    return
  }

  assertSafeIdentifier(ct.tableName)

  if (ct.kind === 'single') {
    const statusParam = String(req.query.status ?? 'published')
    const locale = req.query.locale ? String(req.query.locale) : undefined
    const fallbacks = req.query.fallback ? String(req.query.fallback).split(',') : []
    const statusClause =
      statusParam === 'published' || statusParam === 'draft' ? `WHERE e.status = $1` : ''
    const values: unknown[] = statusClause ? [statusParam] : []
    const { rows } = await pool.query(
      `SELECT e.*, u.first_name AS _author_first_name, u.last_name AS _author_last_name, u.public_author_slug AS _author_slug, u.avatar_url AS _author_avatar_url, u.job_title AS _author_job_title, u.organization AS _author_organization, u.country AS _author_country,
              ed.first_name AS _editor_first_name, ed.last_name AS _editor_last_name, ed.public_author_slug AS _editor_slug, ed.avatar_url AS _editor_avatar_url, ed.job_title AS _editor_job_title, ed.organization AS _editor_organization, ed.country AS _editor_country
       FROM ${ct.tableName} e
       LEFT JOIN plank_users u ON u.id = e.created_by
       LEFT JOIN plank_users ed ON ed.id = e.editor_id
       ${statusClause} LIMIT 1`,
      values,
    )
    if (!rows[0]) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const entry = serializeEntry(rows[0], ct, statusParam, locale, fallbacks)
    await Promise.all([
      resolveMediaFields([entry], ct),
      resolveAuthorAvatars([entry]),
      resolveRelationFields([entry], ct),
    ])
    res.json(selectEntryFields(entry, ct, selection))
    return
  }

  const page = Math.max(1, parseInt(String(req.query.page ?? 1)))
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? 20))))
  const offset = (page - 1) * limit
  const locale = req.query.locale ? String(req.query.locale) : undefined
  const fallbacks = req.query.fallback ? String(req.query.fallback).split(',') : []

  const knownFields = new Set(ct.fields.map((f) => f.name))
  const fieldMap = new Map(ct.fields.map((field) => [field.name, field]))
  const systemSortFields = new Set(['created_at', 'updated_at', 'published_at'])
  const filterClauses: string[] = []
  const filterValues: unknown[] = []
  const { filters: parsedFilters, invalidFilters } = parseFilters(
    req.query as Record<string, unknown>,
    fieldMap,
  )
  if (invalidFilters.length > 0) {
    res.status(400).json({ error: `Invalid filters: ${invalidFilters.join(', ')}` })
    return
  }

  // Status filter: default published, opt-in to draft or all
  const statusParam = String(req.query.status ?? 'published')
  if (statusParam === 'published' || statusParam === 'draft') {
    filterClauses.push(`e.status = $${filterValues.length + 1}`)
    filterValues.push(statusParam)
  }
  // statusParam === 'all' skips the filter entirely

  const authorSlug = typeof req.query.author === 'string' ? req.query.author.trim() : ''
  if (authorSlug) {
    filterClauses.push(`u.public_author_slug = $${filterValues.length + 1}`)
    filterValues.push(authorSlug)
  }

  const rawSort = String(req.query.sort ?? 'created_at')
  const sortField =
    knownFields.has(rawSort) || systemSortFields.has(rawSort) ? rawSort : 'created_at'
  assertSafeIdentifier(sortField)
  const sortDir = String(req.query.order ?? 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC'

  for (const parsedFilter of parsedFilters) {
    const fieldName = parsedFilter.field.name
    assertSafeIdentifier(fieldName)

    if (parsedFilter.operator === 'eq' || parsedFilter.operator === 'ne') {
      const rawValue = Array.isArray(parsedFilter.rawValue)
        ? parsedFilter.rawValue[0]
        : parsedFilter.rawValue
      const coercedValue =
        typeof rawValue === 'string' ? coerceFilterValue(rawValue, parsedFilter.field) : rawValue
      filterClauses.push(
        `e.${fieldName} ${parsedFilter.operator === 'ne' ? '!=' : '='} $${filterValues.length + 1}`,
      )
      filterValues.push(coercedValue)
      continue
    }

    const coercedValues = coerceFilterValues(parsedFilter.rawValue, parsedFilter.field)
    if (coercedValues.length === 0) {
      res.status(400).json({ error: `Filter "${parsedFilter.rawKey}" requires at least one value` })
      return
    }

    filterClauses.push(
      parsedFilter.operator === 'nin'
        ? `NOT (e.${fieldName} = ANY($${filterValues.length + 1}))`
        : `e.${fieldName} = ANY($${filterValues.length + 1})`,
    )
    filterValues.push(coercedValues)
  }

  for (const [key] of Object.entries(req.query)) {
    if (
      key === 'page' ||
      key === 'limit' ||
      key === 'status' ||
      key === 'sort' ||
      key === 'order' ||
      key === 'locale' ||
      key === 'fallback' ||
      key === 'fields' ||
      key === 'select' ||
      key === 'exclude' ||
      key === 'author' ||
      key === 'filters' ||
      key.startsWith('filters[')
    )
      continue
    if (knownFields.has(key)) continue
    if (/_((?:n)?in|ne)$/.test(key)) continue
  }

  const where = filterClauses.length > 0 ? `WHERE ${filterClauses.join(' AND ')}` : ''
  const limitParam = filterValues.length + 1
  const offsetParam = filterValues.length + 2

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(
      `SELECT e.*, u.first_name AS _author_first_name, u.last_name AS _author_last_name, u.public_author_slug AS _author_slug, u.avatar_url AS _author_avatar_url, u.job_title AS _author_job_title, u.organization AS _author_organization, u.country AS _author_country,
              ed.first_name AS _editor_first_name, ed.last_name AS _editor_last_name, ed.public_author_slug AS _editor_slug, ed.avatar_url AS _editor_avatar_url, ed.job_title AS _editor_job_title, ed.organization AS _editor_organization, ed.country AS _editor_country
       FROM ${ct.tableName} e
       LEFT JOIN plank_users u ON u.id = e.created_by
       LEFT JOIN plank_users ed ON ed.id = e.editor_id
       ${where} ORDER BY e.${sortField} ${sortDir} LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...filterValues, limit, offset],
    ),
    pool.query(
      `SELECT COUNT(*) as count
       FROM ${ct.tableName} e
       LEFT JOIN plank_users u ON u.id = e.created_by
       ${where}`,
      filterValues,
    ),
  ])

  const data = rows.map((row) => serializeEntry(row, ct, statusParam, locale, fallbacks))
  await Promise.all([
    resolveMediaFields(data, ct),
    resolveAuthorAvatars(data),
    resolveRelationFields(data, ct),
  ])
  res.json({
    data: data.map((entry) => selectEntryFields(entry, ct, selection)),
    total: parseInt(countRows[0].count),
    page,
    limit,
  })
}

export const getPublicEntry: SlugIdParam = async (req, res) => {
  const ct = await findContentTypeBySlug(req.params.slug)
  if (!ct) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  const { selection, invalidFields } = parseFieldSelection(req.query as Record<string, unknown>, ct)
  if (invalidFields.length > 0) {
    res.status(400).json({ error: `Unknown fields: ${invalidFields.join(', ')}` })
    return
  }

  assertSafeIdentifier(ct.tableName)
  const statusParam = String(req.query.status ?? 'published')
  const statusClause =
    statusParam === 'published' || statusParam === 'draft' ? ` AND e.status = $2` : ''
  const values: unknown[] = statusClause ? [req.params.id, statusParam] : [req.params.id]

  const { rows } = await pool.query(
    `SELECT e.*, u.first_name AS _author_first_name, u.last_name AS _author_last_name, u.public_author_slug AS _author_slug, u.avatar_url AS _author_avatar_url, u.job_title AS _author_job_title, u.organization AS _author_organization, u.country AS _author_country,
            ed.first_name AS _editor_first_name, ed.last_name AS _editor_last_name, ed.public_author_slug AS _editor_slug, ed.avatar_url AS _editor_avatar_url, ed.job_title AS _editor_job_title, ed.organization AS _editor_organization, ed.country AS _editor_country
     FROM ${ct.tableName} e
     LEFT JOIN plank_users u ON u.id = e.created_by
     LEFT JOIN plank_users ed ON ed.id = e.editor_id
     WHERE e.id = $1${statusClause}`,
    values,
  )

  if (!rows[0]) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const locale = req.query.locale ? String(req.query.locale) : undefined
  const fallbacks = req.query.fallback ? String(req.query.fallback).split(',') : []
  const entry = serializeEntry(rows[0], ct, statusParam, locale, fallbacks)
  await Promise.all([
    resolveMediaFields([entry], ct),
    resolveAuthorAvatars([entry]),
    resolveRelationFields([entry], ct),
  ])
  res.json(selectEntryFields(entry, ct, selection))
}

export const getPublicAuthor: AuthorSlugParam = async (req, res) => {
  const { rows } = await pool.query<{
    public_author_slug: string
    first_name: string | null
    last_name: string | null
    avatar_url: string | null
    job_title: string | null
    organization: string | null
    country: string | null
  }>(
    `SELECT public_author_slug, first_name, last_name, avatar_url, job_title, organization, country
     FROM plank_users
     WHERE public_author_slug = $1
     LIMIT 1`,
    [req.params.slug],
  )

  if (!rows[0]) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  res.json(await resolvePublicAuthorAvatar(serializePublicAuthor(rows[0])))
}
