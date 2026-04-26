import type { Request, Response } from 'express'
import { pool } from '@plank/db'
import { z } from 'zod'

const SetPrefSchema = z.object({ value: z.unknown() })

export async function getUserPref(req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query<{ value: string }>(
    'SELECT value FROM plank_user_prefs WHERE user_id = $1 AND key = $2',
    [req.user!.id, req.params.key],
  )
  res.json({ value: rows[0] ? JSON.parse(rows[0].value) : null })
}

export async function setUserPref(req: Request, res: Response): Promise<void> {
  const parsed = SetPrefSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Invalid body' }); return }

  await pool.query(
    `INSERT INTO plank_user_prefs (user_id, key, value, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [req.user!.id, req.params.key, JSON.stringify(parsed.data.value)],
  )
  res.status(204).end()
}
