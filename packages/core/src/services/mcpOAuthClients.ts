import { createHash } from 'node:crypto'
import { pool } from '@plank-cms/db'
import { mcpOAuthNamespace, mcpOAuthOrigin, type McpOAuthClient } from '../lib/mcpOAuth.js'

const clientColumns = 'client_id AS "clientId", name, redirect_uri AS "redirectUri"'

export function hashMcpCredential(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export async function findMcpOAuthClient(clientId: string, secret?: string) {
  const { rows } = await pool.query<McpOAuthClient>(
    `SELECT ${clientColumns}, owner_id AS "ownerId" FROM plank_mcp_oauth_clients
     WHERE client_id = $1 AND owner_id IS NOT NULL${secret === undefined ? '' : ' AND client_secret_hash = $2'}`,
    secret === undefined ? [clientId] : [clientId, hashMcpCredential(secret)],
  )
  return rows[0] ?? null
}

export async function listMcpOAuthClients(ownerId: string) {
  const { rows } = await pool.query<Omit<McpOAuthClient, 'ownerId'>>(
    `SELECT ${clientColumns} FROM plank_mcp_oauth_clients
     WHERE owner_id = $1 ORDER BY name, client_id`,
    [ownerId],
  )
  return rows
}

export async function importLegacyMcpOAuthOrigin() {
  const origin = mcpOAuthOrigin.safeParse(process.env.PLANK_MCP_OAUTH_ORIGIN)
  if (!origin.success) return

  await pool.query(
    `INSERT INTO plank_settings (namespace, key, value) VALUES ($1, 'origin', $2)
     ON CONFLICT (namespace, key) DO NOTHING`,
    [mcpOAuthNamespace, origin.data],
  )
}
