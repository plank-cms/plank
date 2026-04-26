import type { Request, Response } from 'express'
import { pool, createId } from '@plank/db'

type FolderRow = {
  id: string
  name: string
  parent_id: string | null
  created_at: Date
}

export async function listFolders(req: Request, res: Response): Promise<void> {
  const parentId = (req.query.parent_id as string) || null

  const { rows } = await pool.query<FolderRow>(
    `SELECT * FROM plank_folders WHERE parent_id IS NOT DISTINCT FROM $1 ORDER BY name ASC`,
    [parentId],
  )

  res.json({ folders: rows })
}

export async function createFolder(req: Request, res: Response): Promise<void> {
  const { name, parent_id } = req.body as { name?: string; parent_id?: string | null }

  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' })
    return
  }

  if (parent_id) {
    const { rows } = await pool.query('SELECT id FROM plank_folders WHERE id = $1', [parent_id])
    if (!rows[0]) {
      res.status(404).json({ error: 'Parent folder not found' })
      return
    }
  }

  const id = createId()
  const { rows } = await pool.query<FolderRow>(
    `INSERT INTO plank_folders (id, name, parent_id) VALUES ($1, $2, $3) RETURNING *`,
    [id, name.trim(), parent_id ?? null],
  )

  res.status(201).json(rows[0])
}

export async function renameFolder(req: Request, res: Response): Promise<void> {
  const { id } = req.params
  const { name } = req.body as { name?: string }

  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' })
    return
  }

  const { rows } = await pool.query<FolderRow>(
    `UPDATE plank_folders SET name = $1 WHERE id = $2 RETURNING *`,
    [name.trim(), id],
  )

  if (!rows[0]) {
    res.status(404).json({ error: 'Folder not found' })
    return
  }

  res.json(rows[0])
}

export async function deleteFolder(req: Request, res: Response): Promise<void> {
  const { id } = req.params

  const { rows: folderRows } = await pool.query('SELECT id FROM plank_folders WHERE id = $1', [id])
  if (!folderRows[0]) {
    res.status(404).json({ error: 'Folder not found' })
    return
  }

  const { rows: subfolders } = await pool.query(
    'SELECT id FROM plank_folders WHERE parent_id = $1 LIMIT 1',
    [id],
  )
  const { rows: mediaItems } = await pool.query(
    'SELECT id FROM plank_media WHERE folder_id = $1 LIMIT 1',
    [id],
  )

  if (subfolders.length > 0 || mediaItems.length > 0) {
    res.status(409).json({ error: 'Folder is not empty. Move or delete its contents first.' })
    return
  }

  await pool.query('DELETE FROM plank_folders WHERE id = $1', [id])
  res.status(204).end()
}
