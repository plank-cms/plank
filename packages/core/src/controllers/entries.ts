import type { RequestHandler } from 'express'
import { pool } from '@plank-cms/db'
import { findContentTypeBySlug, assertSafeIdentifier, quoteIdentifier } from '@plank-cms/schema'
import { triggerWebhooks } from './webhooks.js'
import {
  listEntryData,
  getEntryData,
  createEntryData,
  getSingleEntryData,
  updateEntryData,
  loadHydratedEntry,
  roleName,
} from '../services/entries.js'
import type { EntryContext } from '../services/entries.js'

type SlugParam = RequestHandler<{ slug: string }>
type SlugIdParam = RequestHandler<{ slug: string; id: string }>

function entryContext(req: Parameters<RequestHandler>[0]): EntryContext {
  return {
    slug: req.params.slug as string,
    id: req.params.id as string,
    data: req.body,
    query: req.query,
    user: req.user,
    editorial: req.appModes?.editorial,
  }
}

export const listEntries: SlugParam = async (req, res) => {
  res.json(await listEntryData(entryContext(req)))
}

export const getEntry: SlugIdParam = async (req, res) => {
  res.json(await getEntryData(entryContext(req)))
}

export const getSingleEntry: SlugParam = async (req, res) => {
  res.json(await getSingleEntryData(entryContext(req)))
}

export const createEntry: SlugParam = async (req, res) => {
  const result = await createEntryData(entryContext(req))
  res.status(result.created ? 201 : 200).json(result.entry)
}

export const updateEntry: SlugIdParam = async (req, res) => {
  res.json(await updateEntryData(entryContext(req)))
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
  const { status, scheduled_for, editor_id, review_locked_by_editor, review_rejected } =
    req.body as {
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
    res
      .status(400)
      .json({ error: 'status must be draft, published, scheduled, pending, or in_review' })
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
    const { rows: authorRows } = await pool.query<{
      created_by: string | null
      review_locked_by_editor: boolean
    }>(`SELECT created_by, review_locked_by_editor FROM ${quotedTableName} WHERE id = $1`, [
      req.params.id,
    ])
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
          ? (req.user?.id ?? null)
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
    const nextEditorId = requestedEditorId ?? (isEditorRole ? (req.user?.id ?? null) : null)
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
