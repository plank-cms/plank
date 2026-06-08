import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool, createId } from '@plank-cms/db'
import { createHash, randomBytes } from 'node:crypto'
import { verifySync } from 'otplib'
import { z, flattenError } from 'zod'
import { getProvider } from '../media/index.js'
import { decrypt } from '../lib/encrypt.js'
import { resolveUniquePublicAuthorSlug } from '../lib/publicAuthorSlug.js'
import { getMailingSettings, sendMail } from '../lib/mailer.js'
import { renderMailTemplate } from '../lib/mailTemplates.js'

const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

const Login2FASchema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().trim().min(6).max(16),
})

const RegisterSchema = z.object({
  email: z.email(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  password: z.string().min(8),
})

const RequestPasswordResetSchema = z.object({
  email: z.email(),
})

const ResetPasswordSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(8),
})

type UserRow = {
  id: string
  email: string
  password: string
  role_id: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  job_title: string | null
  organization: string | null
  country: string | null
  two_factor_enabled: boolean
  two_factor_secret: string | null
  enabled: boolean
  session_version: number
}
type CountRow = { count: string }
type RoleRow = { id: string; name: string; permissions: string[] }
type BackupCodeRow = { id: string; code_hash: string }

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const LOGIN_RATE_LIMIT_MAX = 10
const LOGIN_2FA_RATE_LIMIT_MAX = 5
const PASSWORD_RESET_RATE_LIMIT_MAX = 5
const PASSWORD_RESET_EXPIRES_MS = 30 * 60 * 1000

const ACCESS_TOKEN_COOKIE = 'plank_session'
const ACCESS_TOKEN_EXPIRES_SECONDS = 60 * 60 * 24 * 30
const REFRESH_TOKEN_COOKIE = 'plank_refresh'
const REFRESH_TOKEN_EXPIRES_SECONDS = 60 * 60 * 24 * 30

type SessionJwtPayload = {
  sub: string
  roleId: string
  sv: number
}

type RefreshJwtPayload = SessionJwtPayload & {
  type: 'refresh'
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

function setSessionCookie(res: Response, token: string): void {
  res.cookie(ACCESS_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_TOKEN_EXPIRES_SECONDS * 1000,
  })
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_TOKEN_EXPIRES_SECONDS * 1000,
  })
}

function clearSessionCookie(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
  })
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
  })
}

async function consumeRateLimit(scope: string, rateKey: string, max: number): Promise<boolean> {
  const resetAt = new Date(Date.now() + RATE_LIMIT_WINDOW_MS)
  const { rows } = await pool.query<{ count: number; reset_at: Date }>(
    `INSERT INTO plank_auth_rate_limits (id, scope, rate_key, count, reset_at)
     VALUES ($1, $2, $3, 1, $4)
     ON CONFLICT (scope, rate_key)
     DO UPDATE
       SET count = CASE
                     WHEN plank_auth_rate_limits.reset_at <= NOW() THEN 1
                     ELSE plank_auth_rate_limits.count + 1
                   END,
           reset_at = CASE
                        WHEN plank_auth_rate_limits.reset_at <= NOW() THEN $4
                        ELSE plank_auth_rate_limits.reset_at
                      END,
           updated_at = NOW()
     RETURNING count, reset_at`,
    [createId(), scope, rateKey, resetAt],
  )
  return (rows[0]?.count ?? max + 1) <= max
}

async function clearRateLimit(scope: string, rateKey: string): Promise<void> {
  await pool.query('DELETE FROM plank_auth_rate_limits WHERE scope = $1 AND rate_key = $2', [
    scope,
    rateKey,
  ])
}

function buildAccessToken(payload: SessionJwtPayload): string {
  return jwt.sign(payload, process.env.PLANK_JWT_SECRET!, { expiresIn: '30d' })
}

function buildRefreshToken(payload: SessionJwtPayload): string {
  const refreshPayload: RefreshJwtPayload = { ...payload, type: 'refresh' }
  return jwt.sign(refreshPayload, process.env.PLANK_JWT_SECRET!, { expiresIn: '30d' })
}

