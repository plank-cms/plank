import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { test } from 'node:test'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { pool } from '@plank-cms/db'
import express from 'express'
import jwt from 'jsonwebtoken'
import { errorHandler } from '../middlewares/errorHandler.js'
import adminRouter from './admin.js'
import mcpRouter from './mcp.js'
import oauthRouter from './mcpOAuth.js'

const issuer = 'https://plank.example.com'
const resource = `${issuer}/mcp`
const redirect = 'https://chatgpt.com/connector_platform_oauth_redirect'
const claudeRedirect = 'https://claude.ai/api/mcp/auth_callback'
type ClientRow = { clientId: string; name: string; redirectUri: string }
type CreatedClient = ClientRow & { clientSecret: string }
const jwtSecret = 'test-session-secret-with-at-least-32-characters'
const user = { sub: 'user', sv: 1, roleId: 'role' }

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

test('OAuth discovers Plank MCP, requires a completed login and PKCE, and exchanges and revokes tokens', async (t) => {
  const previousSecret = process.env.PLANK_JWT_SECRET
  process.env.PLANK_JWT_SECRET = jwtSecret
  t.after(() => {
    if (previousSecret === undefined) delete process.env.PLANK_JWT_SECRET
    else process.env.PLANK_JWT_SECRET = previousSecret
  })

  const grants = new Map<
    string,
    {
      redirectUri: unknown
      codeHash: unknown
      challenge: unknown
      accessHash?: unknown
      refreshHash?: unknown
    }
  >()
  const clients = new Map<string, { client: ClientRow; secretHash: unknown }>()
  let publicOrigin: unknown
  let permissions: string[] = []
  const adminPermissions = ['settings:api-tokens:read']
  const query = async (sql: string, values: unknown[] = []) => {
    if (sql.includes('FROM plank_settings')) {
      return { rows: values[0] === 'mcp-oauth' && publicOrigin ? [{ value: publicOrigin }] : [] }
    }
    if (sql.includes('INSERT INTO plank_settings')) {
      assert.deepEqual(values.slice(0, 2), ['mcp-oauth', 'origin'])
      publicOrigin = values[2]
      return { rows: [] }
    }
    if (sql.includes('SELECT permissions FROM plank_roles')) {
      return { rows: [{ permissions: adminPermissions }] }
    }
    if (sql.includes('INSERT INTO plank_mcp_oauth_clients')) {
      const [id, name, secretHash, redirectUri] = values.map(String)
      clients.set(id, { client: { clientId: id, name, redirectUri }, secretHash })
      return { rows: [], rowCount: 1 }
    }
    if (sql.startsWith('DELETE FROM plank_mcp_oauth_clients')) {
      const id = String(values[0])
      grants.delete(id)
      return { rows: [], rowCount: clients.delete(id) ? 1 : 0 }
    }
    if (sql.includes('UPDATE plank_mcp_oauth_clients')) {
      const [id, name, redirectUri] = values.map(String)
      const result = clients.get(id)
      if (!result) return { rows: [], rowCount: 0 }
      if (result.client.redirectUri !== redirectUri) grants.delete(id)
      Object.assign(result.client, { name, redirectUri })
      return { rows: [{ client_id: id }], rowCount: 1 }
    }
    if (sql.startsWith('SELECT') && sql.includes('FROM plank_mcp_oauth_clients')) {
      if (!sql.includes('WHERE')) return { rows: [...clients.values()].map(({ client }) => client) }
      const result = clients.get(String(values[0]))
      return {
        rows:
          result && (values.length === 1 || values[1] === result.secretHash) ? [result.client] : [],
      }
    }
    if (sql.includes('SELECT session_version, enabled')) {
      assert.deepEqual(values, ['user'])
      return { rows: [{ enabled: true, session_version: 1 }] }
    }
    if (sql.includes('INSERT INTO plank_mcp_oauth_grants')) {
      const [codeHash, challenge, id, redirectUri] = values
      assert.equal(clients.get(String(id))?.client.redirectUri, redirectUri)
      assert.deepEqual(values.slice(4), [resource, 'user', 1])
      grants.set(String(id), { redirectUri, codeHash, challenge })
      return { rows: [], rowCount: 1 }
    }
    if (sql.includes('UPDATE plank_mcp_oauth_grants')) {
      const [accessHash, refreshHash, , id, audience, redirectUri, proof, verifier] = values
      assert.equal(audience, resource)
      const grant = grants.get(String(id))
      if (!grant || grant.redirectUri !== redirectUri) return { rows: [] }
      const matches = sql.includes('g.code_hash =')
        ? proof === grant.codeHash && verifier === grant.challenge
        : proof === grant.refreshHash
      if (!matches) return { rows: [] }
      Object.assign(grant, { accessHash, refreshHash, challenge: undefined })
      return { rows: [{ expires_in: 3600 }] }
    }
    if (sql.includes('WHERE g.access_hash =')) {
      assert.deepEqual(values.slice(1), [resource])
      const rows = [...grants]
        .filter(
          ([id, grant]) =>
            values[0] === grant.accessHash &&
            clients.get(id)?.client.redirectUri === grant.redirectUri,
        )
        .map(([clientId, grant]) => ({
          id: 'user',
          roleId: 'role',
          permissions,
          clientId,
          redirectUri: grant.redirectUri,
        }))
      return { rows }
    }
    if (sql.includes('WHERE client_id =')) {
      const [id, audience, redirectUri, proof] = values
      assert.equal(audience, resource)
      const grant = grants.get(String(id))
      if (
        grant?.redirectUri === redirectUri &&
        grant &&
        (proof === grant.accessHash || proof === grant.refreshHash)
      ) {
        grants.delete(String(id))
      }
      return { rows: [] }
    }
    throw new Error(`Unhandled test query: ${sql}`)
  }
  t.mock.method(pool, 'query', query as unknown as typeof pool.query)

  const app = express()
  app.use(express.json())
  app.use(oauthRouter)
  app.use('/mcp', mcpRouter)
  app.use('/cms/admin', adminRouter)
  app.use(errorHandler)
  const server = app.listen(0, '127.0.0.1')
  t.after(() => {
    server.closeAllConnections()
    server.close()
  })
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}`

  const metadata = '/.well-known/oauth-protected-resource/mcp'
  assert.equal((await fetch(base + metadata)).status, 404)

  const admin = (path: string, method = 'GET', body?: object) =>
    fetch(base + '/cms/admin/mcp-oauth' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Cookie: `plank_session=${jwt.sign(user, jwtSecret)}`,
      },
      body: body && JSON.stringify(body),
    })
  assert.equal((await admin('/origin', 'PUT', { origin: issuer })).status, 403)
  adminPermissions.push('settings:api-tokens:write', 'settings:api-tokens:delete')
  assert.equal((await admin('/origin', 'PUT', { origin: issuer + '/mcp' })).status, 400)
  assert.equal((await admin('/origin', 'PUT', { origin: issuer + '/' })).status, 200)
  const create = (name: string, redirectUri: string) =>
    admin('/clients', 'POST', { name, redirectUri })
  assert.equal((await create('Invalid', 'http://example.com/callback')).status, 400)
  const primary = await create('ChatGPT', redirect)
  assert.equal(primary.status, 201)
  assert.equal(primary.headers.get('cache-control'), 'no-store')
  const { clientId, clientSecret } = (await primary.json()) as CreatedClient
  assert.match(clientSecret, /^[a-f0-9]{64}$/)
  assert.equal(clients.get(clientId)?.secretHash, hash(clientSecret))
  const claude = (await (await create('Claude', claudeRedirect)).json()) as CreatedClient
  assert.notEqual(clientId, claude.clientId)
  const settings = await (await admin('')).json()
  assert.equal(settings.origin, issuer)
  assert.equal(settings.clients.length, 2)
  assert.ok(settings.clients.every((entry: ClientRow) => !('clientSecret' in entry)))

  const anonymous = await fetch(base + '/mcp', { method: 'POST' })
  assert.equal(anonymous.status, 401)
  assert.equal(
    anonymous.headers.get('www-authenticate'),
    `Bearer resource_metadata="${issuer}${metadata}", scope="mcp"`,
  )
  assert.deepEqual(await (await fetch(base + metadata)).json(), {
    resource,
    authorization_servers: [issuer],
    scopes_supported: ['mcp'],
    bearer_methods_supported: ['header'],
  })
  const discovery = await (await fetch(base + '/.well-known/oauth-authorization-server')).json()
  assert.equal(discovery.issuer, issuer)
  assert.deepEqual(discovery.code_challenge_methods_supported, ['S256'])

  const verifier = 'v'.repeat(43)
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: 'code',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    state: 'client-state',
    resource,
  })
  const authorizePath = new URL(discovery.authorization_endpoint).pathname
  const authorize = `${base}${authorizePath}?${params}`
  const consent = (session: object, origin = issuer, url = authorize) =>
    fetch(url, {
      method: 'POST',
      redirect: 'manual',
      body: new URLSearchParams({ decision: 'authorize' }),
      headers: { Origin: origin, Cookie: `plank_session=${jwt.sign(session, jwtSecret)}` },
    })

  const page = await fetch(authorize)
  assert.match(await page.text(), /Authorize access to Plank/)
  assert.equal(page.headers.get('referrer-policy'), 'same-origin')
  assert.match(
    page.headers.get('content-security-policy') ?? '',
    /form-action 'self' https:\/\/chatgpt\.com/,
  )
  const wrongRedirect = new URL(authorize)
  wrongRedirect.searchParams.set('redirect_uri', claude.redirectUri)
  assert.equal((await fetch(wrongRedirect, { redirect: 'manual' })).status, 400)
  assert.equal((await consent(user, 'https://other.example.com')).status, 403)
  assert.equal((await consent({ ...user, twoFactor: true, jti: 'challenge' })).status, 401)
  assert.equal(grants.size, 0)

  const approval = await consent(user)
  assert.equal(approval.status, 303)
  const callback = new URL(approval.headers.get('location')!)
  const code = callback.searchParams.get('code')
  assert.ok(code)
  assert.equal(callback.searchParams.get('state'), 'client-state')
  assert.equal(callback.searchParams.get('iss'), issuer)
  assert.equal(grants.get(clientId)?.codeHash, hash(code))

  const token = (body: Record<string, string>) =>
    fetch(base + new URL(discovery.token_endpoint).pathname, {
      method: 'POST',
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        resource,
        ...body,
      }),
    })
  const exchange = {
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri: redirect,
  }
  const claudeCredentials = { client_id: claude.clientId, client_secret: claude.clientSecret }
  assert.deepEqual(
    await (
      await token({ ...exchange, ...claudeCredentials, redirect_uri: claude.redirectUri })
    ).json(),
    { error: 'invalid_grant' },
  )
  assert.deepEqual(await (await token({ ...exchange, resource: issuer })).json(), {
    error: 'invalid_target',
  })
  assert.deepEqual(await (await token({ ...exchange, code_verifier: 'x'.repeat(43) })).json(), {
    error: 'invalid_grant',
  })
  const first = await (await token(exchange)).json()
  assert.equal(first.token_type, 'Bearer')
  assert.equal(grants.get(clientId)?.accessHash, hash(first.access_token))
  assert.deepEqual(await (await token(exchange)).json(), { error: 'invalid_grant' })
  const refresh = { grant_type: 'refresh_token', refresh_token: first.refresh_token }
  assert.deepEqual(await (await token({ ...refresh, ...claudeCredentials })).json(), {
    error: 'invalid_grant',
  })
  const next = await (await token(refresh)).json()
  assert.notEqual(next.refresh_token, first.refresh_token)
  assert.deepEqual(await (await token(refresh)).json(), { error: 'invalid_grant' })

  const mcp = (value: string) =>
    fetch(base + '/mcp', { headers: { Authorization: `Bearer ${value}` } })
  assert.equal((await mcp(first.access_token)).status, 401)
  assert.equal((await mcp(next.access_token)).status, 405)

  const claudeAuthorize = new URL(authorize)
  claudeAuthorize.searchParams.set('client_id', claude.clientId)
  claudeAuthorize.searchParams.set('redirect_uri', claude.redirectUri)
  const claudePage = await fetch(claudeAuthorize)
  assert.match(
    claudePage.headers.get('content-security-policy') ?? '',
    /form-action 'self' https:\/\/claude\.ai/,
  )
  const claudeApproval = await consent(user, issuer, claudeAuthorize.href)
  assert.equal(claudeApproval.status, 303)
  const claudeCallback = new URL(claudeApproval.headers.get('location')!)
  assert.equal(claudeCallback.origin + claudeCallback.pathname, claude.redirectUri)
  const claudeCode = claudeCallback.searchParams.get('code')
  assert.ok(claudeCode)
  const claudeTokens = await (
    await token({
      ...exchange,
      ...claudeCredentials,
      code: claudeCode,
      redirect_uri: claude.redirectUri,
    })
  ).json()
  assert.equal(claudeTokens.token_type, 'Bearer')
  assert.equal((await mcp(claudeTokens.access_token)).status, 405)

  const client = new Client({ name: 'plank-oauth-test', version: '1.0.0' })
  t.after(() => client.close())
  await client.connect(
    new StreamableHTTPClientTransport(new URL(base + '/mcp'), {
      requestInit: { headers: { Authorization: `Bearer ${next.access_token}` } },
    }),
  )
  assert.deepEqual(
    (await client.listTools()).tools.map(({ name }) => name),
    ['get_locales'],
  )
  permissions = ['entries:read']
  assert.ok((await client.listTools()).tools.some(({ name }) => name === 'list_entries'))

  const revoked = await fetch(base + new URL(discovery.revocation_endpoint).pathname, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({ token: next.refresh_token }),
  })
  assert.equal(revoked.status, 200)
  assert.match(
    (await mcp(next.access_token)).headers.get('www-authenticate') ?? '',
    /invalid_token/,
  )
  assert.equal((await mcp(claudeTokens.access_token)).status, 405)
  assert.equal(
    (
      await admin('/clients/' + claude.clientId, 'PUT', {
        name: 'Claude',
        redirectUri: 'https://claude.ai/new-callback',
      })
    ).status,
    204,
  )
  assert.equal((await mcp(claudeTokens.access_token)).status, 401)
  assert.equal((await admin('/clients/' + claude.clientId, 'DELETE')).status, 204)
  assert.equal((await (await admin('')).json()).clients.length, 1)
})
