import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { pool } from '@plank-cms/db'

interface JwtPayload {
  sub: string
  roleId: string
  sv?: number
  type?: string
  twoFactor?: boolean
}

const ACCESS_TOKEN_COOKIE = 'plank_session'
const REFRESH_TOKEN_COOKIE = 'plank_refresh'
const ACCESS_TOKEN_EXPIRES_SECONDS = 60 * 60 * 24 * 30

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

function buildAccessToken(payload: { sub: string; roleId: string; sv: number }): string {
  return jwt.sign(payload, process.env.PLANK_JWT_SECRET!, { expiresIn: '30d' })
}

function cookieValue(raw: string | undefined, key: string): string | null {
  if (!raw) return null
  const parts = raw.split(';')
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=')
    if (k === key) return decodeURIComponent(rest.join('='))
  }
  return null
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null
  const cookieToken = cookieValue(req.headers.cookie, ACCESS_TOKEN_COOKIE)
  const refreshToken = cookieValue(req.headers.cookie, REFRESH_TOKEN_COOKIE)
  const token = bearer ?? cookieToken

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  async function validateSession(payload: JwtPayload): Promise<{ ok: boolean; sessionVersion?: number }> {
    if (typeof payload.sv !== 'number') {
      return { ok: false }
    }
    const { rows } = await pool.query<{ session_version: number; enabled: boolean }>(
      'SELECT session_version, enabled FROM plank_users WHERE id = $1',
      [payload.sub],
    )
    if (!rows[0] || !rows[0].enabled || rows[0].session_version !== payload.sv) {
      return { ok: false }
    }
    return { ok: true, sessionVersion: rows[0].session_version }
  }

  try {
    const payload = jwt.verify(token, process.env.PLANK_JWT_SECRET!) as unknown as JwtPayload
    if (payload.twoFactor || payload.type) throw new Error('Invalid access token')
    const session = await validateSession(payload)
    if (!session.ok) {
      res.status(401).json({ error: 'Session has been revoked' })
      return
    }
    req.user = { id: payload.sub, roleId: payload.roleId, sessionVersion: session.sessionVersion }
    next()
  } catch {
    if (bearer || !refreshToken) {
      res.status(401).json({ error: 'Invalid or expired token' })
      return
    }
    try {
      const refreshPayload = jwt.verify(refreshToken, process.env.PLANK_JWT_SECRET!) as JwtPayload
      if (refreshPayload.type !== 'refresh') {
        res.status(401).json({ error: 'Invalid or expired token' })
        return
      }
      const session = await validateSession(refreshPayload)
      if (!session.ok || typeof session.sessionVersion !== 'number') {
        res.status(401).json({ error: 'Session has been revoked' })
        return
      }

      const renewed = buildAccessToken({
        sub: refreshPayload.sub,
        roleId: refreshPayload.roleId,
        sv: session.sessionVersion,
      })
      setSessionCookie(res, renewed)
      req.user = {
        id: refreshPayload.sub,
        roleId: refreshPayload.roleId,
        sessionVersion: session.sessionVersion,
      }
      next()
      return
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' })
      return
    }
  }
}