function buildChallengeToken(
  payload: SessionJwtPayload & { twoFactor: true; jti: string },
): string {
  return jwt.sign(payload, process.env.PLANK_JWT_SECRET!, { expiresIn: '5m' })
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function adminBaseUrl(req: Request): string {
  const origin = req.get('origin')
  const baseOrigin = origin ?? `${req.protocol}://${req.get('host')}`

  if (process.env.PLANK_ADMIN_DIST) return `${baseOrigin}/admin`
  return baseOrigin
}

async function buildAuthPayload(user: UserRow): Promise<{
  token: string
  user: {
    id: string
    email: string
    role: string
    permissions: string[]
    firstName: string | null
    lastName: string | null
    avatarUrl: string | null
    jobTitle: string | null
    organization: string | null
    country: string | null
    twoFactorEnabled: boolean
  }
}> {
  const { rows: roleRows } = await pool.query<RoleRow>(
    'SELECT id, name, permissions FROM plank_roles WHERE id = $1',
    [user.role_id],
  )

  let avatarUrl = user.avatar_url
  if (avatarUrl && !avatarUrl.startsWith('http')) {
    const provider = await getProvider()
    avatarUrl = await provider.getUrl(avatarUrl)
  }

  const token = buildAccessToken({ sub: user.id, roleId: user.role_id, sv: user.session_version })

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      role: roleRows[0]?.name ?? 'unknown',
      permissions: roleRows[0]?.permissions ?? [],
      firstName: user.first_name,
      lastName: user.last_name,
      avatarUrl,
      jobTitle: user.job_title,
      organization: user.organization,
      country: user.country,
      twoFactorEnabled: user.two_factor_enabled,
    },
  }
}

export async function getAuthFeatures(_req: Request, res: Response): Promise<void> {
  const mailing = await getMailingSettings()
  res.json({
    passwordRecovery:
      mailing.enabled &&
      Boolean(mailing.host && mailing.user && mailing.password && mailing.fromEmail),
  })
}

export async function login(req: Request, res: Response): Promise<void> {
  const ip = req.ip ?? 'unknown'
  const parsed = LoginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ errors: flattenError(parsed.error, (i) => i.message) })
    return
  }

  const { email, password } = parsed.data
  const rateKey = `${ip}:${email.toLowerCase()}`
  if (!(await consumeRateLimit('login', rateKey, LOGIN_RATE_LIMIT_MAX))) {
    res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' })
    return
  }

  const { rows } = await pool.query<UserRow>(
    `SELECT id, email, password, role_id, first_name, last_name, avatar_url, job_title, organization, country, two_factor_enabled, two_factor_secret, enabled, session_version
     FROM plank_users
     WHERE email = $1`,
    [email],
  )

  const user = rows[0]
  if (!user || !(await bcrypt.compare(password, user.password))) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }
  if (!user.enabled) {
    res.status(403).json({ error: 'User is disabled' })
    return
  }

  await clearRateLimit('login', rateKey)

  if (user.two_factor_enabled && user.two_factor_secret) {
    const challengeToken = buildChallengeToken({
      sub: user.id,
      roleId: user.role_id,
      sv: user.session_version,
      twoFactor: true,
      jti: createId(),
    })
    res.json({ requiresTwoFactor: true, challengeToken })
    return
  }

  const auth = await buildAuthPayload(user)
  setSessionCookie(res, auth.token)
  setRefreshCookie(
    res,
    buildRefreshToken({ sub: user.id, roleId: user.role_id, sv: user.session_version }),
  )

  res.json({
    requiresTwoFactor: false,
    user: auth.user,
  })
}

