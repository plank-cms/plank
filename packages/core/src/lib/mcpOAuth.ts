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

export type McpOAuthClient = {
  clientId: string
  name: string
  redirectUri: string
  ownerId: string
}

export type McpOAuthConfig = { issuer: string; resource: string; metadata: string }

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
