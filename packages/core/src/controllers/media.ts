import type { Request, Response } from 'express'
import { randomBytes } from 'node:crypto'
import { pool, createId } from '@plank/db'
import { getProvider } from '../media/index.js'

type MediaRow = {
  id: string
  filename: string
  url: string
  provider_key: string
  mime_type: string | null
  size: number | null
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
    const prefix = [folderId, bundleId].filter(Boolean).join('/')

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

    res.status(201).json({ id, url: m3u8Url, filename })
    return
  }

  // Regular single-file upload
  const file = files[0]
  const { url, key } = await provider.upload(file, folderId ? { prefix: folderId } : undefined)
  const id = createId()

  await pool.query(
    `INSERT INTO plank_media (id, filename, url, provider_key, mime_type, size, folder_id, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, file.originalname, url, key, file.mimetype, file.size, folderId, req.user!.id],
  )

  const resolvedUrl = await provider.getUrl(key)
  res.status(201).json({ id, url: resolvedUrl, filename: file.originalname })
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
