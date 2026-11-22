import { z } from 'zod'

export const mcpOAuthScope = 'mcp'
export const mcpOAuthAccessPrefix = 'plank_oauth_'

const clientSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(32),
  redirectUri: z.string().refine((value) => {
    if (!URL.canParse(value)) return false
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.href.includes('#')
  }),
})

export type McpOAuthClient = z.infer<typeof clientSchema>

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

export function getMcpOAuthConfig() {
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

  const origin = PLANK_MCP_OAUTH_ORIGIN ?? ''
  const issuer = URL.canParse(origin) ? new URL(origin) : null
  if (
    !issuer ||
    issuer.protocol !== 'https:' ||
    issuer.href !== `${issuer.origin}/` ||
    (process.env.PLANK_JWT_SECRET?.length ?? 0) < 32
  ) {
    throw new Error(
      'MCP OAuth requires an HTTPS origin and a Plank JWT secret of at least 32 characters.',
    )
  }

  return {
    issuer: issuer.origin,
    resource: `${issuer.origin}/mcp`,
    metadata: `${issuer.origin}/.well-known/oauth-protected-resource/mcp`,
    clients: readClients(PLANK_MCP_OAUTH_CLIENTS, [
      PLANK_MCP_OAUTH_CLIENT_ID,
      PLANK_MCP_OAUTH_CLIENT_SECRET,
      PLANK_MCP_OAUTH_REDIRECT_URI,
    ]),
  }
}

export type McpOAuthConfig = NonNullable<ReturnType<typeof getMcpOAuthConfig>>

export function mcpOAuthChallenge(invalidToken: boolean) {
  const config = getMcpOAuthConfig()
  if (!config) return null
  const challenge = `Bearer resource_metadata="${config.metadata}", scope="${mcpOAuthScope}"`
  return invalidToken ? `${challenge}, error="invalid_token"` : challenge
}
