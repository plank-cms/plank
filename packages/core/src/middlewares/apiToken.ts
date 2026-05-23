import type { Request, Response, NextFunction } from 'express'
import { createHash } from 'node:crypto'
import { pool } from '@plank-cms/db'

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const PUBLIC_API_ACCESS_TYPES = new Set<Express.ApiTokenAccessType>(['read-only', 'full-access'])
const MCP_ACCESS_TYPES = new Set<Express.ApiTokenAccessType>(['mcp-server'])

async function enforceApiToken(
  req: Request,
  res: Response,
  next: NextFunction,
  allowedAccessTypes: Set<Express.ApiTokenAccessType>,
): Promise<void> {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'API token required' })
    return
  }

  const raw = header.slice(7)
  const hashed = createHash('sha256').update(raw).digest('hex')

  const { rows } = await pool.query<{ id: string; access_type: Express.ApiTokenAccessType }>(
    'SELECT id, access_type FROM plank_api_tokens WHERE token = $1',
    [hashed],
  )

  if (!rows[0]) {
    res.status(401).json({ error: 'Invalid API token' })
    return
  }

  if (!allowedAccessTypes.has(rows[0].access_type)) {
    res.status(403).json({ error: 'This token cannot access this endpoint' })
    return
  }

  if (rows[0].access_type === 'read-only' && !READ_ONLY_METHODS.has(req.method)) {
    res.status(403).json({ error: 'This token only allows read access' })
    return
  }

  req.apiToken = {
    id: rows[0].id,
    accessType: rows[0].access_type,
  }

  next()
}

export async function apiToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  await enforceApiToken(req, res, next, PUBLIC_API_ACCESS_TYPES)
}

export async function mcpToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  await enforceApiToken(req, res, next, MCP_ACCESS_TYPES)
}
