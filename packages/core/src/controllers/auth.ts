import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool, createId } from '@plank/db'
import { z, flattenError } from 'zod'

const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

const RegisterSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
})

type UserRow = { id: string; email: string; password: string; role_id: string; first_name: string | null; last_name: string | null; avatar_url: string | null }
type CountRow = { count: string }
type RoleRow = { id: string; name: string; permissions: string[] }

const loginAttempts = new Map<string, { count: number; resetAt: number }>()

const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = loginAttempts.get(ip)

  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }

  if (entry.count >= RATE_LIMIT_MAX) return false

  entry.count++
  return true
}

function clearRateLimit(ip: string): void {
  loginAttempts.delete(ip)
}

export async function login(req: Request, res: Response): Promise<void> {
  const ip = req.ip ?? 'unknown'
  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' })
    return
  }

  const parsed = LoginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ errors: flattenError(parsed.error, (i) => i.message) })
    return
  }

  const { email, password } = parsed.data
  const { rows } = await pool.query<UserRow>(
    'SELECT id, email, password, role_id, first_name, last_name, avatar_url FROM plank_users WHERE email = $1',
    [email],
  )

  const user = rows[0]
  if (!user || !(await bcrypt.compare(password, user.password))) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }

  const { rows: roleRows } = await pool.query<RoleRow>(
    'SELECT id, name, permissions FROM plank_roles WHERE id = $1',
    [user.role_id],
  )

  clearRateLimit(ip)

  const token = jwt.sign(
    { sub: user.id, roleId: user.role_id },
    process.env.PLANK_JWT_SECRET!,
    { expiresIn: '7d' },
  )

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: roleRows[0]?.name ?? 'unknown',
      permissions: roleRows[0]?.permissions ?? [],
      firstName: user.first_name,
      lastName: user.last_name,
      avatarUrl: user.avatar_url,
    },
  })
}

export async function setup(_req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query<CountRow>('SELECT COUNT(*) as count FROM plank_users')
  res.json({ needsSetup: parseInt(rows[0].count) === 0 })
}

export async function register(req: Request, res: Response): Promise<void> {
  const { rows: countRows } = await pool.query<CountRow>('SELECT COUNT(*) as count FROM plank_users')
  if (parseInt(countRows[0].count) > 0) {
    res.status(403).json({ error: 'Registration is closed. Use the admin panel to manage users.' })
    return
  }

  const parsed = RegisterSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ errors: flattenError(parsed.error, (i) => i.message) })
    return
  }

  const { email, password } = parsed.data
  const hashed = await bcrypt.hash(password, 12)

  const { rows: roleRows } = await pool.query<RoleRow>(
    'SELECT id, name FROM plank_roles WHERE name = $1',
    ['Super Admin'],
  )

  const id = createId()
  await pool.query(
    'INSERT INTO plank_users (id, email, password, role_id) VALUES ($1, $2, $3, $4)',
    [id, email, hashed, roleRows[0].id],
  )

  res.status(201).json({ id, email })
}