export async function requestPasswordReset(req: Request, res: Response): Promise<void> {
  const ip = req.ip ?? 'unknown'
  const parsed = RequestPasswordResetSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ errors: flattenError(parsed.error, (i) => i.message) })
    return
  }

  const email = parsed.data.email.toLowerCase()
  const rateKey = `${ip}:${email}`
  if (!(await consumeRateLimit('password-reset', rateKey, PASSWORD_RESET_RATE_LIMIT_MAX))) {
    res.status(429).json({ error: 'Too many password reset attempts. Try again in 15 minutes.' })
    return
  }

  const mailing = await getMailingSettings()
  if (
    !mailing.enabled ||
    !mailing.host ||
    !mailing.user ||
    !mailing.password ||
    !mailing.fromEmail
  ) {
    res.status(204).end()
    return
  }

  const { rows } = await pool.query<{
    id: string
    email: string
    first_name: string | null
    last_name: string | null
    enabled: boolean
  }>(
    `SELECT id, email, first_name, last_name, enabled
     FROM plank_users
     WHERE email = $1`,
    [email],
  )
  const user = rows[0]
  if (!user || !user.enabled) {
    res.status(204).end()
    return
  }

  const token = randomBytes(32).toString('base64url')
  const resetUrl = `${adminBaseUrl(req)}/reset-password?token=${encodeURIComponent(token)}`
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRES_MS)

  await pool.query(
    `INSERT INTO plank_password_reset_tokens (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [createId(), user.id, hashToken(token), expiresAt],
  )

  const html = renderMailTemplate('password-reset', {
    subject: 'Reset your password',
    resetUrl,
    expiresIn: '30 minutes',
    userName: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email,
  })

  await sendMail({
    to: user.email,
    subject: 'Reset your Plank CMS password',
    html,
  })

  await clearRateLimit('password-reset', rateKey)
  res.status(204).end()
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const parsed = ResetPasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ errors: flattenError(parsed.error, (i) => i.message) })
    return
  }

  const tokenHash = hashToken(parsed.data.token)
  const { rows } = await pool.query<{
    id: string
    user_id: string
    enabled: boolean
  }>(
    `SELECT t.id, t.user_id, u.enabled
     FROM plank_password_reset_tokens t
     JOIN plank_users u ON u.id = t.user_id
     WHERE t.token_hash = $1
       AND t.used_at IS NULL
       AND t.expires_at > NOW()`,
    [tokenHash],
  )
  const resetToken = rows[0]
  if (!resetToken || !resetToken.enabled) {
    res.status(400).json({ error: 'Invalid or expired password reset link' })
    return
  }

  const hashed = await bcrypt.hash(parsed.data.password, 12)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE plank_users
       SET password = $1,
           two_factor_enabled = FALSE,
           two_factor_secret = NULL,
           two_factor_temp_secret = NULL,
           session_version = session_version + 1
       WHERE id = $2`,
      [hashed, resetToken.user_id],
    )
    await client.query('DELETE FROM plank_user_backup_codes WHERE user_id = $1', [
      resetToken.user_id,
    ])
    await client.query(
      `UPDATE plank_password_reset_tokens
       SET used_at = NOW()
       WHERE user_id = $1 AND used_at IS NULL`,
      [resetToken.user_id],
    )
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  res.status(204).end()
}

