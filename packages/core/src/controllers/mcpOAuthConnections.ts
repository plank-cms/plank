import type { Request, Response } from 'express'
import { pool } from '@plank-cms/db'
import { getMcpOAuthConfig } from '../lib/mcpOAuth.js'

export async function listOwnMcpOAuthConnections(req: Request, res: Response) {
  const config = await getMcpOAuthConfig()
  const rows = config
    ? (
        await pool.query<{ clientId: string; name: string }>(
          `SELECT c.client_id AS "clientId", c.name FROM plank_mcp_oauth_clients c
         WHERE c.owner_id = $1 AND EXISTS (
           SELECT 1 FROM plank_mcp_oauth_grants g
           WHERE g.client_id = c.client_id AND g.redirect_uri = c.redirect_uri
             AND g.user_id = $1 AND g.session_version = $2 AND g.resource = $3
             AND g.refresh_hash IS NOT NULL AND g.expires_at > NOW()
         ) ORDER BY c.name, c.client_id`,
          [req.user!.id, req.user!.sessionVersion, config.resource],
        )
      ).rows
    : []

  res
    .set('Cache-Control', 'no-store')
    .json({ serverUrl: config?.resource ?? null, connections: rows })
}

export async function revokeOwnMcpOAuthConnection(req: Request, res: Response) {
  const { rowCount } = await pool.query(
    'DELETE FROM plank_mcp_oauth_grants WHERE user_id = $1 AND client_id = $2',
    [req.user!.id, req.params.id],
  )
  if (!rowCount) {
    res.status(404).json({ error: 'OAuth connection not found' })
    return
  }
  res.status(204).end()
}
