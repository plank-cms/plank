import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { test } from 'node:test'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { pool } from '@plank-cms/db'
import express from 'express'
import jwt from 'jsonwebtoken'
import mcpRouter from './mcp.js'
import oauthRouter from './mcpOAuth.js'

const issuer = 'https://plank.example.com'
const resource = `${issuer}/mcp`
const redirect = 'https://chatgpt.com/connector_platform_oauth_redirect'
const clientId = 'plank-chatgpt'
const clientSecret = 'test-client-secret-with-at-least-32-characters'
const claude = {
  clientId: 'plank-claude',
  clientSecret: 'test-claude-secret-with-at-least-32-characters',
  redirectUri: 'https://claude.ai/api/mcp/auth_callback',
}
const jwtSecret = 'test-session-secret-with-at-least-32-characters'
const user = { sub: 'user', sv: 1, roleId: 'role' }

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

test('OAuth discovers Plank MCP, requires a completed login and PKCE, and exchanges and revokes tokens', async (t) => {
  const env = {
    PLANK_MCP_OAUTH_ORIGIN: issuer,
    PLANK_MCP_OAUTH_CLIENT_ID: clientId,
    PLANK_MCP_OAUTH_CLIENT_SECRET: clientSecret,
    PLANK_MCP_OAUTH_REDIRECT_URI: redirect,
    PLANK_MCP_OAUTH_CLIENTS: JSON.stringify([claude]),
    PLANK_JWT_SECRET: jwtSecret,
  }
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key]
    process.env[key] = value
    t.after(() => {
      if (previous === undefined) delete process.env[key]
      else process.env[key] = previous
    })
  }

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
  const callbacks = new Map([
    [clientId, redirect],
    [claude.clientId, claude.redirectUri],
  ])
  let permissions: string[] = []
  const query = async (sql: string, values: unknown[]) => {
    if (sql.includes('SELECT session_version, enabled')) {
      assert.deepEqual(values, ['user'])
      return { rows: [{ enabled: true, session_version: 1 }] }
    }
    if (sql.includes('INSERT INTO plank_mcp_oauth_grants')) {
      const [codeHash, challenge, id, redirectUri] = values
      assert.equal(callbacks.get(String(id)), redirectUri)
      assert.deepEqual(values.slice(4), [resource, 'user', 1])
      grants.set(String(id), { redirectUri, codeHash, challenge })
      return { rows: [] }
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
        .filter(([, grant]) => values[0] === grant.accessHash)
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
  const server = app.listen(0, '127.0.0.1')
  t.after(() => {
    server.closeAllConnections()
    server.close()
  })
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}`

  const anonymous = await fetch(base + '/mcp', { method: 'POST' })
  assert.equal(anonymous.status, 401)
  const metadata = '/.well-known/oauth-protected-resource/mcp'
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
  delete process.env.PLANK_MCP_OAUTH_CLIENTS
  assert.equal((await mcp(claudeTokens.access_token)).status, 401)
})
