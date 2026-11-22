declare global {
  namespace Express {
    type ApiTokenAccessType = 'read-only' | 'full-access' | 'mcp-server'

    interface Request {
      user?: { id: string; roleId: string; sessionVersion?: number }
      appModes?: { editorial: boolean }
      apiToken?: { id: string; accessType: ApiTokenAccessType }
      resolveMcpIdentity?: () => Promise<import('../services/mcpAuth.js').McpIdentity | null>
    }
  }
}

export {}
