import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { pool, createId } from '@plank-cms/db'
import { generateSecret, generateURI, verifySync } from 'otplib'
import { randomBytes } from 'node:crypto'
import { z, flattenError } from 'zod'
import { getProvider } from '../media/index.js'
import { decrypt, encrypt } from '../lib/encrypt.js'
import { resolveAppModes } from '../lib/appModes.js'
import { resolveUniquePublicAuthorSlug } from '../lib/publicAuthorSlug.js'

const CreateUserSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  roleId: z.string().min(1),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  enabled: z.boolean().optional(),
})

const UpdateUserSchema = z.object({
  email: z.email().optional(),
  roleId: z.string().min(1).optional(),
  firstName: z.string().max(100).nullable().optional(),
  lastName: z.string().max(100).nullable().optional(),
  enabled: z.boolean().optional(),
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

const TwoFactorCodeSchema = z.object({
  code: z.string().trim().length(6),
})

const DisableTwoFactorSchema = z.object({
  password: z.string().min(1),
  code: z.string().trim().length(6),
})

const RegenerateBackupCodesSchema = z.object({
  password: z.string().min(1),
  code: z.string().trim().length(6),
})

type UserRow = {
  id: string
  email: string
  role_id: string
  role_name?: string
  first_name: string | null
  last_name: string | null
  public_author_slug?: string | null
  avatar_url: string | null
  job_title: string | null
  organization: string | null
  country: string | null
  two_factor_enabled: boolean
  two_factor_secret: string | null
  two_factor_temp_secret: string | null
  enabled?: boolean
  created_at: Date
}

const BACKUP_CODE_COUNT = 8
const BACKUP_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateBackupCode(): string {
  const bytes = randomBytes(8)
  let raw = ''
  for (let i = 0; i < 8; i++) {
    raw += BACKUP_CODE_CHARS[bytes[i] % BACKUP_CODE_CHARS.length]
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`
}

async function issueBackupCodes(userId: string): Promise<string[]> {
  const plainCodes = Array.from({ length: BACKUP_CODE_COUNT }, () => generateBackupCode())
  const hashedCodes = await Promise.all(
    plainCodes.map((code) => bcrypt.hash(code.replace('-', ''), 12)),
  )

  await pool.query('DELETE FROM plank_user_backup_codes WHERE user_id = $1', [userId])
  for (const hash of hashedCodes) {
    await pool.query(
      'INSERT INTO plank_user_backup_codes (id, user_id, code_hash) VALUES ($1, $2, $3)',
      [createId(), userId, hash],
    )
  }
  return plainCodes
}

async function resolveAvatarUrl(row: UserRow): Promise<UserRow> {
  if (!row.avatar_url || row.avatar_url.startsWith('http')) return row
  const provider = await getProvider()
  return { ...row, avatar_url: await provider.getUrl(row.avatar_url) }
}

async function roleNameById(roleId: string): Promise<string | null> {
  const { rows } = await pool.query<{ name: string }>(
    'SELECT name FROM plank_roles WHERE id = $1',
    [roleId],
  )
  return rows[0]?.name ?? null
}

export async function listUsers(_req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query<UserRow>(
    `SELECT u.id, u.email, u.role_id, r.name as role_name, u.first_name, u.last_name, u.enabled, u.created_at
     FROM plank_users u
     JOIN plank_roles r ON r.id = u.role_id
     ORDER BY u.created_at DESC`,
  )
  res.json(rows)
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query<UserRow & { permissions: string[]; role_name: string }>(
    `SELECT u.id, u.email, u.role_id, u.first_name, u.last_name, u.public_author_slug, u.avatar_url,
            u.job_title, u.organization, u.country, u.two_factor_enabled, u.enabled, u.created_at,
            r.name AS role_name, r.permissions
     FROM plank_users u
     JOIN plank_roles r ON r.id = u.role_id
     WHERE u.id = $1`,
    [req.user!.id],
  )
  if (!rows[0]) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  const resolved = await resolveAvatarUrl(rows[0])
  const modes = req.appModes ?? (await resolveAppModes())
  res.json({
    ...resolved,
    role: rows[0].role_name,
    permissions: rows[0].permissions,
    enabled: rows[0].enabled ?? true,
    two_factor_enabled: rows[0].two_factor_enabled,
    modes,
  })
}

export async function getTwoFactorStatus(req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query<{ two_factor_enabled: boolean }>(
    'SELECT two_factor_enabled FROM plank_users WHERE id = $1',
    [req.user!.id],
  )
  if (!rows[0]) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  res.json({ enabled: rows[0].two_factor_enabled })
}

export async function startTwoFactorSetup(req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query<{ email: string; two_factor_enabled: boolean }>(
    'SELECT email, two_factor_enabled FROM plank_users WHERE id = $1',
    [req.user!.id],
  )
  if (!rows[0]) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  if (rows[0].two_factor_enabled) {
    res.status(400).json({ error: '2FA is already enabled' })
    return
  }

  const secret = generateSecret()
  await pool.query('UPDATE plank_users SET two_factor_temp_secret = $1 WHERE id = $2', [
    encrypt(secret),
    req.user!.id,
  ])

  const otpauthUri = generateURI({ issuer: 'Plank CMS', label: rows[0].email, secret })
  res.json({ otpauthUri, secret })
}

export async function verifyTwoFactorSetup(req: Request, res: Response): Promise<void> {
  const parsed = TwoFactorCodeSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ errors: flattenError(parsed.error, (i) => i.message) })
    return
  }

  const { rows } = await pool.query<{ two_factor_temp_secret: string | null }>(
    'SELECT two_factor_temp_secret FROM plank_users WHERE id = $1',
    [req.user!.id],
  )
  const tempSecret = rows[0]?.two_factor_temp_secret
  if (!tempSecret) {
    res.status(400).json({ error: 'No pending 2FA setup found' })
    return
  }

  const result = verifySync({ token: parsed.data.code, secret: decrypt(tempSecret) })
  if (!result.valid) {
    res.status(401).json({ error: 'Invalid verification code' })
    return
  }

  await pool.query(
    `UPDATE plank_users
     SET two_factor_enabled = TRUE,
         two_factor_secret = two_factor_temp_secret,
         two_factor_temp_secret = NULL,
         session_version = session_version + 1
     WHERE id = $1`,
    [req.user!.id],
  )

  const backupCodes = await issueBackupCodes(req.user!.id)
  res.json({ backupCodes })
}

export async function disableTwoFactor(req: Request, res: Response): Promise<void> {
  const parsed = DisableTwoFactorSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ errors: flattenError(parsed.error, (i) => i.message) })
    return
  }

  const { rows } = await pool.query<{
    two_factor_enabled: boolean
    two_factor_secret: string | null
    password: string
  }>('SELECT two_factor_enabled, two_factor_secret, password FROM plank_users WHERE id = $1', [
    req.user!.id,
  ])
  const user = rows[0]
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  if (!user.two_factor_enabled || !user.two_factor_secret) {
    res.status(400).json({ error: '2FA is not enabled' })
    return
  }
  const passwordOk = await bcrypt.compare(parsed.data.password, user.password)
  if (!passwordOk) {
    res.status(401).json({ error: 'Current password is incorrect' })
    return
  }

  const result = verifySync({
    token: parsed.data.code,
    secret: decrypt(user.two_factor_secret),
  })
  if (!result.valid) {
    res.status(401).json({ error: 'Invalid verification code' })
    return
  }

  await pool.query(
    `UPDATE plank_users
     SET two_factor_enabled = FALSE,
         two_factor_secret = NULL,
         two_factor_temp_secret = NULL,
         session_version = session_version + 1
     WHERE id = $1`,
    [req.user!.id],
  )
  await pool.query('DELETE FROM plank_user_backup_codes WHERE user_id = $1', [req.user!.id])
  res.status(204).end()
}

export async function regenerateBackupCodes(req: Request, res: Response): Promise<void> {
  const parsed = RegenerateBackupCodesSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ errors: flattenError(parsed.error, (i) => i.message) })
    return
  }

  const { rows } = await pool.query<{
    two_factor_enabled: boolean
    two_factor_secret: string | null
    password: string
  }>('SELECT two_factor_enabled, two_factor_secret, password FROM plank_users WHERE id = $1', [
    req.user!.id,
  ])
  const user = rows[0]
  if (!user || !user.two_factor_enabled || !user.two_factor_secret) {
    res.status(400).json({ error: '2FA is not enabled' })
    return
  }

  const passwordOk = await bcrypt.compare(parsed.data.password, user.password)
  if (!passwordOk) {
    res.status(401).json({ error: 'Current password is incorrect' })
    return
  }
  const totpResult = verifySync({
    token: parsed.data.code,
    secret: decrypt(user.two_factor_secret),
  })
  if (!totpResult.valid) {
    res.status(401).json({ error: 'Invalid verification code' })
    return
  }

  const backupCodes = await issueBackupCodes(req.user!.id)
  res.json({ backupCodes })
}

export async function updateMe(req: Request, res: Response): Promise<void> {
  const parsed = UpdateMeSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ errors: flattenError(parsed.error, (i) => i.message) })
    return
  }

  const { firstName, lastName, jobTitle, organization, country } = parsed.data
  const { rows: currentRows } = await pool.query<{
    email: string
    first_name: string | null
    last_name: string | null
  }>('SELECT email, first_name, last_name FROM plank_users WHERE id = $1', [req.user!.id])
  if (!currentRows[0]) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  const nextFirstName = firstName ?? currentRows[0].first_name
  const nextLastName = lastName ?? currentRows[0].last_name
  const publicAuthorSlug = await resolveUniquePublicAuthorSlug(
    {
      email: currentRows[0].email,
      firstName: nextFirstName,
      lastName: nextLastName,
    },
    req.user!.id,
  )
  const { rows } = await pool.query<UserRow>(
    `UPDATE plank_users
     SET first_name   = COALESCE($1, first_name),
         last_name    = COALESCE($2, last_name),
         job_title    = COALESCE($3, job_title),
         organization = COALESCE($4, organization),
         country      = COALESCE($5, country),
         public_author_slug = $6
     WHERE id = $7
     RETURNING id, email, role_id, first_name, last_name, public_author_slug, avatar_url,
               job_title, organization, country, created_at`,
    [
      firstName ?? null,
      lastName ?? null,
      jobTitle ?? null,
      organization ?? null,
      country ?? null,
      publicAuthorSlug,
      req.user!.id,
    ],
  )
  if (!rows[0]) {
    res.status(404).json({ error: 'User not found' })
    return
  }
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
  const { rows } = await pool.query<UserRow>('SELECT avatar_url FROM plank_users WHERE id = $1', [
    req.user!.id,
  ])
  const current = rows[0]?.avatar_url
  if (current && !current.startsWith('http')) {
    const provider = await getProvider()
    await provider.delete(current).catch(() => {
      /* file may already be gone */
    })
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
  if (!rows[0]) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const valid = await bcrypt.compare(parsed.data.currentPassword, rows[0].password)
  if (!valid) {
    res.status(400).json({ error: 'Current password is incorrect' })
    return
  }

  const hashed = await bcrypt.hash(parsed.data.newPassword, 12)
  await pool.query(
    'UPDATE plank_users SET password = $1, session_version = session_version + 1 WHERE id = $2',
    [hashed, req.user!.id],
  )
  res.status(204).end()
}

export async function createUser(req: Request, res: Response): Promise<void> {
  const parsed = CreateUserSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ errors: flattenError(parsed.error, (i) => i.message) })
    return
  }

  const { email, password, roleId, firstName, lastName, enabled } = parsed.data
  const requesterRoleName = await roleNameById(req.user!.roleId)
  const targetRoleName = await roleNameById(roleId)
  if (targetRoleName === 'Super Admin' && requesterRoleName !== 'Super Admin') {
    res.status(403).json({ error: 'Only Super Admin can assign Super Admin role' })
    return
  }
  const editorialMode = req.appModes?.editorial ?? false
  const isEditorialExclusiveRole = ['Editor', 'Viewer'].includes(targetRoleName ?? '')
  const nextEnabled = editorialMode || !isEditorialExclusiveRole ? (enabled ?? true) : false
  const hashed = await bcrypt.hash(password, 12)
  const id = createId()
  const publicAuthorSlug = await resolveUniquePublicAuthorSlug({ email, firstName, lastName })

  await pool.query(
    `INSERT INTO plank_users
       (id, email, password, role_id, first_name, last_name, public_author_slug, enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, email, hashed, roleId, firstName, lastName, publicAuthorSlug, nextEnabled],
  )
  res.status(201).json({
    id,
    email,
    roleId,
    first_name: firstName,
    last_name: lastName,
    public_author_slug: publicAuthorSlug,
    enabled: nextEnabled,
  })
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const parsed = UpdateUserSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ errors: flattenError(parsed.error, (i) => i.message) })
    return
  }

  const { email, roleId, firstName, lastName, enabled } = parsed.data
  const requesterRoleName = await roleNameById(req.user!.roleId)
  const { rows: targetRows } = await pool.query<{ role_id: string }>(
    'SELECT role_id FROM plank_users WHERE id = $1',
    [req.params.id],
  )
  if (!targetRows[0]) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  const targetCurrentRoleName = await roleNameById(targetRows[0].role_id)
  if (targetCurrentRoleName === 'Super Admin' && requesterRoleName !== 'Super Admin') {
    res.status(403).json({ error: 'Only Super Admin can edit Super Admin users' })
    return
  }
  const editorialMode = req.appModes?.editorial ?? false
  let resolvedEnabled: boolean | undefined = enabled
  if (roleId) {
    const nextRoleName = await roleNameById(roleId)
    if (nextRoleName === 'Super Admin' && requesterRoleName !== 'Super Admin') {
      res.status(403).json({ error: 'Only Super Admin can assign Super Admin role' })
      return
    }
    if (!editorialMode && ['Editor', 'Viewer'].includes(nextRoleName ?? '')) {
      resolvedEnabled = false
    }
  }
  const targetUserId = String(req.params.id)
  const { rows: currentRows } = await pool.query<{
    email: string
    first_name: string | null
    last_name: string | null
  }>('SELECT email, first_name, last_name FROM plank_users WHERE id = $1', [targetUserId])
  if (!currentRows[0]) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  const nextFirstName = firstName ?? currentRows[0].first_name
  const nextLastName = lastName ?? currentRows[0].last_name
  const nextEmail = email ?? currentRows[0].email
  const publicAuthorSlug = await resolveUniquePublicAuthorSlug(
    {
      email: nextEmail,
      firstName: nextFirstName,
      lastName: nextLastName,
    },
    targetUserId,
  )
  const { rows } = await pool.query<UserRow>(
    `UPDATE plank_users
     SET email      = COALESCE($1, email),
         role_id    = COALESCE($2, role_id),
         first_name = COALESCE($3, first_name),
         last_name  = COALESCE($4, last_name),
         enabled    = COALESCE($5, enabled),
         public_author_slug = $6,
         session_version = CASE
           WHEN $5 IS NOT NULL AND $5 = FALSE AND enabled = TRUE THEN session_version + 1
           ELSE session_version
         END
     WHERE id = $7
     RETURNING id, email, role_id, first_name, last_name, public_author_slug, enabled, created_at`,
    [
      email ?? null,
      roleId ?? null,
      firstName ?? null,
      lastName ?? null,
      resolvedEnabled ?? null,
      publicAuthorSlug,
      req.params.id,
    ],
  )
  if (!rows[0]) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  res.json(rows[0])
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
  if (req.params.id === req.user!.id) {
    res.status(403).json({ error: 'You cannot delete your own account' })
    return
  }

  const { rows } = await pool.query<{ role_id: string }>(
    'SELECT role_id FROM plank_users WHERE id = $1',
    [req.params.id],
  )
  if (!rows[0]) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const { rows: roleRows } = await pool.query<{ name: string }>(
    'SELECT name FROM plank_roles WHERE id = $1',
    [rows[0].role_id],
  )
  if (roleRows[0]?.name === 'Super Admin') {
    res.status(403).json({ error: 'Super Admin users cannot be deleted' })
    return
  }

  await pool.query('DELETE FROM plank_users WHERE id = $1', [req.params.id])
  res.status(204).end()
}
