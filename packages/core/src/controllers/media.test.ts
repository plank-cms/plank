import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import express from 'express'
import { pool } from '@plank-cms/db'
import { localProvider } from '../media/providers/local.js'
import { authorize } from '../middlewares/authorize.js'
import { downloadMedia } from './media.js'

test('media downloads return attachments and enforce read permissions', async (t) => {
  let exists = true
  let allowed = true
  let upstreamStatus = 200
  let networkFailure = false
  const content = Buffer.from([0, 1, 2, 128, 255])
  const query = async (sql: string, values?: unknown[]) => {
    if (sql.includes('plank_roles')) {
      return { rows: [{ permissions: allowed ? ['media:read'] : [] }] }
    }
    if (sql.includes('plank_settings')) return { rows: [{ value: 'local' }] }
    assert.deepEqual(values, ['asset'])
    return {
      rows: exists
        ? [{ filename: 'foto de café 東京.png', provider_key: 'image.png', mime_type: 'image/png' }]
        : [],
    }
  }
  t.mock.method(pool, 'query', query as unknown as typeof pool.query)
  t.mock.method(localProvider, 'getUrl', async (key: string) => {
    assert.equal(key, 'image.png')
    return 'https://assets.example.test/image.png'
  })
  const request = globalThis.fetch
  const upstream = t.mock.method(globalThis, 'fetch', async () => {
    if (networkFailure) throw new Error('Connection failed')
    return new Response(content, { status: upstreamStatus })
  })
  const app = express()
  app.use((req, _res, next) => {
    req.user = { id: 'user', roleId: 'reader' }
    next()
  })
  app.get('/media/:id/download', authorize('media:read'), downloadMedia)
  const server = app.listen(0, '127.0.0.1')
  t.after(() => {
    server.closeAllConnections()
    server.close()
  })
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const url = `http://127.0.0.1:${address.port}/media/asset/download`

  const response = await request(url)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'image/png')
  const disposition = response.headers.get('content-disposition')
  assert.ok(disposition)
  assert.ok(disposition.startsWith('attachment;'))
  assert.ok(disposition.includes(`filename*=UTF-8''${encodeURIComponent('foto de café 東京.png')}`))
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), content)
  assert.equal(upstream.mock.calls[0].arguments[0], 'https://assets.example.test/image.png')

  exists = false
  assert.equal((await request(url)).status, 404)
  assert.equal(upstream.mock.callCount(), 1)

  exists = true
  allowed = false
  assert.equal((await request(url)).status, 403)
  assert.equal(upstream.mock.callCount(), 1)

  allowed = true
  upstreamStatus = 404
  const missing = await request(url)
  assert.equal(missing.status, 502)
  assert.equal(missing.headers.get('content-disposition'), null)

  networkFailure = true
  assert.equal((await request(url)).status, 502)
})
