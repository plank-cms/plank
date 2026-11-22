import Handlebars from 'handlebars'
import express, { type Request, type Response, type IRouter } from 'express'
import { z } from 'zod'
import { getMcpOAuthConfig, mcpOAuthScope, type McpOAuthConfig } from '../lib/mcpOAuth.js'
import { authenticate } from '../middlewares/authenticate.js'
import { findMcpOAuthClient } from '../services/mcpOAuthClients.js'
import {
  createMcpOAuthCode,
  issueMcpOAuthTokens,
  revokeMcpOAuthGrant,
} from '../services/mcpOAuth.js'

const authorizePath = '/oauth/mcp/authorize'
const tokenPath = '/oauth/mcp/token'
const revokePath = '/oauth/mcp/revoke'
const router: IRouter = express.Router()

const redirectParams = z.object({
  client_id: z.string(),
  redirect_uri: z.string(),
  state: z.string().min(1).max(1024).optional(),
})

const authorizeParams = redirectParams.extend({
  response_type: z.literal('code'),
  code_challenge: z.string().regex(/^[a-zA-Z0-9_-]{43}$/),
  code_challenge_method: z.literal('S256'),
  scope: z.literal(mcpOAuthScope).optional(),
  resource: z.string().optional(),
})

const tokenParams = z.discriminatedUnion('grant_type', [
  z.object({
    grant_type: z.literal('authorization_code'),
    code: z.string().regex(/^[a-zA-Z0-9_-]{43}$/),
    code_verifier: z.string().regex(/^[a-zA-Z0-9._~-]{43,128}$/),
    redirect_uri: z.string(),
    resource: z.string().optional(),
  }),
  z.object({
    grant_type: z.literal('refresh_token'),
    refresh_token: z.string().regex(/^[a-zA-Z0-9_-]{43}$/),
    scope: z.literal(mcpOAuthScope).optional(),
    resource: z.string().optional(),
  }),
])

function oauthError(res: Response, error: string, status = 400) {
  res.status(status).json({ error })
}

function redirectToClient(
  res: Response,
  issuer: string,
  redirectUri: string,
  state: string | undefined,
  result: Record<string, string>,
) {
  const callback = new URL(redirectUri)
  for (const [key, value] of Object.entries(result)) callback.searchParams.set(key, value)
  if (state !== undefined) callback.searchParams.set('state', state)
  callback.searchParams.set('iss', issuer)
  res.redirect(303, callback.href)
}

async function readAuthorization(req: Request, res: Response, config: McpOAuthConfig) {
  const redirect = redirectParams.safeParse(req.query)
  const client = redirect.success ? await findMcpOAuthClient(redirect.data.client_id) : undefined
  if (!redirect.success || !client || redirect.data.redirect_uri !== client.redirectUri) {
    oauthError(res, 'invalid_request')
    return null
  }

  const result = authorizeParams.safeParse(req.query)
  const error =
    req.query.resource !== undefined && req.query.resource !== config.resource
      ? 'invalid_target'
      : req.query.scope !== undefined && req.query.scope !== mcpOAuthScope
        ? 'invalid_scope'
        : req.query.response_type !== 'code'
          ? 'unsupported_response_type'
          : result.success
            ? null
            : 'invalid_request'
  if (error)
    redirectToClient(res, config.issuer, client.redirectUri, redirect.data.state, { error })
  return !error && result.success ? { params: result.data, client } : null
}

async function verifyClient(req: Request) {
  const { client_id: bodyId, client_secret: bodySecret } = req.body ?? {}
  const header = req.get('authorization')
  let id = bodyId
  let secret = bodySecret
  if (header !== undefined) {
    const basic = /^Basic ([a-zA-Z0-9+/]+=*)$/i.exec(header)
    if (!basic || bodySecret !== undefined) return null
    const credentials = Buffer.from(basic[1], 'base64').toString('utf8')
    const separator = credentials.indexOf(':')
    if (separator < 0) return null
    const decode = (value: string) => decodeURIComponent(value.replaceAll('+', ' '))
    try {
      id = decode(credentials.slice(0, separator))
      secret = decode(credentials.slice(separator + 1))
    } catch {
      return null
    }
  }

  if (typeof id !== 'string' || typeof secret !== 'string') return null
  if (bodyId !== undefined && bodyId !== id) return null
  return findMcpOAuthClient(id, secret)
}

async function clientRequest(req: Request, res: Response) {
  if (!req.is('application/x-www-form-urlencoded')) {
    oauthError(res, 'invalid_request')
    return null
  }
  const client = await verifyClient(req)
  if (client) return client
  if (req.get('authorization')) res.set('WWW-Authenticate', 'Basic realm="Plank MCP"')
  oauthError(res, 'invalid_client', req.get('authorization') ? 401 : 400)
  return null
}

router.use(
  [
    '/.well-known/oauth-protected-resource',
    '/.well-known/oauth-authorization-server',
    '/oauth/mcp',
  ],
  async (_req, res, next) => {
    const config = await getMcpOAuthConfig()
    if (!config) {
      res.sendStatus(404)
      return
    }
    res.locals.mcpOAuthConfig = config
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
    next()
  },
)

