import type { RequestHandler } from 'express'

type SlugParam = RequestHandler<{ slug: string }>
import { pool } from '@plank/db'
import {
  findAllContentTypes,
  findContentTypeBySlug,
  saveContentType,
  updateContentType as updateInStore,
  deleteContentType as deleteFromStore,
  setDefaultContentType as setDefaultInStore,
  createTable,
  syncTable,
  assertSafeIdentifier,
} from '@plank/schema'
import type { ContentType, FieldDefinition, RelationType } from '@plank/schema'
import { z, flattenError } from 'zod'

const FieldSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/, 'Field name must be lowercase with underscores'),
  type: z.enum(['string', 'text', 'richtext', 'number', 'boolean', 'datetime', 'media', 'media-gallery', 'relation', 'uid']),
  required: z.boolean().optional(),
  subtype: z.enum(['integer', 'float']).optional(),
  relationType: z.enum(['many-to-one', 'one-to-one', 'one-to-many', 'many-to-many']).optional(),
  relatedTable: z.string().optional(),
  relatedSlug: z.string().optional(),
  relatedField: z.string().optional(),
  targetField: z.string().optional(),
  allowedTypes: z.array(z.enum(['image', 'video', 'audio', 'document'])).optional(),
  width: z.enum(['full', 'two-thirds', 'half', 'third']).optional(),
})

const ContentTypeSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Slug must be lowercase with hyphens'),
  tableName: z.string().regex(/^[a-z][a-z0-9_]*$/, 'Table name must be lowercase with underscores'),
  fields: z.array(FieldSchema),
})

const CreateContentTypeSchema = ContentTypeSchema.extend({
  kind: z.enum(['collection', 'single']).default('collection'),
})

// Returns the inverse relationType for a given relationType.
function inverseRelationType(rt: RelationType): RelationType {
  if (rt === 'many-to-one') return 'one-to-many'
  if (rt === 'one-to-many') return 'many-to-one'
  return rt // one-to-one and many-to-many are their own inverses
}

// Builds the name for an auto-generated inverse field.
// Convention: <sourceTable>_<fieldName>. Falls back to <sourceTable> if no conflict.
function inverseFieldName(
  sourceTable: string,
  sourceFieldName: string,
  existingNames: string[],
): string {
  const simple = sourceTable
  if (!existingNames.includes(simple)) return simple
  return `${sourceTable}_${sourceFieldName}`
}

// Syncs the auto-inverse field on the related content type.
// Called after saving/updating a CT that has relation fields.
async function syncInverseFields(
  savedCT: ContentType,
  prevCT: ContentType | null,
): Promise<void> {
  // Collect all CTs that may need updating (lazy load)
  const relatedCTCache = new Map<string, ContentType | null>()

  async function getRelatedCT(tableName: string): Promise<ContentType | null> {
    if (relatedCTCache.has(tableName)) return relatedCTCache.get(tableName) ?? null
    const all = await findAllContentTypes()
    const ct = all.find((c) => c.tableName === tableName) ?? null
    relatedCTCache.set(tableName, ct)
    return ct
  }

  // Fields that owned relation columns in the previous version
  const prevRelFields = new Map(
    (prevCT?.fields ?? [])
      .filter((f) => f.type === 'relation' && f.relationType !== 'one-to-many')
      .map((f) => [f.name, f]),
  )

  // Fields that own relation columns in the new version
  const nextRelFields = savedCT.fields.filter(
    (f) => f.type === 'relation' && f.relationType !== 'one-to-many',
  )

  // Remove inverse fields for relation fields that were deleted or changed relatedTable
  for (const [fieldName, prevField] of prevRelFields) {
    if (!prevField.relatedTable) continue
    const nextField = savedCT.fields.find((f) => f.name === fieldName)
    const targetChanged = nextField?.relatedTable !== prevField.relatedTable
    if (!nextField || targetChanged) {
      const relatedCT = await getRelatedCT(prevField.relatedTable)
      if (!relatedCT) continue
      const updated = relatedCT.fields.filter(
        (f) =>
          !(f.type === 'relation' &&
            f.relationType === inverseRelationType(prevField.relationType ?? 'many-to-one') &&
            f.relatedTable === savedCT.tableName &&
            f.relatedField === fieldName),
      )
      if (updated.length !== relatedCT.fields.length) {
        await updateInStore(relatedCT.slug, { ...relatedCT, fields: updated })
      }
    }
  }

  // Add or update inverse fields for current relation fields
  for (const field of nextRelFields) {
    if (!field.relatedTable) continue

    const relatedCT = await getRelatedCT(field.relatedTable)
    if (!relatedCT) continue

    const invType = inverseRelationType(field.relationType ?? 'many-to-one')

    // Check if an inverse already exists (matched by relatedTable + relatedField)
    const existingInvIdx = relatedCT.fields.findIndex(
      (f) =>
        f.type === 'relation' &&
        f.relationType === invType &&
        f.relatedTable === savedCT.tableName &&
        f.relatedField === field.name,
    )

    const invField: FieldDefinition = {
      name: existingInvIdx >= 0
        ? relatedCT.fields[existingInvIdx].name
        : inverseFieldName(
            savedCT.tableName,
            field.name,
            relatedCT.fields.map((f) => f.name),
          ),
      type: 'relation',
      relationType: invType,
      relatedTable: savedCT.tableName,
      relatedSlug: savedCT.slug,
      relatedField: field.name,
    }

    let updatedFields: FieldDefinition[]
    if (existingInvIdx >= 0) {
      updatedFields = relatedCT.fields.map((f, i) => (i === existingInvIdx ? invField : f))
    } else {
      updatedFields = [...relatedCT.fields, invField]
    }

    await updateInStore(relatedCT.slug, { ...relatedCT, fields: updatedFields })
  }
}

