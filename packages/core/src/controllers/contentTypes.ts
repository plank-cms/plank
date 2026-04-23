import type { Request, Response, RequestHandler } from 'express'

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
import { z, flattenError } from 'zod'

const FieldSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/, 'Field name must be lowercase with underscores'),
  type: z.enum(['string', 'text', 'richtext', 'number', 'boolean', 'datetime', 'media', 'relation', 'uid']),
  required: z.boolean().optional(),
  subtype: z.enum(['integer', 'float']).optional(),
  relatedTable: z.string().optional(),
  targetField: z.string().optional(),
  allowedTypes: z.array(z.enum(['image', 'video', 'audio', 'document'])).optional(),
  width: z.enum(['full', 'half', 'third']).optional(),
})

const ContentTypeSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Slug must be lowercase with hyphens'),
  tableName: z.string().regex(/^[a-z][a-z0-9_]*$/, 'Table name must be lowercase with underscores'),
  fields: z.array(FieldSchema),
})

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
  const parsed = ContentTypeSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ errors: flattenError(parsed.error, (i) => i.message) })
    return
  }

  const ct = await saveContentType(parsed.data)
  await createTable(ct)
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

  const next = await updateInStore(req.params.slug, parsed.data)
  await syncTable(next, prev)
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
  await pool.query(`DROP TABLE IF EXISTS ${ct.tableName}`)
  await deleteFromStore(req.params.slug)
  res.status(204).end()
}
