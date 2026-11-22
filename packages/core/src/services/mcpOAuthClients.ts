import { createHash } from 'node:crypto'
import { pool } from '@plank-cms/db'
import { getSetting } from '../lib/settings.js'
import {
  mcpOAuthNamespace,
  readLegacyMcpOAuthConfig,
  type McpOAuthClient,
} from '../lib/mcpOAuth.js'

const clientColumns = 'client_id AS "clientId", name, redirect_uri AS "redirectUri"'

export function hashMcpCredential(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export async function findMcpOAuthClient(clientId: string, secret?: string) {
  const { rows } = await pool.query<McpOAuthClient>(
    `SELECT ${clientColumns} FROM plank_mcp_oauth_clients
     WHERE client_id = $1${secret === undefined ? '' : ' AND client_secret_hash = $2'}`,
    secret === undefined ? [clientId] : [clientId, hashMcpCredential(secret)],
  )
  return rows[0] ?? null
}

export async function listMcpOAuthClients() {
  const { rows } = await pool.query<McpOAuthClient>(
    `SELECT ${clientColumns} FROM plank_mcp_oauth_clients ORDER BY name, client_id`,
  )
  return rows
}

export async function importLegacyMcpOAuthConfig() {
  if ((await getSetting(mcpOAuthNamespace, 'origin')) !== null) return
  const legacy = readLegacyMcpOAuthConfig()
  if (!legacy) return

  const clients = [...legacy.clients.values()].map(({ clientId, clientSecret, redirectUri }) => ({
    client_id: clientId,
    client_secret_hash: hashMcpCredential(clientSecret),
    redirect_uri: redirectUri,
  }))
  await pool.query(
    `WITH imported AS (
       INSERT INTO plank_settings (namespace, key, value) VALUES ($1, 'origin', $2)
       ON CONFLICT DO NOTHING RETURNING value
     )
     INSERT INTO plank_mcp_oauth_clients (client_id, name, client_secret_hash, redirect_uri)
     SELECT client_id, client_id, client_secret_hash, redirect_uri
     FROM imported, jsonb_to_recordset($3::jsonb)
       AS clients(client_id text, client_secret_hash text, redirect_uri text)
     ON CONFLICT DO NOTHING`,
    [mcpOAuthNamespace, legacy.issuer, JSON.stringify(clients)],
  )
}
