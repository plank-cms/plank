import { z } from 'zod'
import { getSetting } from './settings.js'

export const mcpOAuthScope = 'mcp'
export const mcpOAuthAccessPrefix = 'plank_oauth_'

export const mcpOAuthNamespace = 'mcp-oauth'

function isHttpsUrl(url: URL) {
  return url.protocol === 'https:' && !/[\s"'<>;,]/.test(url.origin)
}

export function hasMcpOAuthSessionSecret() {
  return (process.env.PLANK_JWT_SECRET?.length ?? 0) >= 32
}

export const mcpOAuthRedirectUri = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!URL.canParse(value)) return false
    const url = new URL(value)
    return isHttpsUrl(url) && !url.username && !url.password && !url.href.includes('#')
  }, 'Enter a valid HTTPS redirect URL without a fragment.')

export const mcpOAuthOrigin = z
  .string()
  .trim()
  .refine((value) => {
    if (!URL.canParse(value)) return false
    const url = new URL(value)
    return isHttpsUrl(url) && url.href === `${url.origin}/`
  }, 'Enter a public HTTPS origin without a path.')
  .transform((value) => new URL(value).origin)

const clientSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(32),
  redirectUri: mcpOAuthRedirectUri,
})

export type McpOAuthClient = {
  clientId: string
  name: string
  redirectUri: string
}

export type McpOAuthConfig = { issuer: string; resource: string; metadata: string }

function readClients(value: string | undefined, legacy: unknown[]) {
  let parsed: unknown = []
  if (value !== undefined) {
    try {
      parsed = JSON.parse(value)
    } catch {
      throw new Error('PLANK_MCP_OAUTH_CLIENTS must be a JSON array.')
    }
  }
  const result = z.array(clientSchema).safeParse(parsed)
  if (!result.success) throw new Error('PLANK_MCP_OAUTH_CLIENTS contains an invalid client.')

  const clients = result.data
  if (legacy.some(Boolean)) {
    const [clientId, clientSecret, redirectUri] = legacy
    const client = clientSchema.safeParse({ clientId, clientSecret, redirectUri })
    if (!client.success) throw new Error('The single-client MCP OAuth configuration is invalid.')
    clients.push(client.data)
  }

  const byId = new Map(clients.map((client) => [client.clientId, client]))
  if (byId.size === 0 || byId.size !== clients.length) {
    throw new Error('MCP OAuth requires at least one client and unique client IDs.')
  }
  return byId
}

export function readLegacyMcpOAuthConfig() {
  const {
    PLANK_MCP_OAUTH_ORIGIN,
    PLANK_MCP_OAUTH_CLIENTS,
    PLANK_MCP_OAUTH_CLIENT_ID,
    PLANK_MCP_OAUTH_CLIENT_SECRET,
    PLANK_MCP_OAUTH_REDIRECT_URI,
  } = process.env
  if (
    !PLANK_MCP_OAUTH_ORIGIN &&
    PLANK_MCP_OAUTH_CLIENTS === undefined &&
    !PLANK_MCP_OAUTH_CLIENT_ID &&
    !PLANK_MCP_OAUTH_CLIENT_SECRET &&
    !PLANK_MCP_OAUTH_REDIRECT_URI
  )
    return null

  const issuer = mcpOAuthOrigin.safeParse(PLANK_MCP_OAUTH_ORIGIN)
  if (!issuer.success || !hasMcpOAuthSessionSecret()) {
    throw new Error(
      'MCP OAuth requires an HTTPS origin and a Plank JWT secret of at least 32 characters.',
    )
  }

  return {
    issuer: issuer.data,
    clients: readClients(PLANK_MCP_OAUTH_CLIENTS, [
      PLANK_MCP_OAUTH_CLIENT_ID,
      PLANK_MCP_OAUTH_CLIENT_SECRET,
      PLANK_MCP_OAUTH_REDIRECT_URI,
    ]),
  }
}

export async function getMcpOAuthConfig(): Promise<McpOAuthConfig | null> {
  if (!hasMcpOAuthSessionSecret()) return null
  const issuer = await getSetting(mcpOAuthNamespace, 'origin')
  if (!issuer) return null
  return {
    issuer,
    resource: `${issuer}/mcp`,
    metadata: `${issuer}/.well-known/oauth-protected-resource/mcp`,
  }
}

export async function mcpOAuthChallenge(invalidToken: boolean) {
  const config = await getMcpOAuthConfig()
  if (!config) return null
  const challenge = `Bearer resource_metadata="${config.metadata}", scope="${mcpOAuthScope}"`
  return invalidToken ? `${challenge}, error="invalid_token"` : challenge
}
