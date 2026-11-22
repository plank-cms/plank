import type { Request, Response } from 'express'
import { randomBytes, createHash } from 'node:crypto'
import { pool, createId } from '@plank-cms/db'
import { z, flattenError } from 'zod'

const CreateTokenSchema = z.object({
  name: z.string().trim().min(1).max(255),
  accessType: z.enum(['read-only', 'full-access', 'mcp-server']),
})

type TokenRow = { id: string; name: string; access_type: string; created_at: Date }

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function listApiTokens(_req: Request, res: Response): Promise<void> {
  await listTokens(res)
}

export async function listOwnApiTokens(req: Request, res: Response): Promise<void> {
  await listTokens(res, req.user!.id)
}

async function listTokens(res: Response, owner?: string) {
  const { rows } = await pool.query<TokenRow>(
    `SELECT id, name, access_type, created_at FROM plank_api_tokens
     ${owner === undefined ? '' : 'WHERE created_by = $1'} ORDER BY created_at DESC`,
    owner === undefined ? [] : [owner],
  )
  res.json(rows)
}

export async function createApiToken(req: Request, res: Response): Promise<void> {
  const parsed = CreateTokenSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ errors: flattenError(parsed.error, (i) => i.message) })
    return
  }

  const { name, accessType } = parsed.data
  if (accessType !== 'mcp-server') {
    const { rows } = await pool.query<{ permissions: string[] }>(
      `SELECT r.permissions FROM plank_users u JOIN plank_roles r ON r.id = u.role_id
       WHERE u.id = $1 AND u.enabled = TRUE`,
      [req.user!.id],
    )
    const permissions = rows[0]?.permissions ?? []
    if (
      !permissions.includes('*') &&
      (!permissions.includes('entries:read') ||
        (accessType === 'full-access' && !permissions.includes('entries:write')))
    ) {
      res.status(403).json({ error: 'Your role does not allow this token access type' })
      return
    }
  }
  const id = createId()
  const token = `plank_${randomBytes(32).toString('hex')}`
  const hashed = hashToken(token)

  await pool.query(
    'INSERT INTO plank_api_tokens (id, name, token, access_type, created_by) VALUES ($1, $2, $3, $4, $5)',
    [id, name, hashed, accessType, req.user!.id],
  )

  res.set('Cache-Control', 'no-store').status(201).json({ id, name, accessType, token })
}

export async function deleteApiToken(req: Request, res: Response): Promise<void> {
  await deleteToken(req, res)
}

export async function deleteOwnApiToken(req: Request, res: Response): Promise<void> {
  await deleteToken(req, res, req.user!.id)
}

async function deleteToken(req: Request, res: Response, owner?: string) {
  const { rowCount } = await pool.query(
    `DELETE FROM plank_api_tokens WHERE id = $1${owner === undefined ? '' : ' AND created_by = $2'}`,
    owner === undefined ? [req.params.id] : [req.params.id, owner],
  )
  if (!rowCount) {
    res.status(404).json({ error: 'API token not found' })
    return
  }
  res.status(204).end()
}
