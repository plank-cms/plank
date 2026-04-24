import type { Request, Response } from 'express'
import { pool, createId } from '@plank/db'
import { getProvider } from '../media/index.js'

type MediaRow = {
  id: string
  filename: string
  url: string
  provider_key: string
  mime_type: string | null
  size: number | null
  uploaded_by: string | null
  created_at: Date
}

export async function listMedia(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 24))
  const offset = (page - 1) * limit

  const { rows } = await pool.query<MediaRow & { total: string }>(
    `SELECT *, COUNT(*) OVER() AS total
     FROM plank_media
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  )

  const provider = await getProvider()
  const items = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      filename: r.filename,
      url: await provider.getUrl(r.provider_key),
      mime_type: r.mime_type,
      size: r.size,
      uploaded_by: r.uploaded_by,
      created_at: r.created_at,
    })),
  )

  const total = rows[0] ? parseInt(rows[0].total) : 0
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) })
}

export async function uploadMedia(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    res.status(400).json({ error: 'No file provided' })
    return
  }

  const provider = await getProvider()
  const { url, key } = await provider.upload(req.file)
  const id = createId()

  await pool.query(
    `INSERT INTO plank_media (id, filename, url, provider_key, mime_type, size, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, req.file.originalname, url, key, req.file.mimetype, req.file.size, req.user!.id],
  )

  const resolvedUrl = await provider.getUrl(key)
  res.status(201).json({ id, url: resolvedUrl, filename: req.file.originalname })
}

export async function deleteMedia(req: Request, res: Response): Promise<void> {
  const { id } = req.params

  const { rows } = await pool.query<MediaRow>(
    'SELECT * FROM plank_media WHERE id = $1',
    [id],
  )

  if (!rows[0]) {
    res.status(404).json({ error: 'Media not found' })
    return
  }

  const provider = await getProvider()
  await provider.delete(rows[0].provider_key)
  await pool.query('DELETE FROM plank_media WHERE id = $1', [id])

  res.status(204).end()
}

export async function getMediaUrl(req: Request, res: Response): Promise<void> {
  const { id } = req.params

  const { rows } = await pool.query<MediaRow>(
    'SELECT * FROM plank_media WHERE id = $1',
    [id],
  )

  if (!rows[0]) {
    res.status(404).json({ error: 'Media not found' })
    return
  }

  const provider = await getProvider()
  const url = await provider.getUrl(rows[0].provider_key)

  res.json({ id, url })
}

export async function presignMedia(req: Request, res: Response): Promise<void> {
  const { filename, mime_type } = req.body as { filename?: string; mime_type?: string }
  if (!filename || !mime_type) {
    res.status(400).json({ error: 'filename and mime_type are required' })
    return
  }

  const provider = await getProvider()
  if (!provider.presignUpload) {
    res.status(501).json({ error: 'Direct upload not supported for this provider' })
    return
  }

  const { upload_url, key, stored_url } = await provider.presignUpload(filename, mime_type)
  const id = createId()
  res.json({ id, upload_url, key, stored_url })
}

export async function completeMedia(req: Request, res: Response): Promise<void> {
  const { id, key, stored_url, filename, mime_type, size } = req.body as {
    id?: string; key?: string; stored_url?: string; filename?: string; mime_type?: string; size?: number
  }
  if (!id || !key || !stored_url || !filename) {
    res.status(400).json({ error: 'id, key, stored_url, and filename are required' })
    return
  }

  await pool.query(
    `INSERT INTO plank_media (id, filename, url, provider_key, mime_type, size, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, filename, stored_url, key, mime_type ?? null, size ?? null, req.user!.id],
  )

  const provider = await getProvider()
  const url = await provider.getUrl(key)
  res.status(201).json({ id, url, filename })
}
