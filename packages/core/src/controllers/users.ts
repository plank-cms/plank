import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { pool, createId } from '@plank/db'
import { z, flattenError } from 'zod'
import { getProvider } from '../media/index.js'

const CreateUserSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  roleId: z.string().min(1),
})

const UpdateUserSchema = z.object({
  email: z.email().optional(),
  roleId: z.string().min(1).optional(),
  firstName: z.string().max(100).nullable().optional(),
  lastName: z.string().max(100).nullable().optional(),
})

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
})

const UpdateMeSchema = z.object({
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  jobTitle: z.string().max(100).optional(),
  organization: z.string().max(150).optional(),
  country: z.string().max(100).optional(),
})

type UserRow = { id: string; email: string; role_id: string; first_name: string | null; last_name: string | null; avatar_url: string | null; job_title: string | null; organization: string | null; country: string | null; created_at: Date }

async function resolveAvatarUrl(row: UserRow): Promise<UserRow> {
  if (!row.avatar_url || row.avatar_url.startsWith('http')) return row
  const provider = await getProvider()
  return { ...row, avatar_url: await provider.getUrl(row.avatar_url) }
}

export async function listUsers(_req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query<UserRow>(
    'SELECT id, email, role_id, first_name, last_name, created_at FROM plank_users ORDER BY created_at DESC',
  )
  res.json(rows)
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query<UserRow & { permissions: string[] }>(
    `SELECT u.id, u.email, u.role_id, u.first_name, u.last_name, u.avatar_url,
            u.job_title, u.organization, u.country, u.created_at,
            r.permissions
     FROM plank_users u
     JOIN plank_roles r ON r.id = u.role_id
     WHERE u.id = $1`,
    [req.user!.id],
  )
  if (!rows[0]) { res.status(404).json({ error: 'User not found' }); return }
  const resolved = await resolveAvatarUrl(rows[0])
  res.json({ ...resolved, permissions: rows[0].permissions })
}

export async function updateMe(req: Request, res: Response): Promise<void> {
  const parsed = UpdateMeSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ errors: flattenError(parsed.error, (i) => i.message) })
    return
  }

  const { firstName, lastName, jobTitle, organization, country } = parsed.data
  const { rows } = await pool.query<UserRow>(
    `UPDATE plank_users
     SET first_name   = COALESCE($1, first_name),
         last_name    = COALESCE($2, last_name),
         job_title    = COALESCE($3, job_title),
         organization = COALESCE($4, organization),
         country      = COALESCE($5, country)
     WHERE id = $6
     RETURNING id, email, role_id, first_name, last_name, avatar_url,
               job_title, organization, country, created_at`,
    [firstName ?? null, lastName ?? null, jobTitle ?? null, organization ?? null, country ?? null, req.user!.id],
  )
  if (!rows[0]) { res.status(404).json({ error: 'User not found' }); return }
  res.json(await resolveAvatarUrl(rows[0]))
}

export async function uploadAvatar(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    res.status(400).json({ error: 'No file provided' })
    return
  }

  const provider = await getProvider()
  const { key } = await provider.upload(req.file, { prefix: 'avatars' })

  const { rows } = await pool.query<UserRow>(
    `UPDATE plank_users SET avatar_url = $1 WHERE id = $2
     RETURNING id, email, role_id, first_name, last_name, avatar_url, created_at`,
    [key, req.user!.id],
  )

  const avatarUrl = await provider.getUrl(key)
  res.json({ avatarUrl, user: await resolveAvatarUrl(rows[0]) })
}

export async function presignAvatar(req: Request, res: Response): Promise<void> {
  const { filename, mimeType } = req.body as { filename: string; mimeType: string }
  if (!filename || !mimeType) {
    res.status(400).json({ error: 'filename and mimeType are required' })
    return
  }

  const provider = await getProvider()

  if (!provider.presign) {
    res.json({ mode: 'direct' })
    return
  }

  const { key, uploadUrl } = await provider.presign(filename, mimeType, { prefix: 'avatars' })
  res.json({ mode: 'presigned', key, uploadUrl })
}

