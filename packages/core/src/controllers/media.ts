import type { Request, Response } from 'express'
import { randomBytes } from 'node:crypto'
import { pool, createId } from '@plank/db'
import { getProvider } from '../media/index.js'

const MEDIA_PREFIX = 'media'

type MediaRow = {
  id: string
  filename: string
  url: string
  provider_key: string
  mime_type: string | null
  size: number | null
  alt: string | null
  width: number | null
  height: number | null
  folder_id: string | null
  uploaded_by: string | null
  created_at: Date
}

export async function listMedia(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 24))
  const offset = (page - 1) * limit
  const folderId = (req.query.folder_id as string) || null

  const { rows } = await pool.query<MediaRow & { total: string }>(
    `SELECT *, COUNT(*) OVER() AS total
     FROM plank_media
     WHERE folder_id IS NOT DISTINCT FROM $3
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset, folderId],
  )

  const provider = await getProvider()
  const items = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      filename: r.filename,
      url: await provider.getUrl(r.provider_key),
      mime_type: r.mime_type,
      size: r.size,
      alt: r.alt,
      width: r.width,
      height: r.height,
      folder_id: r.folder_id,
      uploaded_by: r.uploaded_by,
      created_at: r.created_at,
    })),
  )

  const total = rows[0] ? parseInt(rows[0].total) : 0
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) })
}

export async function uploadMedia(req: Request, res: Response): Promise<void> {
  const files = (req.files as Express.Multer.File[] | undefined) ?? []

  if (files.length === 0) {
    res.status(400).json({ error: 'No file provided' })
    return
  }

  const folderId = (req.body.folder_id as string | undefined) || null
  const isBundle = req.body.bundle === 'true'
  const provider = await getProvider()

  if (folderId) {
    const { rows } = await pool.query('SELECT id FROM plank_folders WHERE id = $1', [folderId])
    if (!rows[0]) {
      res.status(404).json({ error: 'Folder not found' })
      return
    }
  }

  if (isBundle) {
    const m3u8File = files.find((f) => f.originalname.endsWith('.m3u8'))
    if (!m3u8File) {
      res.status(400).json({ error: 'No .m3u8 file found in bundle' })
      return
    }

    const bundleId = randomBytes(8).toString('hex')
    const prefix = [MEDIA_PREFIX, folderId, bundleId].filter(Boolean).join('/')

    // Strip the common root folder from relative paths (webkitRelativePath includes the folder name)
    const rootDir = m3u8File.originalname.includes('/')
      ? m3u8File.originalname.split('/')[0]
      : null

    const stripRoot = (path: string) =>
      rootDir && path.startsWith(`${rootDir}/`) ? path.slice(rootDir.length + 1) : path

    await Promise.all(
      files.map((file) => {
        const relativePath = stripRoot(file.originalname)
        const exactKey = `${prefix}/${relativePath}`
        return provider.uploadRaw(file.buffer, exactKey, file.mimetype)
      }),
    )

    const m3u8RelPath = stripRoot(m3u8File.originalname)
    const m3u8Key = `${prefix}/${m3u8RelPath}`
    const m3u8Url = await provider.getUrl(m3u8Key)
    const id = createId()
    const filename = m3u8File.originalname.split('/').pop() ?? m3u8File.originalname

    await pool.query(
      `INSERT INTO plank_media (id, filename, url, provider_key, mime_type, size, folder_id, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, filename, m3u8Url, m3u8Key, m3u8File.mimetype, m3u8File.size, folderId, req.user!.id],
    )
    // HLS bundles are video — no image dimensions to store

    res.status(201).json({ id, url: m3u8Url, filename })
    return
  }

  // Regular single-file upload (local provider only — S3/R2 use presign + confirm)
  const file = files[0]
  const { url, key } = await provider.upload(file, { prefix: folderId ? `${MEDIA_PREFIX}/${folderId}` : MEDIA_PREFIX })
  const id = createId()
  const width = req.body.width ? parseInt(req.body.width as string) : null
  const height = req.body.height ? parseInt(req.body.height as string) : null

  await pool.query(
    `INSERT INTO plank_media (id, filename, url, provider_key, mime_type, size, alt, width, height, folder_id, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [id, file.originalname, url, key, file.mimetype, file.size, null, width, height, folderId, req.user!.id],
  )

  const resolvedUrl = await provider.getUrl(key)
  res.status(201).json({ id, url: resolvedUrl, filename: file.originalname, alt: null, width, height })
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

export async function presignMedia(req: Request, res: Response): Promise<void> {
  const { filename, mimeType, folderId } = req.body as { filename: string; mimeType: string; folderId?: string | null }
  if (!filename || !mimeType) {
    res.status(400).json({ error: 'filename and mimeType are required' })
    return
  }

  const provider = await getProvider()

  if (!provider.presign) {
    res.json({ mode: 'direct' })
    return
  }

  if (folderId) {
    const { rows } = await pool.query('SELECT id FROM plank_folders WHERE id = $1', [folderId])
    if (!rows[0]) { res.status(404).json({ error: 'Folder not found' }); return }
  }

  const prefix = folderId ? `${MEDIA_PREFIX}/${folderId}` : MEDIA_PREFIX
  const result = await provider.presign(filename, mimeType, { prefix })
  res.json({ mode: 'presigned', ...result })
}

export async function confirmMedia(req: Request, res: Response): Promise<void> {
  const { key, filename, mimeType, size, folderId, width, height } = req.body as {
    key: string; filename: string; mimeType: string; size?: number
    folderId?: string | null; width?: number | null; height?: number | null
  }
  if (!key || !filename || !mimeType) {
    res.status(400).json({ error: 'key, filename and mimeType are required' })
    return
  }

  const provider = await getProvider()
  const url = await provider.getUrl(key)
  const id = createId()

  await pool.query(
    `INSERT INTO plank_media (id, filename, url, provider_key, mime_type, size, alt, width, height, folder_id, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [id, filename, url, key, mimeType, size ?? null, null, width ?? null, height ?? null, folderId ?? null, req.user!.id],
  )

  res.status(201).json({ id, url, filename, alt: null, width: width ?? null, height: height ?? null })
}

export async function updateMedia(req: Request, res: Response): Promise<void> {
  const { id } = req.params
  const { filename, alt } = req.body as { filename?: string; alt?: string | null }

  const { rows } = await pool.query<MediaRow>(
    `UPDATE plank_media
     SET filename = COALESCE($1, filename),
         alt      = $2
     WHERE id = $3
     RETURNING *`,
    [filename ?? null, alt ?? null, id],
  )

  if (!rows[0]) { res.status(404).json({ error: 'Media not found' }); return }

  const provider = await getProvider()
  const url = await provider.getUrl(rows[0].provider_key)
  res.json({ ...rows[0], url })
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
