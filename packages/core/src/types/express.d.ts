declare global {
  namespace Express {
    type ApiTokenAccessType = 'read-only' | 'full-access' | 'mcp-server'

    interface Request {
      user?: { id: string; roleId: string }
      appModes?: { editorial: boolean }
      apiToken?: { id: string; accessType: ApiTokenAccessType }
    }
  }
}

export {}
