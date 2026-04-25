import type { Request, Response } from 'express'
import { pool, createId } from '@plank/db'
import { z, flattenError } from 'zod'

export type WebhookEvent =
  | 'entry.created'
  | 'entry.updated'
  | 'entry.deleted'
  | 'entry.published'
  | 'entry.unpublished'

type WebhookRow = { id: string; name: string; url: string; events: string[]; enabled: boolean; created_at: Date }

const CreateWebhookSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  events: z.array(z.enum(['entry.created', 'entry.updated', 'entry.deleted', 'entry.published', 'entry.unpublished'])).min(1),
})

export async function listWebhooks(_req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query<WebhookRow>(
    'SELECT id, name, url, events, enabled, created_at FROM plank_webhooks ORDER BY created_at DESC',
  )
  res.json(rows)
}

export async function createWebhook(req: Request, res: Response): Promise<void> {
  const parsed = CreateWebhookSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ errors: flattenError(parsed.error, (i) => i.message) })
    return
  }

  const { name, url, events } = parsed.data
  const id = createId()

  const { rows } = await pool.query<WebhookRow>(
    'INSERT INTO plank_webhooks (id, name, url, events) VALUES ($1, $2, $3, $4) RETURNING *',
    [id, name, url, events],
  )

  res.status(201).json(rows[0])
}

export async function deleteWebhook(req: Request, res: Response): Promise<void> {
  const { rowCount } = await pool.query('DELETE FROM plank_webhooks WHERE id = $1', [req.params.id])
  if (!rowCount) { res.status(404).json({ error: 'Webhook not found' }); return }
  res.status(204).end()
}

export async function triggerWebhooks(
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  const { rows } = await pool.query<WebhookRow>(
    "SELECT * FROM plank_webhooks WHERE enabled = TRUE AND $1 = ANY(events)",
    [event],
  )

  if (rows.length === 0) return

  const body = JSON.stringify({ event, ...payload, triggered_at: new Date().toISOString() })

  await Promise.allSettled(
    rows.map((webhook) =>
      fetch(webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(10_000),
      }),
    ),
  )
}
