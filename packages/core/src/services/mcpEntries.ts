import { pool } from '@plank-cms/db'
import { findAllContentTypes, quoteIdentifier, validate } from '@plank-cms/schema'
import type { ContentType } from '@plank-cms/schema'
import {
  createEntryData,
  updateEntryData,
  resolveManyToManyBinding,
  loadManyToManyIds,
  EntryError,
} from './entries.js'
import type { EntryContext } from './entries.js'

export class McpEntryError extends EntryError {
  constructor(
    public readonly code: string,
    message: string,
    status = 409,
  ) {
    super(status, message)
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const reservedFields = new Set([
  'id',
  'status',
  'created_by',
  'editor_id',
  'created_at',
  'updated_at',
  'published_at',
  'published_data',
  'scheduled_for',
  'review_locked_by_editor',
  'review_rejected',
])

const localizableTypes = new Set([
  'string',
  'text',
  'richtext',
  'uid',
  'array',
  'table',
  'navigation',
])

export function mergeEntryPatch(
  ct: ContentType,
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
) {
  const names = new Set(
    ct.fields.filter((field) => field.type !== 'separator').map((field) => field.name),
  )
  for (const key of Object.keys(patch)) {
    if (reservedFields.has(key) || (key !== 'localized' && !names.has(key))) {
      throw new McpEntryError('INVALID_FIELD', `Unknown or reserved field: ${key}`, 400)
    }
  }
  for (const field of ct.fields) {
    if (
      field.type === 'relation' &&
      field.relationType === 'one-to-many' &&
      patch[field.name] !== undefined
    ) {
      throw new McpEntryError('INVALID_FIELD', `Inverse field ${field.name} is read-only`, 400)
    }
  }
  const merged = { ...current, ...patch }
  if (patch.localized !== undefined) {
    if (!isRecord(patch.localized))
      throw new McpEntryError('INVALID_LOCALIZATION', 'localized must be an object', 400)
    const localized = { ...(isRecord(current.localized) ? current.localized : {}) }
    for (const [locale, fields] of Object.entries(patch.localized)) {
      if (!isRecord(fields))
        throw new McpEntryError('INVALID_LOCALIZATION', 'Each locale must be an object', 400)
      if (locale === '_meta') {
        for (const [key, value] of Object.entries(fields)) {
          if (
            (key === 'enabled' && typeof value === 'boolean') ||
            (key === 'primary' && typeof value === 'string')
          )
            continue
          throw new McpEntryError('INVALID_LOCALIZATION', 'Invalid localization metadata', 400)
        }
      } else {
        if (locale.startsWith('_'))
          throw new McpEntryError('INVALID_LOCALIZATION', 'Invalid locale', 400)
        for (const key of Object.keys(fields)) {
          if (!ct.fields.some((field) => field.name === key && localizableTypes.has(field.type))) {
            throw new McpEntryError(
              'INVALID_FIELD',
              `Unknown or non-localizable field: ${key}`,
              400,
            )
          }
        }
      }
      localized[locale] = { ...(isRecord(localized[locale]) ? localized[locale] : {}), ...fields }
      if (locale !== '_meta')
        validate(ct, { ...merged, ...(localized[locale] as Record<string, unknown>) })
    }
    merged.localized = localized
  }
  validate(ct, merged)
  return merged
}

export function assertSnapshotSafety(
  ct: ContentType,
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
) {
  if (current.status === 'scheduled') {
    throw new McpEntryError('SCHEDULED_ENTRY', 'Edit scheduled entries in the admin.')
  }
  if (current.status !== 'published') return
  if (!isRecord(current.published_data) || Object.keys(current.published_data).length === 0) {
    throw new McpEntryError(
      'UNSAFE_SNAPSHOT',
      'The published snapshot is unavailable. Edit this entry in the admin.',
    )
  }
  if (patch.localized !== undefined && !isRecord(current.published_data.localized)) {
    throw new McpEntryError(
      'UNSAFE_LOCALIZATION',
      'Published locales depend on current data. Edit this entry in the admin.',
    )
  }
  if (ct.fields.some((field) => field.type === 'relation' && patch[field.name] !== undefined)) {
    throw new McpEntryError('PUBLIC_RELATION', 'Edit published relations in the admin.')
  }
}

async function assertRelationSafety(
  db: Pick<typeof pool, 'query'>,
  types: ContentType[],
  ct: ContentType,
  id: string,
  data: Record<string, unknown>,
) {
  for (const source of types) {
    for (const field of source.fields.filter(
      (field) => field.type === 'relation' && field.relatedTable === ct.tableName,
    )) {
      let sql: string
      let values: unknown[]
      if ((field.relationType ?? 'many-to-one') === 'many-to-many') {
        const binding = resolveManyToManyBinding(source.tableName, field)
        sql = `SELECT 1 FROM ${quoteIdentifier(source.tableName)} s
          JOIN ${quoteIdentifier(binding.junctionTable)} j ON j.${quoteIdentifier(binding.currentIdColumn)} = s.id
          WHERE s.status = 'published' AND j.${quoteIdentifier(binding.relatedIdColumn)} = $1 LIMIT 1`
        values = [id]
      } else {
        sql = `SELECT 1 FROM ${quoteIdentifier(source.tableName)} s WHERE s.status = 'published'
          AND (CASE WHEN s.published_data IS NOT NULL THEN s.published_data ELSE to_jsonb(s) END)->>$1 = $2 LIMIT 1`
        values = [field.name, id]
      }
      const { rows } = await db.query(sql, values)
      if (rows.length)
        throw new McpEntryError(
          'PUBLIC_REFERENCE',
          'This entry is referenced by published content. Edit it in the admin.',
        )
    }
  }
  for (const field of ct.fields.filter(
    (field) => field.type === 'relation' && field.relatedTable && data[field.name] !== undefined,
  )) {
    const ids = Array.isArray(data[field.name])
      ? (data[field.name] as unknown[])
      : [data[field.name]]
    const { rows } = await db.query(
      `SELECT id, status FROM ${quoteIdentifier(field.relatedTable!)} WHERE id = ANY($1::text[])`,
      [ids.filter((id) => typeof id === 'string')],
    )
    if (rows.length !== new Set(ids.filter((id) => id !== null)).size) {
      throw new McpEntryError('INVALID_REFERENCE', `Invalid entry reference in ${field.name}`, 400)
    }
    if (
      (field.relationType ?? 'many-to-one') === 'many-to-many' &&
      rows.some((row) => row.status === 'published')
    ) {
      throw new McpEntryError(
        'PUBLIC_RELATION',
        'Relations to published entries must be edited in the admin.',
      )
    }
  }
}

export async function writeMcpEntry(context: EntryContext, create: boolean) {
  const client = await pool.connect()
  const notifications: (() => void)[] = []
  try {
    await client.query('BEGIN')
    await client.query('LOCK TABLE plank_content_types IN SHARE MODE')
    const types = await findAllContentTypes(client)
    const tables = [...new Set(types.map((type) => type.tableName))].sort()
    if (tables.length)
      await client.query(
        `LOCK TABLE ${tables.map(quoteIdentifier).join(', ')} IN SHARE ROW EXCLUSIVE MODE`,
      )
    const guarded: EntryContext = {
      ...context,
      db: client,
      draftOnly: create,
      notify: (notification) => {
        notifications.push(notification)
      },
      beforeWrite: async (ct, current) => {
        if (current) assertSnapshotSafety(ct, current, context.data)
        if (create && ct.kind === 'single') {
          const { rows } = await client.query(
            `SELECT id FROM ${quoteIdentifier(ct.tableName)} LIMIT 1`,
          )
          if (rows.length)
            throw new McpEntryError(
              'SINGLE_EXISTS',
              'The single entry already exists. Use update_entry.',
            )
        }
        const relations = current
          ? await loadManyToManyIds(context.id, ct.tableName, ct.fields, client)
          : {}
        const merged = mergeEntryPatch(ct, { ...current, ...relations }, context.data)
        guarded.validationData = merged
        await assertRelationSafety(client, types, ct, current ? context.id : '', context.data)
        guarded.data = Object.fromEntries(
          Object.keys(context.data).map((key) => [key, merged[key]]),
        )
        validate(ct, merged)
      },
    }
    const entry = create ? (await createEntryData(guarded)).entry : await updateEntryData(guarded)
    const ct = types.find((type) => type.slug === context.slug)!
    const relations = Object.fromEntries(
      ct.fields
        .filter(
          (field) =>
            field.type === 'relation' && (field.relationType ?? 'many-to-one') === 'many-to-many',
        )
        .map((field) => [field.name, guarded.validationData?.[field.name] ?? []]),
    )
    await client.query('COMMIT')
    notifications.forEach((notify) => notify())
    return { ...entry, ...relations }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