export async function loginWithTwoFactor(req: Request, res: Response): Promise<void> {
  const ip = req.ip ?? 'unknown'
  const parsed = Login2FASchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ errors: flattenError(parsed.error, (i) => i.message) })
    return
  }

  let payload: { sub: string; roleId: string; sv: number; twoFactor?: boolean; jti?: string }
  try {
    payload = jwt.verify(parsed.data.challengeToken, process.env.PLANK_JWT_SECRET!) as {
      sub: string
      roleId: string
      sv: number
      twoFactor?: boolean
      jti?: string
    }
  } catch {
    res.status(401).json({ error: 'Invalid or expired 2FA challenge' })
    return
  }

  if (!payload.twoFactor) {
    res.status(400).json({ error: 'Invalid 2FA challenge token' })
    return
  }
  const rateKey = `${ip}:${payload.sub}:${payload.jti ?? 'nojti'}`
  if (!(await consumeRateLimit('login-2fa', rateKey, LOGIN_2FA_RATE_LIMIT_MAX))) {
    res.status(429).json({ error: 'Too many 2FA attempts. Try again in 15 minutes.' })
    return
  }

  const { rows } = await pool.query<UserRow>(
    `SELECT id, email, role_id, first_name, last_name, avatar_url, job_title, organization, country, two_factor_enabled, two_factor_secret, password, enabled, session_version
     FROM plank_users WHERE id = $1`,
    [payload.sub],
  )
  const user = rows[0]
  if (user && !user.enabled) {
    res.status(403).json({ error: 'User is disabled' })
    return
  }
  if (!user || !user.two_factor_enabled || !user.two_factor_secret) {
    res.status(401).json({ error: '2FA is not enabled for this account' })
    return
  }
  if (user.session_version !== payload.sv) {
    res.status(401).json({ error: '2FA challenge expired. Start login again.' })
    return
  }

  const submitted = parsed.data.code.trim().toUpperCase()
  const normalizedBackup = submitted.replace(/[^A-Z0-9]/g, '')

  let isValid = false
  const totpResult = verifySync({
    token: submitted,
    secret: decrypt(user.two_factor_secret),
  })
  if (totpResult.valid) {
    isValid = true
  } else if (normalizedBackup.length === 8) {
    const { rows: backupRows } = await pool.query<BackupCodeRow>(
      'SELECT id, code_hash FROM plank_user_backup_codes WHERE user_id = $1 AND used_at IS NULL',
      [user.id],
    )
    for (const backupRow of backupRows) {
      const match = await bcrypt.compare(normalizedBackup, backupRow.code_hash)
      if (match) {
        await pool.query('UPDATE plank_user_backup_codes SET used_at = NOW() WHERE id = $1', [
          backupRow.id,
        ])
        isValid = true
        break
      }
    }
  }
  if (!isValid) {
    res.status(401).json({ error: 'Invalid verification or backup code' })
    return
  }
  await clearRateLimit('login-2fa', rateKey)

  const auth = await buildAuthPayload(user)
  setSessionCookie(res, auth.token)
  setRefreshCookie(
    res,
    buildRefreshToken({ sub: user.id, roleId: user.role_id, sv: user.session_version }),
  )

  res.json({
    requiresTwoFactor: false,
    user: auth.user,
  })
}

export async function logout(req: Request, res: Response): Promise<void> {
  const cookieHeader = req.headers.cookie ?? ''
  const raw = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${ACCESS_TOKEN_COOKIE}=`))
    ?.slice(`${ACCESS_TOKEN_COOKIE}=`.length)

  if (raw) {
    try {
      const payload = jwt.verify(decodeURIComponent(raw), process.env.PLANK_JWT_SECRET!) as {
        sub?: string
      }
      if (payload.sub) {
        await pool.query(
          'UPDATE plank_users SET session_version = session_version + 1 WHERE id = $1',
          [payload.sub],
        )
      }
    } catch {
      // ignore invalid cookie token; still clear cookie
    }
  }

  clearSessionCookie(res)
  clearRefreshCookie(res)
  // Cleanup best-effort for previous login keys from this client IP.
  const ip = req.ip ?? 'unknown'
  await pool.query('DELETE FROM plank_auth_rate_limits WHERE rate_key LIKE $1', [`${ip}:%`])
  res.status(204).end()
}

export async function setup(_req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query<CountRow>('SELECT COUNT(*) as count FROM plank_users')
  res.json({ needsSetup: parseInt(rows[0].count) === 0 })
}

export async function register(req: Request, res: Response): Promise<void> {
  const { rows: countRows } = await pool.query<CountRow>(
    'SELECT COUNT(*) as count FROM plank_users',
  )
  if (parseInt(countRows[0].count) > 0) {
    res.status(403).json({ error: 'Registration is closed. Use the admin panel to manage users.' })
    return
  }

  const parsed = RegisterSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ errors: flattenError(parsed.error, (i) => i.message) })
    return
  }

  const { email, firstName, lastName, password } = parsed.data
  const hashed = await bcrypt.hash(password, 12)

  const { rows: roleRows } = await pool.query<RoleRow>(
    'SELECT id, name FROM plank_roles WHERE name = $1',
    ['Super Admin'],
  )
  const superAdminRole = roleRows[0]
  if (!superAdminRole) {
    res.status(500).json({ error: 'Super Admin role is not configured.' })
    return
  }

  const id = createId()
  const publicAuthorSlug = await resolveUniquePublicAuthorSlug({ email, firstName, lastName })
  await pool.query(
    `INSERT INTO plank_users
       (id, email, password, role_id, first_name, last_name, public_author_slug)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, email, hashed, superAdminRole.id, firstName, lastName, publicAuthorSlug],
  )

  res.status(201).json({ id, email })
}
