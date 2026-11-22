import { randomBytes } from 'node:crypto'
import type { Request, Response } from 'express'
import { pool } from '@plank-cms/db'
import { z } from 'zod'
import { getSetting, setSettings } from '../lib/settings.js'
import {
  hasMcpOAuthSessionSecret,
  mcpOAuthNamespace,
  mcpOAuthOrigin,
  mcpOAuthRedirectUri,
} from '../lib/mcpOAuth.js'
import { hashMcpCredential, listMcpOAuthClients } from '../services/mcpOAuthClients.js'

const originSchema = z.object({ origin: mcpOAuthOrigin })
const clientSchema = z.object({
  name: z.string().trim().min(1).max(255),
  redirectUri: mcpOAuthRedirectUri,
})

export async function getMcpOAuthOrigin(_req: Request, res: Response) {
  const origin = await getSetting(mcpOAuthNamespace, 'origin')
  res.set('Cache-Control', 'no-store').json({ origin })
}

export async function getOwnMcpOAuthSettings(req: Request, res: Response) {
  const [origin, clients] = await Promise.all([
    getSetting(mcpOAuthNamespace, 'origin'),
    listMcpOAuthClients(req.user!.id),
  ])
  res.set('Cache-Control', 'no-store').json({ origin, clients })
}

export async function updateMcpOAuthOrigin(req: Request, res: Response) {
  const { origin } = originSchema.parse(req.body)
  if (!hasMcpOAuthSessionSecret()) {
    res
      .status(400)
      .json({ error: 'MCP OAuth requires a Plank JWT secret of at least 32 characters.' })
    return
  }
  await setSettings(mcpOAuthNamespace, { origin })
  res.json({ origin })
}

export async function createMcpOAuthClient(req: Request, res: Response) {
  const { name, redirectUri } = clientSchema.parse(req.body)
  const clientId = `plank_${randomBytes(16).toString('hex')}`
  const clientSecret = randomBytes(32).toString('hex')
  await pool.query(
    `INSERT INTO plank_mcp_oauth_clients (client_id, name, client_secret_hash, redirect_uri, owner_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [clientId, name, hashMcpCredential(clientSecret), redirectUri, req.user!.id],
  )
  res
    .set('Cache-Control', 'no-store')
    .status(201)
    .json({ clientId, clientSecret, name, redirectUri })
}

export async function updateMcpOAuthClient(req: Request, res: Response) {
  const { name, redirectUri } = clientSchema.parse(req.body)
  const { id } = req.params
  const { rowCount } = await pool.query(
    `WITH updated AS (
       UPDATE plank_mcp_oauth_clients
       SET name = $2, redirect_uri = $3
       WHERE client_id = $1 AND owner_id = $4 RETURNING client_id
     ), revoked AS (
       DELETE FROM plank_mcp_oauth_grants g USING updated
       WHERE g.client_id = updated.client_id AND g.redirect_uri <> $3
     )
     SELECT client_id FROM updated`,
    [id, name, redirectUri, req.user!.id],
  )
  if (!rowCount) {
    res.status(404).json({ error: 'OAuth client not found' })
    return
  }
  res.status(204).end()
}

export async function deleteMcpOAuthClient(req: Request, res: Response) {
  const { rowCount } = await pool.query(
    'DELETE FROM plank_mcp_oauth_clients WHERE client_id = $1 AND owner_id = $2',
    [req.params.id, req.user!.id],
  )
  if (!rowCount) {
    res.status(404).json({ error: 'OAuth client not found' })
    return
  }
  res.status(204).end()
}
