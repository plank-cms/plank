import { pool } from '@plank-cms/db'

export type McpIdentity = {
  id: string
  roleId: string
  permissions: string[]
}

export async function resolveMcpIdentity(tokenId: string): Promise<McpIdentity | null> {
  const { rows } = await pool.query<McpIdentity>(
    `SELECT u.id, u.role_id AS "roleId", r.permissions
     FROM plank_api_tokens t
     JOIN plank_users u ON u.id = t.created_by
     JOIN plank_roles r ON r.id = u.role_id
     WHERE t.id = $1 AND t.access_type = 'mcp-server' AND u.enabled = TRUE`,
    [tokenId],
  )
  return rows[0] ?? null
}

export function hasMcpPermission(identity: McpIdentity, permission: string) {
  return identity.permissions.includes('*') || identity.permissions.includes(permission)
}
