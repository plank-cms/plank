import type { Request, Response } from 'express'
import { randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream } from 'node:stream/web'
import { pool, createId } from '@plank-cms/db'
import { getProvider } from '../media/index.js'
import { getMediaFolderPrefix, moveMediaBundleKey, moveMediaKey } from '../media/paths.js'

type MediaRow = {
  id: string
  filename: string
  url: string
  provider_key: string
  mime_type: string | null
  size: number | null
  alt: string | null
  caption: string | null
  width: number | null
  height: number | null
  folder_id: string | null
  uploaded_by: string | null
  created_at: Date
}

function buildDefaultAlt(filename: string): string {
  const baseName = filename.split('/').pop() ?? filename
  const withoutExtension = baseName.replace(/\.[^.]+$/, '').trim()
  return withoutExtension || baseName.trim()
}

function mimeForHLSFile(filename: string): string | null {
  const ext = filename.toLowerCase().split('.').pop()
  switch (ext) {
    case 'm3u8':
      return 'application/vnd.apple.mpegurl'
    case 'ts':
      return 'video/mp2t'
    case 'm4s':
      return 'video/iso.segment'
    case 'mp4':
      return 'video/mp4'
    case 'aac':
      return 'audio/aac'
    case 'vtt':
      return 'text/vtt'
    case 'key':
      return 'application/octet-stream'
    default:
      return null
  }
}

export async function listMedia(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 24))
  const offset = (page - 1) * limit
  const folderId = (req.query.folder_id as string) || null
  const search = req.query.search ? String(req.query.search).trim() : null
  const searchTerm = search ? `%${search}%` : null

  const { rows } = await pool.query<MediaRow & { total: string }>(
    `SELECT *, COUNT(*) OVER() AS total
     FROM plank_media
     WHERE folder_id IS NOT DISTINCT FROM $3
       AND ($4::text IS NULL OR filename ILIKE $4 OR alt ILIKE $4 OR caption ILIKE $4)
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset, folderId, searchTerm],
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
      caption: r.caption,
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

export async function downloadMedia(req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query<MediaRow>('SELECT * FROM plank_media WHERE id = $1', [
    req.params.id,
  ])
  const media = rows[0]

  if (!media) {
    res.status(404).json({ error: 'Media not found' })
    return
  }

  const provider = await getProvider()
  const url = await provider.getUrl(media.provider_key)
  const controller = new AbortController()
  const abort = () => controller.abort()
  res.once('close', abort)

  try {
    const response = await fetch(url, { signal: controller.signal })

    if (!response.ok || !response.body) {
      await response.body?.cancel()
      res.status(502).json({ error: 'Could not download asset' })
      return
    }

    res.attachment(media.filename)
    res.setHeader('Content-Type', media.mime_type ?? 'application/octet-stream')
    await pipeline(Readable.fromWeb(response.body as ReadableStream<Uint8Array>), res)
  } catch {
    if (res.destroyed) return
    if (res.headersSent) {
      res.destroy()
    } else {
      res.status(502).json({ error: 'Could not download asset' })
    }
  } finally {
    res.off('close', abort)
  }
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
    const prefix = `${await getMediaFolderPrefix(folderId)}/${bundleId}`

    // Strip the common root folder from relative paths (webkitRelativePath includes the folder name)
    const rootDir = m3u8File.originalname.includes('/') ? m3u8File.originalname.split('/')[0] : null

    const stripRoot = (path: string) =>
      rootDir && path.startsWith(`${rootDir}/`) ? path.slice(rootDir.length + 1) : path

    const m3u8Mime = mimeForHLSFile(m3u8File.originalname) ?? 'application/vnd.apple.mpegurl'

    const uploaded = await Promise.all(
      files.map(async (file) => {
        const relativePath = stripRoot(file.originalname)
        const relativeKey = `${prefix}/${relativePath}`
        const mimeType = mimeForHLSFile(relativePath) ?? file.mimetype
        const result = await provider.uploadRaw(file.buffer, relativeKey, mimeType)
        return { file, result }
      }),
    )

    const m3u8 = uploaded.find((u) => u.file === m3u8File)?.result
    if (!m3u8) {
      res.status(500).json({ error: 'Failed to upload HLS playlist' })
      return
    }

    const id = createId()
    const filename = m3u8File.originalname.split('/').pop() ?? m3u8File.originalname
    const alt = buildDefaultAlt(filename)

    await pool.query(
      `INSERT INTO plank_media (id, filename, url, provider_key, mime_type, size, alt, folder_id, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, filename, m3u8.url, m3u8.key, m3u8Mime, m3u8File.size, alt, folderId, req.user!.id],
    )
    // HLS bundles are video — no image dimensions to store

    res.status(201).json({ id, url: m3u8.url, filename, alt, caption: null })
    return
  }

  // Regular single-file upload (local provider only — S3/R2 use presign + confirm)
  const file = files[0]
  const { url, key } = await provider.upload(file, {
    prefix: await getMediaFolderPrefix(folderId),
  })
  const id = createId()
  const width = req.body.width ? parseInt(req.body.width as string) : null
  const height = req.body.height ? parseInt(req.body.height as string) : null
  const alt = buildDefaultAlt(file.originalname)

  await pool.query(
    `INSERT INTO plank_media (id, filename, url, provider_key, mime_type, size, alt, caption, width, height, folder_id, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      file.originalname,
      url,
      key,
      file.mimetype,
      file.size,
      alt,
      null,
      width,
      height,
      folderId,
      req.user!.id,
    ],
  )

  const resolvedUrl = await provider.getUrl(key)
  res
    .status(201)
    .json({ id, url: resolvedUrl, filename: file.originalname, alt, caption: null, width, height })
}

export async function deleteMedia(req: Request, res: Response): Promise<void> {
  const { id } = req.params

  const { rows } = await pool.query<MediaRow>('SELECT * FROM plank_media WHERE id = $1', [id])

  if (!rows[0]) {
    res.status(404).json({ error: 'Media not found' })
    return
  }

  const provider = await getProvider()
  const key = rows[0].provider_key

  if (key.toLowerCase().endsWith('.m3u8')) {
    // HLS bundle — delete the entire bundle directory (playlist + segments)
    const bundlePrefix = key.substring(0, key.lastIndexOf('/'))
    await provider.deletePrefix(bundlePrefix)
  } else {
    await provider.delete(key)
  }

  await pool.query('DELETE FROM plank_media WHERE id = $1', [id])

  res.status(204).end()
}

export async function presignMedia(req: Request, res: Response): Promise<void> {
  const { filename, mimeType, folderId } = req.body as {
    filename: string
    mimeType: string
    folderId?: string | null
  }
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
    if (!rows[0]) {
      res.status(404).json({ error: 'Folder not found' })
      return
    }
  }

  const prefix = await getMediaFolderPrefix(folderId ?? null)
  const result = await provider.presign(filename, mimeType, { prefix })
  res.json({ mode: 'presigned', ...result })
}

export async function confirmMedia(req: Request, res: Response): Promise<void> {
  const { key, filename, mimeType, size, folderId, width, height } = req.body as {
    key: string
    filename: string
    mimeType: string
    size?: number
    folderId?: string | null
    width?: number | null
    height?: number | null
  }
  if (!key || !filename || !mimeType) {
    res.status(400).json({ error: 'key, filename and mimeType are required' })
    return
  }

  const provider = await getProvider()
  const url = await provider.getUrl(key)
  const id = createId()
  const alt = buildDefaultAlt(filename)

  await pool.query(
    `INSERT INTO plank_media (id, filename, url, provider_key, mime_type, size, alt, caption, width, height, folder_id, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      filename,
      url,
      key,
      mimeType,
      size ?? null,
      alt,
      null,
      width ?? null,
      height ?? null,
      folderId ?? null,
      req.user!.id,
    ],
  )

  res
    .status(201)
    .json({ id, url, filename, alt, caption: null, width: width ?? null, height: height ?? null })
}

