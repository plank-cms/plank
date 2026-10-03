import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { test, mock } from 'node:test'
import express from 'express'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { pool } from '@plank-cms/db'
import type { FieldDefinition } from '@plank-cms/schema'
import router from '../routes/mcp.js'
import { errorHandler } from '../middlewares/errorHandler.js'
import { mcpError } from './mcp.js'
import { getPublicEntry } from './public.js'
import { createEntry, updateEntry } from './entries.js'

type Row = Record<string, unknown>

const fields: FieldDefinition[] = [
  { name: 'title', type: 'string', required: true },
  { name: 'body', type: 'richtext' },
  { name: 'items', type: 'array', arrayFields: [{ name: 'label', type: 'string' }] },
]
const typeRow = {
  id: 'ct',
  name: 'Posts',
  slug: 'posts',
  kind: 'collection',
  table_name: 'posts',
  fields,
  preview_enabled: true,
  updated_at: new Date(),
}

function result(rows: Row[]) {
  return { rows: structuredClone(rows), rowCount: rows.length }
}

function payload(response: Awaited<ReturnType<Client['callTool']>>) {
  assert.ok('structuredContent' in response)
  return response.structuredContent as Row
}

function errorCode(response: Awaited<ReturnType<Client['callTool']>>) {
  assert.equal(response.isError, true)
  return (payload(response).error as Row).code
}