export async function confirmAvatar(req: Request, res: Response): Promise<void> {
  const { key } = req.body as { key: string }
  if (!key) {
    res.status(400).json({ error: 'key is required' })
    return
  }

  const provider = await getProvider()

  const { rows } = await pool.query<UserRow>(
    `UPDATE plank_users SET avatar_url = $1 WHERE id = $2
     RETURNING id, email, role_id, first_name, last_name, avatar_url, created_at`,
    [key, req.user!.id],
  )

  const avatarUrl = await provider.getUrl(key)
  res.json({ avatarUrl, user: await resolveAvatarUrl(rows[0]) })
}

export async function deleteAvatar(req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query<UserRow>(
    'SELECT avatar_url FROM plank_users WHERE id = $1',
    [req.user!.id],
  )
  const current = rows[0]?.avatar_url
  if (current && !current.startsWith('http')) {
    const provider = await getProvider()
    await provider.delete(current).catch(() => { /* file may already be gone */ })
  }
  await pool.query('UPDATE plank_users SET avatar_url = NULL WHERE id = $1', [req.user!.id])
  res.status(204).end()
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const parsed = ChangePasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ errors: flattenError(parsed.error, (i) => i.message) })
    return
  }

  const { rows } = await pool.query<{ password: string }>(
    'SELECT password FROM plank_users WHERE id = $1',
    [req.user!.id],
  )
  if (!rows[0]) { res.status(404).json({ error: 'User not found' }); return }

  const valid = await bcrypt.compare(parsed.data.currentPassword, rows[0].password)
  if (!valid) { res.status(400).json({ error: 'Current password is incorrect' }); return }

  const hashed = await bcrypt.hash(parsed.data.newPassword, 12)
  await pool.query('UPDATE plank_users SET password = $1 WHERE id = $2', [hashed, req.user!.id])
  res.status(204).end()
}

export async function createUser(req: Request, res: Response): Promise<void> {
  const parsed = CreateUserSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ errors: flattenError(parsed.error, (i) => i.message) })
    return
  }

  const { email, password, roleId } = parsed.data
  const hashed = await bcrypt.hash(password, 12)
  const id = createId()

  await pool.query(
    'INSERT INTO plank_users (id, email, password, role_id) VALUES ($1, $2, $3, $4)',
    [id, email, hashed, roleId],
  )
  res.status(201).json({ id, email, roleId })
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const parsed = UpdateUserSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ errors: flattenError(parsed.error, (i) => i.message) })
    return
  }

  const { email, roleId, firstName, lastName } = parsed.data
  const { rows } = await pool.query<UserRow>(
    `UPDATE plank_users
     SET email      = COALESCE($1, email),
         role_id    = COALESCE($2, role_id),
         first_name = COALESCE($3, first_name),
         last_name  = COALESCE($4, last_name)
     WHERE id = $5
     RETURNING id, email, role_id, first_name, last_name, created_at`,
    [email ?? null, roleId ?? null, firstName ?? null, lastName ?? null, req.params.id],
  )
  if (!rows[0]) { res.status(404).json({ error: 'User not found' }); return }
  res.json(rows[0])
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
  if (req.params.id === req.user!.id) {
    res.status(403).json({ error: 'You cannot delete your own account' }); return
  }

  const { rows } = await pool.query<{ role_id: string }>(
    'SELECT role_id FROM plank_users WHERE id = $1',
    [req.params.id],
  )
  if (!rows[0]) { res.status(404).json({ error: 'User not found' }); return }

  const { rows: roleRows } = await pool.query<{ name: string }>(
    'SELECT name FROM plank_roles WHERE id = $1',
    [rows[0].role_id],
  )
  if (roleRows[0]?.name === 'Super Admin') {
    res.status(403).json({ error: 'Super Admin users cannot be deleted' }); return
  }

  await pool.query('DELETE FROM plank_users WHERE id = $1', [req.params.id])
  res.status(204).end()
}