// Removes all relation fields pointing to a deleted content type and drops their DB columns.
async function removeRelationDependencies(deletedTable: ContentType): Promise<void> {
  const all = await findAllContentTypes()

  for (const ct of all) {
    const toRemove = ct.fields.filter(
      (f) => f.type === 'relation' && f.relatedTable === deletedTable.tableName,
    )
    if (toRemove.length === 0) continue

    for (const field of toRemove) {
      const relType = field.relationType ?? 'many-to-one'

      if (relType === 'many-to-one' || relType === 'one-to-one') {
        // Column exists in this CT's table — drop it (FK constraint already gone via CASCADE)
        try {
          await pool.query(`ALTER TABLE ${ct.tableName} DROP COLUMN IF EXISTS ${field.name}`)
        } catch {
          // table may not exist yet in edge cases
        }
      }

      if (relType === 'many-to-many') {
        // Drop the junction table if this CT is the source
        const jt = `_rel_${ct.tableName}_${field.name}`
        await pool.query(`DROP TABLE IF EXISTS ${jt}`)
      }
    }

    const filtered = ct.fields.filter(
      (f) => !(f.type === 'relation' && f.relatedTable === deletedTable.tableName),
    )
    await updateInStore(ct.slug, { ...ct, fields: filtered })
  }
}

export const listContentTypes: RequestHandler = async (_req, res) => {
  const contentTypes = await findAllContentTypes()
  res.json(contentTypes)
}

export const getContentType: SlugParam = async (req, res) => {
  const ct = await findContentTypeBySlug(req.params.slug)
  if (!ct) {
    res.status(404).json({ error: 'Content type not found' })
    return
  }
  res.json(ct)
}

export const createContentType: RequestHandler = async (req, res) => {
  const parsed = CreateContentTypeSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ errors: flattenError(parsed.error, (i) => i.message) })
    return
  }

  const ct = await saveContentType(parsed.data)
  await createTable(ct)
  try {
    await syncInverseFields(ct, null)
  } catch (err) {
    console.error('[plank] syncInverseFields failed:', err)
  }
  res.status(201).json(ct)
}

export const updateContentType: SlugParam = async (req, res) => {
  const prev = await findContentTypeBySlug(req.params.slug)
  if (!prev) {
    res.status(404).json({ error: 'Content type not found' })
    return
  }

  const parsed = ContentTypeSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ errors: flattenError(parsed.error, (i) => i.message) })
    return
  }

  const next = await updateInStore(req.params.slug, { ...parsed.data, kind: prev.kind })
  await syncTable(next, prev)
  try {
    await syncInverseFields(next, prev)
  } catch (err) {
    console.error('[plank] syncInverseFields failed:', err)
  }
  res.json(next)
}

export const setDefaultContentType: SlugParam = async (req, res) => {
  const ct = await setDefaultInStore(req.params.slug)
  res.json(ct)
}

export const deleteContentType: SlugParam = async (req, res) => {
  const ct = await findContentTypeBySlug(req.params.slug)
  if (!ct) {
    res.status(404).json({ error: 'Content type not found' })
    return
  }

  assertSafeIdentifier(ct.tableName)
  await removeRelationDependencies(ct)
  await pool.query(`DROP TABLE IF EXISTS ${ct.tableName} CASCADE`)
  await deleteFromStore(req.params.slug)
  res.status(204).end()
}