test('official HTTP client discovers resources and safely creates and edits working entries', async (t) => {
  let enabled = true
  let validToken = true
  let tokenType = 'mcp-server'
  let identityReads = 0
  let denyOnCall = false
  let role = 'admin'
  let permissions = ['*']
  let rows: Row[] = []
  let backup: Row[] = []
  let types = [typeRow]
  let referenced = false
  let relationStatus = 'draft'
  let failRelation = false
  const queries: string[] = []
  const globalQueries: Array<{ sql: string; values: unknown[] }> = []
  const events: Row[] = []
  const token = 'plank_test'
  const hash = createHash('sha256').update(token).digest('hex')
  const fetchOriginal = globalThis.fetch
  mock.method(
    globalThis,
    'fetch',
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (String(input).startsWith('https://hooks.test/')) {
        assert.equal(queries.at(-1), 'COMMIT')
        events.push(JSON.parse(String(init?.body)))
        return new Response('{}')
      }
      return fetchOriginal(input, init)
    },
  )
  async function query(sql: string, values: unknown[] = []) {
    const compact = sql.replace(/\s+/g, ' ').trim()
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(compact) || compact.startsWith('LOCK TABLE')) {
      queries.push(compact)
      if (compact === 'BEGIN') backup = structuredClone(rows)
      if (compact === 'ROLLBACK') rows = backup
      return result([])
    }
    if (sql.includes('SELECT id, access_type FROM plank_api_tokens')) {
      identityReads = 0
      return result(
        validToken && values[0] === hash ? [{ id: 'token', access_type: tokenType }] : [],
      )
    }
    if (sql.includes('JOIN plank_roles r')) {
      identityReads += 1
      return result(
        validToken && enabled
          ? [
              {
                id: 'user',
                roleId: 'role',
                permissions: denyOnCall && identityReads >= 3 ? ['entries:read'] : permissions,
              },
            ]
          : [],
      )
    }
    if (sql.includes('FROM plank_roles')) return result([{ name: role }])
    if (sql.includes('FROM plank_content_types'))
      return result(
        sql.includes('WHERE slug') ? types.filter((ct) => ct.slug === values[0]) : types,
      )
    if (sql.includes('FROM plank_settings')) {
      if (values[0] === 'preview')
        return result([
          { key: 'enabled', value: 'true' },
          { key: 'sync_url', value: 'https://hooks.test/preview' },
        ])
      if (sql.includes('AND key'))
        return result(values[1] === 'editorial_mode' ? [{ value: 'true' }] : [])
      return result([
        { key: 'locales', value: '["en","es"]' },
        { key: 'default_locale', value: 'en' },
      ])
    }
    if (sql.includes('FROM plank_webhooks'))
      return result([
        { url: 'https://hooks.test/events', events: ['entry.created', 'entry.updated'] },
      ])
    if (sql.startsWith('SELECT 1 FROM')) return result(referenced ? [{ found: 1 }] : [])
    if (sql.includes('WHERE id = ANY')) return result([{ id: 'target', status: relationStatus }])
    if (sql.startsWith('DELETE FROM "_rel_')) return result([])
    if (sql.startsWith('INSERT INTO "_rel_')) {
      if (failRelation) throw Object.assign(new Error('foreign key secret'), { code: '23503' })
      return result([])
    }
    if (sql.includes('AS related_id')) return result([])
    if (sql.startsWith('INSERT INTO "posts"')) {
      const columns = sql
        .match(/\(([^)]+)\)/)![1]
        .split(', ')
        .map((column) => column.replaceAll('"', ''))
      const row: Row = { status: 'draft' }
      columns.forEach((column, i) => {
        row[column] = ['localized', 'items'].includes(column)
          ? JSON.parse(String(values[i]))
          : values[i]
      })
      rows.push(row)
      return result([row])
    }
    if (sql.startsWith('UPDATE "posts"')) {
      const row = rows.find((entry) => entry.id === values.at(-1))
      if (!row) return result([])
      for (const match of sql.matchAll(/"?(\w+)"? = \$(\d+)/g)) {
        const value = values[Number(match[2]) - 1]
        row[match[1]] = ['localized', 'items'].includes(match[1])
          ? JSON.parse(String(value))
          : value
      }
      return result([row])
    }
    if (sql.includes(') entries')) {
      globalQueries.push({ sql, values })
      if (sql.includes('COUNT(*)')) return result([{ count: '2' }])
      return result([
        {
          id: 'project',
          title: 'Project draft',
          content_type: 'projects',
          content_type_name: 'Projects',
          status: 'draft',
          author_id: 'user',
          author: 'Test User',
          updated_at: new Date(),
        },
      ])
    }
    if (sql.includes('COUNT(*)')) return result([{ count: String(rows.length) }])
    if (sql.includes('SELECT DISTINCT')) return result([{ status: 'draft' }])
    if (sql.includes('FROM "posts"') || sql.includes('FROM posts')) {
      if (sql.includes('WHERE') && (sql.includes('id = $1') || sql.includes('e.id = $1')))
        return result(rows.filter((entry) => entry.id === values[0]))
      if (sql.includes('ILIKE'))
        return result(
          rows.filter((row) =>
            String(row.title).includes(String(values.at(-1)).replaceAll('%', '')),
          ),
        )
      return result(rows)
    }
    throw new Error(`Unhandled test query: ${sql}`)
  }
  mock.method(pool, 'query', query as unknown as typeof pool.query)
  const connection = { query, release() {} }
  mock.method(pool, 'connect', (async () => connection) as unknown as typeof pool.connect)
  t.after(() => mock.restoreAll())
  const app = express()
  app.use(express.json())
  app.use('/mcp', router)
  app.get('/public/:slug/:id', getPublicEntry)
  app.use('/rest', (req, _res, next) => {
    req.user = { id: 'user', roleId: 'role' }
    next()
  })
  app.post('/rest/:slug/entries', createEntry)
  app.put('/rest/:slug/:id', updateEntry)
  app.use(errorHandler)
  const http = app.listen(0, '127.0.0.1')
  await once(http, 'listening')
  const address = http.address()
  assert.ok(address && typeof address !== 'string')
  const url = new URL(`http://127.0.0.1:${address.port}/mcp`)
  t.after(() => {
    http.closeAllConnections()
    http.close()
  })
  const client = new Client({ name: 'plank-test', version: '1.0.0' })
  t.after(() => client.close())
  await client.connect(
    new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  )
  assert.equal(client.getServerVersion()?.name, 'plank-cms')
  assert.equal((await client.listTools()).tools.length, 8)
  assert.equal((await client.listResources()).resources.length, 3)
  assert.equal(
    (await client.listResourceTemplates()).resourceTemplates[0].uriTemplate,
    'plank://content-types/{slug}/schema',
  )
  const locales = (await client.readResource({ uri: 'plank://locales' })).contents[0]
  const schema = (await client.readResource({ uri: 'plank://content-types/posts/schema' }))
    .contents[0]
  assert.ok('text' in locales && 'text' in schema)
  assert.equal(JSON.parse(locales.text).defaultLocale, 'en')
  assert.equal(JSON.parse(schema.text).slug, 'posts')
  const created = payload(
    await client.callTool({
      name: 'create_entry',
      arguments: {
        slug: 'posts',
        data: {
          title: 'Release',
          body: '{"type":"doc","content":[]}',
          items: [{ label: 'Old' }],
          localized: { es: { title: 'Comunicado', body: 'Texto' } },
        },
      },
    }),
  ).entry as Row
  assert.equal(created.status, 'draft')
  assert.equal(created.created_by, 'user')
  const updated = payload(
    await client.callTool({
      name: 'update_entry',
      arguments: {
        slug: 'posts',
        id: created.id,
        data: { localized: { es: { title: 'Nuevo' } }, items: [{ label: 'New' }] },
      },
    }),
  ).entry as Row
  assert.equal(updated.title, 'Release')
  assert.deepEqual((updated.localized as Row).es, { title: 'Nuevo', body: 'Texto' })
  assert.deepEqual(updated.items, [{ label: 'New' }])
  const listed = payload(
    await client.callTool({
      name: 'list_entries',
      arguments: { slug: 'posts', search: 'Release' },
    }),
  )
  assert.equal(listed.total, 1)
  assert.equal(listed.limit, 20)
  assert.equal((listed.data as Row[]).length, 1)
  types.push({ ...typeRow, slug: 'projects', name: 'Projects', table_name: 'projects' })
  const global = payload(
    await client.callTool({
      name: 'search_entries',
      arguments: { status: 'draft', author: 'me', search: 'Project', limit: 1, page: 2 },
    }),
  )
  assert.equal(global.total, 2)
  assert.equal(global.hasMore, false)
  assert.equal(global.page, 2)
  assert.equal((global.data as Row[])[0].content_type, 'projects')
  assert.equal((global.contentTypes as Row[]).length, 2)
  for (const { sql, values } of globalQueries) {
    assert.match(sql, /UNION ALL/)
    assert.match(sql, /FROM "posts" e/)
    assert.match(sql, /FROM "projects" e/)
    assert.match(sql, /e.status = \$1/)
    assert.match(sql, /e.created_by = \$2/)
    assert.deepEqual(values.slice(0, 3), ['draft', 'user', '%Project%'])
  }
  assert.deepEqual(globalQueries[0].values.slice(-2), [1, 1])
  types.pop()
  assert.ok(queries.includes('COMMIT'))
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.deepEqual(
    events.map((event) => event.event),
    ['entry.created', 'preview.sync', 'entry.updated', 'preview.sync'],
  )
  const callUpdate = (data: Row) =>
    client.callTool({ name: 'update_entry', arguments: { slug: 'posts', id: created.id, data } })
  assert.equal(errorCode(await callUpdate({ status: 'published' })), 'INVALID_FIELD')
  assert.equal(errorCode(await callUpdate({ title: null })), 'VALIDATION_ERROR')
  rows[0].status = 'published'
  rows[0].published_data = { title: 'Public', localized: { es: { title: 'Público' } } }
  const publicSnapshot = structuredClone(rows[0].published_data)
  const publicUrl = new URL(`/public/posts/${created.id}`, url)
  const publicBefore = await (await fetch(publicUrl)).json()
  await callUpdate({ title: 'Working' })
  assert.deepEqual(await (await fetch(publicUrl)).json(), publicBefore)
  assert.equal(publicBefore.title, 'Public')
  assert.deepEqual(rows[0].published_data, publicSnapshot)
  assert.equal(rows[0].status, 'published')
  assert.equal(events.at(-1)?.status, 'preview')
  rows[0].status = 'scheduled'
  assert.equal(errorCode(await callUpdate({ title: 'Blocked' })), 'SCHEDULED_ENTRY')
  rows[0].status = 'published'
  delete rows[0].published_data
  assert.equal(errorCode(await callUpdate({ title: 'Blocked' })), 'UNSAFE_SNAPSHOT')
  rows[0].status = 'draft'
  role = 'contributor'
  rows[0].created_by = 'other'
  assert.equal(errorCode(await callUpdate({ title: 'Blocked' })), 'FORBIDDEN')
  rows[0].created_by = 'user'
  rows[0].status = 'in_review'
  assert.equal(errorCode(await callUpdate({ title: 'Blocked' })), 'FORBIDDEN')
  role = 'admin'
  rows[0].status = 'draft'
  types = [{ ...typeRow, kind: 'single' }]
  const restUpsert = await fetch(new URL('/rest/posts/entries', url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'REST single update' }),
  })
  assert.equal(restUpsert.status, 200)
  assert.equal((await restUpsert.json()).id, created.id)
  assert.equal(
    (
      await fetch(new URL(`/rest/posts/${created.id}`, url), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'Missing required title' }),
      })
    ).status,
    400,
  )
  assert.equal(
    errorCode(
      await client.callTool({
        name: 'create_entry',
        arguments: { slug: 'posts', data: { title: 'Duplicate' } },
      }),
    ),
    'SINGLE_EXISTS',
  )
  types = [
    {
      ...typeRow,
      fields: [
        ...fields,
        { name: 'related', type: 'relation', relationType: 'many-to-many', relatedTable: 'posts' },
      ],
    },
  ]
  referenced = true
  const before = structuredClone(rows)
  assert.equal(errorCode(await callUpdate({ title: 'Unsafe' })), 'PUBLIC_REFERENCE')
  assert.deepEqual(rows, before)
  referenced = false
  relationStatus = 'published'
  assert.equal(errorCode(await callUpdate({ related: ['target'] })), 'PUBLIC_RELATION')
  relationStatus = 'draft'
  failRelation = true
  const eventCount = events.length
  assert.equal(
    errorCode(await callUpdate({ title: 'Rolled back', related: ['target'] })),
    'INVALID_REFERENCE',
  )
  assert.deepEqual(rows, before)
  assert.equal(events.length, eventCount)
  assert.equal(queries.at(-1), 'ROLLBACK')
  permissions = ['entries:read']
  await assert.rejects(() => callUpdate({ title: 'Denied' }), /Tool update_entry not found/)
  assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name).sort(), [
    'get_entry',
    'get_locales',
    'list_entries',
    'search_entries',
  ])
  assert.deepEqual(
    (await client.listResources()).resources.map((resource) => resource.uri),
    ['plank://locales'],
  )
  permissions = ['*']
  denyOnCall = true
  assert.equal(errorCode(await callUpdate({ title: 'Denied at execution' })), 'FORBIDDEN')
  denyOnCall = false
  enabled = false
  const headers = { Authorization: `Bearer ${token}` }
  assert.equal((await fetch(url, { headers })).status, 401)
  enabled = true
  validToken = false
  assert.equal((await fetch(url, { headers })).status, 401)
  assert.equal((await fetch(url)).status, 401)
  validToken = true
  tokenType = 'read-only'
  assert.equal((await fetch(url, { headers })).status, 403)
  tokenType = 'mcp-server'
  assert.equal(
    (await fetch(url, { headers: { ...headers, Origin: 'https://untrusted.test' } })).status,
    403,
  )
  assert.equal(
    (await fetch(url, { headers: { ...headers, Accept: 'text/event-stream' } })).status,
    405,
  )
  assert.equal((await fetch(url, { method: 'DELETE', headers })).status, 405)
  assert.equal(
    (
      await fetch(url, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: '{"jsonrpc":"2.0","id":99}',
      })
    ).status,
    400,
  )
})

test('internal errors do not expose database details', () => {
  assert.equal(
    (mcpError(new Error('SQL password')).structuredContent.error as Row).message,
    'The operation failed.',
  )
})