export async function updateMedia(req: Request, res: Response): Promise<void> {
  const { id } = req.params
  const { filename, alt, caption, folder_id } = req.body as {
    filename?: string
    alt?: string | null
    caption?: string | null
    folder_id?: string | null
  }

  const updates: string[] = []
  const values: unknown[] = []
  const movingFolder = Object.prototype.hasOwnProperty.call(req.body, 'folder_id')

  if (typeof filename === 'string' && filename.trim()) {
    values.push(filename.trim())
    updates.push(`filename = $${values.length}`)
  }
  if (alt !== undefined) {
    values.push(typeof alt === 'string' ? alt.trim() || null : null)
    updates.push(`alt = $${values.length}`)
  }
  if (caption !== undefined) {
    values.push(typeof caption === 'string' ? caption.trim() || null : null)
    updates.push(`caption = $${values.length}`)
  }
  if (movingFolder) {
    if (folder_id) {
      const { rows: folderRows } = await pool.query('SELECT id FROM plank_folders WHERE id = $1', [
        folder_id,
      ])
      if (!folderRows[0]) {
        res.status(404).json({ error: 'Folder not found' })
        return
      }
    }
    values.push(folder_id ?? null)
    updates.push(`folder_id = $${values.length}`)

    const { rows: mediaRows } = await pool.query<MediaRow>(
      'SELECT * FROM plank_media WHERE id = $1',
      [id],
    )
    if (!mediaRows[0]) {
      res.status(404).json({ error: 'Media not found' })
      return
    }

    const provider = await getProvider()
    const prefix = await getMediaFolderPrefix(folder_id ?? null)
    const current = mediaRows[0]
    const isBundle = current.provider_key.toLowerCase().endsWith('.m3u8')
    const next = isBundle
      ? moveMediaBundleKey(current.provider_key, prefix)
      : { key: moveMediaKey(current.provider_key, prefix) }

    if (current.provider_key !== next.key) {
      if (isBundle) {
        const bundle = next as ReturnType<typeof moveMediaBundleKey>
        await provider.movePrefix(
          current.provider_key.substring(0, current.provider_key.lastIndexOf('/')),
          bundle.prefix,
        )
      } else {
        await provider.move(current.provider_key, next.key)
      }
    }

    values.push(next.key)
    updates.push(`provider_key = $${values.length}`)
    values.push(await provider.getUrl(next.key))
    updates.push(`url = $${values.length}`)
  }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No changes provided' })
    return
  }

  const { rows } = await pool.query<MediaRow>(
    `UPDATE plank_media
     SET ${updates.join(', ')}
     WHERE id = $${values.length + 1}
     RETURNING *`,
    [...values, id],
  )

  if (!rows[0]) {
    res.status(404).json({ error: 'Media not found' })
    return
  }

  const provider = await getProvider()
  const url = await provider.getUrl(rows[0].provider_key)
  res.json({ ...rows[0], url })
}

export async function getMediaUrl(req: Request, res: Response): Promise<void> {
  const { id } = req.params

  const { rows } = await pool.query<MediaRow>('SELECT * FROM plank_media WHERE id = $1', [id])

  if (!rows[0]) {
    res.status(404).json({ error: 'Media not found' })
    return
  }

  const provider = await getProvider()
  const url = await provider.getUrl(rows[0].provider_key)

  res.json({ id, url })
}