router.get(
  ['/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-protected-resource'],
  (_req, res) => {
    const config = res.locals.mcpOAuthConfig as McpOAuthConfig
    res.json({
      resource: config.resource,
      authorization_servers: [config.issuer],
      scopes_supported: [mcpOAuthScope],
      bearer_methods_supported: ['header'],
    })
  },
)

router.get('/.well-known/oauth-authorization-server', (_req, res) => {
  const { issuer } = res.locals.mcpOAuthConfig as McpOAuthConfig
  const clientAuthMethods = ['client_secret_basic', 'client_secret_post']
  res.json({
    issuer,
    authorization_endpoint: issuer + authorizePath,
    token_endpoint: issuer + tokenPath,
    revocation_endpoint: issuer + revokePath,
    authorization_response_iss_parameter_supported: true,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: [mcpOAuthScope],
    token_endpoint_auth_methods_supported: clientAuthMethods,
    revocation_endpoint_auth_methods_supported: clientAuthMethods,
  })
})

router.get(authorizePath, async (req, res) => {
  const config = res.locals.mcpOAuthConfig as McpOAuthConfig
  const authorization = await readAuthorization(req, res, config)
  if (!authorization) return
  const { params, client } = authorization
  const query = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
  const action = `${authorizePath}?${query.toString().replaceAll('&', '&amp;')}`
  res.set('Referrer-Policy', 'same-origin')
  res.set('Cross-Origin-Opener-Policy', 'unsafe-none')
  res.set(
    'Content-Security-Policy',
    `default-src 'none'; form-action 'self' ${new URL(params.redirect_uri).origin}; frame-ancestors 'none'`,
  )
  res.type('html').send(`<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorize Plank MCP</title>
<main>
  <h1>Authorize access to Plank</h1>
  <p><strong>${Handlebars.escapeExpression(client.name)}</strong> is requesting access.</p>
  <p>This connection can read content and work on drafts according to your Plank role.</p>
  <p>If you need to sign in or switch accounts, <a href="/admin" target="_blank" rel="noopener noreferrer">open the Plank admin</a>, then return here.</p>
  <form method="post" action="${action}">
    <button name="decision" value="authorize">Authorize</button>
    <button name="decision" value="deny">Deny</button>
  </form>
</main>
</html>`)
})

const form = express.urlencoded({ extended: false, limit: '8kb' })

router.post(
  authorizePath,
  form,
  async (req, res, next) => {
    const config = res.locals.mcpOAuthConfig as McpOAuthConfig
    if (req.get('origin') !== config.issuer || req.get('authorization')) {
      oauthError(res, 'invalid_request', 403)
      return
    }
    const authorization = await readAuthorization(req, res, config)
    if (!authorization) return
    const { params } = authorization
    if (req.body?.decision === 'deny') {
      redirectToClient(res, config.issuer, params.redirect_uri, params.state, {
        error: 'access_denied',
      })
      return
    }
    if (req.body?.decision !== 'authorize') {
      oauthError(res, 'invalid_request')
      return
    }
    await authenticate(req, res, next)
  },
  async (req, res) => {
    const config = res.locals.mcpOAuthConfig as McpOAuthConfig
    const authorization = await readAuthorization(req, res, config)
    if (!authorization) return
    const { params, client } = authorization
    const { id, sessionVersion } = req.user!
    if (sessionVersion === undefined) {
      oauthError(res, 'access_denied', 403)
      return
    }
    const code = await createMcpOAuthCode(
      config.resource,
      client,
      { id, sessionVersion },
      params.code_challenge,
    )
    if (!code) return oauthError(res, 'invalid_request')
    redirectToClient(res, config.issuer, client.redirectUri, params.state, { code })
  },
)

router.post(tokenPath, form, async (req, res) => {
  const config = res.locals.mcpOAuthConfig as McpOAuthConfig
  const client = await clientRequest(req, res)
  if (!client) return
  if (!req.body?.grant_type) return oauthError(res, 'invalid_request')
  if (!['authorization_code', 'refresh_token'].includes(req.body.grant_type)) {
    return oauthError(res, 'unsupported_grant_type')
  }
  if (req.body.resource !== undefined && req.body.resource !== config.resource) {
    return oauthError(res, 'invalid_target')
  }
  if (req.body.scope !== undefined && req.body.scope !== mcpOAuthScope) {
    return oauthError(res, 'invalid_scope')
  }
  const result = tokenParams.safeParse(req.body)
  if (!result.success) return oauthError(res, 'invalid_request')
  const params = result.data
  if (params.grant_type === 'authorization_code' && params.redirect_uri !== client.redirectUri) {
    return oauthError(res, 'invalid_grant')
  }
  const tokens = await issueMcpOAuthTokens(
    config.resource,
    client,
    params.grant_type === 'authorization_code'
      ? { code: params.code, verifier: params.code_verifier }
      : { refreshToken: params.refresh_token },
  )
  if (!tokens) return oauthError(res, 'invalid_grant')
  res.set('Pragma', 'no-cache').json(tokens)
})

router.post(revokePath, form, async (req, res) => {
  const config = res.locals.mcpOAuthConfig as McpOAuthConfig
  const client = await clientRequest(req, res)
  if (!client) return
  const token = req.body?.token
  if (typeof token !== 'string' || !token) return oauthError(res, 'invalid_request')
  await revokeMcpOAuthGrant(config.resource, client, token)
  res.status(200).end()
})

export default router
