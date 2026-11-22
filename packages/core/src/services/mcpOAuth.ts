import { createHash, randomBytes } from 'node:crypto'
import { pool } from '@plank-cms/db'
import {
  getMcpOAuthConfig,
  mcpOAuthAccessPrefix,
  mcpOAuthScope,
  type McpOAuthClient,
} from '../lib/mcpOAuth.js'
import type { McpIdentity } from './mcpAuth.js'
import { hashMcpCredential } from './mcpOAuthClients.js'

const accessLifetime = 3600

function randomToken() {
  return randomBytes(32).toString('base64url')
}

export async function createMcpOAuthCode(
  resource: string,
  client: McpOAuthClient,
  user: { id: string; sessionVersion: number },
  challenge: string,
) {
  const code = randomToken()
  const { rowCount } = await pool.query(
    `WITH expired AS (
       DELETE FROM plank_mcp_oauth_grants WHERE expires_at <= NOW()
     )
     INSERT INTO plank_mcp_oauth_grants
       (code_hash, code_challenge, client_id, redirect_uri, resource, user_id, session_version, expires_at)
     SELECT $1, $2, c.client_id, c.redirect_uri, $5, $6, $7, NOW() + INTERVAL '5 minutes'
     FROM plank_mcp_oauth_clients c
     WHERE c.client_id = $3 AND c.redirect_uri = $4`,
    [
      hashMcpCredential(code),
      challenge,
      client.clientId,
      client.redirectUri,
      resource,
      user.id,
      user.sessionVersion,
    ],
  )
  return rowCount ? code : null
}

export async function issueMcpOAuthTokens(
  resource: string,
  client: McpOAuthClient,
  grant: { code: string; verifier: string } | { refreshToken: string },
) {
  const accessToken = mcpOAuthAccessPrefix + randomToken()
  const refreshToken = randomToken()
  const isCode = 'code' in grant
  const { rows } = await pool.query<{ expires_in: number }>(
    `UPDATE plank_mcp_oauth_grants g
     SET access_hash = $1, refresh_hash = $2,
         access_expires = ${isCode ? "NOW() + $3 * INTERVAL '1 second'" : "LEAST(NOW() + $3 * INTERVAL '1 second', g.expires_at)"},
         code_challenge = NULL,
         expires_at = ${isCode ? "NOW() + INTERVAL '30 days'" : 'g.expires_at'}
     FROM plank_users u
     WHERE u.id = g.user_id AND u.enabled = TRUE AND u.session_version = g.session_version
       AND g.client_id = $4 AND g.resource = $5 AND g.redirect_uri = $6
       AND g.expires_at > NOW() AND ${
         isCode ? 'g.code_hash = $7 AND g.code_challenge = $8' : 'g.refresh_hash = $7'
       }
     RETURNING FLOOR(EXTRACT(EPOCH FROM (g.access_expires - NOW())))::INTEGER AS expires_in`,
    [
      hashMcpCredential(accessToken),
      hashMcpCredential(refreshToken),
      accessLifetime,
      client.clientId,
      resource,
      client.redirectUri,
      ...(isCode
        ? [
            hashMcpCredential(grant.code),
            createHash('sha256').update(grant.verifier).digest('base64url'),
          ]
        : [hashMcpCredential(grant.refreshToken)]),
    ],
  )
  if (!rows[0]) return null
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: rows[0].expires_in,
    scope: mcpOAuthScope,
  }
}

export async function resolveMcpOAuthIdentity(token: string): Promise<McpIdentity | null> {
  const config = await getMcpOAuthConfig()
  if (!config) return null
  const { rows } = await pool.query<McpIdentity>(
    `SELECT u.id, u.role_id AS "roleId", r.permissions
     FROM plank_mcp_oauth_grants g
     JOIN plank_users u ON u.id = g.user_id
     JOIN plank_roles r ON r.id = u.role_id
     JOIN plank_mcp_oauth_clients c ON c.client_id = g.client_id AND c.redirect_uri = g.redirect_uri
     WHERE g.access_hash = $1 AND g.resource = $2
       AND g.access_expires > NOW() AND g.expires_at > NOW()
       AND u.enabled = TRUE AND u.session_version = g.session_version`,
    [hashMcpCredential(token), config.resource],
  )
  return rows[0] ?? null
}

export async function revokeMcpOAuthGrant(resource: string, client: McpOAuthClient, token: string) {
  await pool.query(
    `DELETE FROM plank_mcp_oauth_grants
     WHERE client_id = $1 AND resource = $2 AND redirect_uri = $3
       AND (access_hash = $4 OR refresh_hash = $4)`,
    [client.clientId, resource, client.redirectUri, hashMcpCredential(token)],
  )
}
