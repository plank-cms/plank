import type { Request, Response } from 'express'
import { randomBytes, createHash } from 'node:crypto'
import { pool, createId } from '@plank-cms/db'
import { z, flattenError } from 'zod'

const CreateTokenSchema = z.object({
  name: z.string().min(1),
  accessType: z.enum(['read-only', 'full-access', 'mcp-server']),
})

type TokenRow = { id: string; name: string; access_type: string; created_at: Date }

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function listApiTokens(_req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query<TokenRow>(
    'SELECT id, name, access_type, created_at FROM plank_api_tokens ORDER BY created_at DESC',
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
  const id = createId()
  const token = `plank_${randomBytes(32).toString('hex')}`
  const hashed = hashToken(token)

  await pool.query(
    'INSERT INTO plank_api_tokens (id, name, token, access_type, created_by) VALUES ($1, $2, $3, $4, $5)',
    [id, name, hashed, accessType, req.user!.id],
  )

  // Raw token returned once — never retrievable again
  res.status(201).json({ id, name, accessType, token })
}

export async function deleteApiToken(req: Request, res: Response): Promise<void> {
  const { rowCount } = await pool.query(
    'DELETE FROM plank_api_tokens WHERE id = $1',
    [req.params.id],
  )
  if (!rowCount) { res.status(404).json({ error: 'API token not found' }); return }
  res.status(204).end()
}
