import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pool } from '@plank-cms/db'
import { listEntryData } from './entries.js'

test('dashboard entry filters are applied before pagination and use the current editorial role', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }))

  const cases = [
    { status: 'draft', role: 'super admin', editorial: true, scope: 'own' },
    { status: 'scheduled', role: 'admin', editorial: true, scope: 'own' },
    { status: 'scheduled', role: 'contributor', editorial: true, scope: 'own' },
    { status: 'scheduled', role: 'editor', editorial: false, scope: 'own' },
    { status: 'scheduled', role: 'editor', editorial: true, scope: 'reviewed' },
    { status: 'scheduled', role: 'super admin', editorial: true, scope: 'all' },
  ] as const

  for (const { status, role, editorial, scope } of cases) {
    const queries: { sql: string; values: unknown[] }[] = []
    const query = async (sql: string, values: unknown[] = []) => {
      if (sql.includes('FROM plank_content_types')) {
        return {
          rows: [{ id: 'type', slug: 'posts', name: 'Posts', table_name: 'posts', fields: [] }],
        }
      }
      if (sql.includes('JOIN plank_roles')) {
        assert.deepEqual(values, ['actor'])
        return { rows: [{ name: role }] }
      }
      queries.push({ sql, values })
      return { rows: sql.includes('COUNT(*)') ? [{ count: '0' }] : [] }
    }
    await listEntryData(
      {
        slug: 'posts',
        id: '',
        data: {},
        query: { page: 2, limit: 7, sort: 'created_at' },
        user: { id: 'actor', roleId: 'role' },
        db: { query: query as typeof pool.query },
        editorial,
      },
      status,
    )

    const [list, count] = queries
    const predicate = (index: number) => {
      const owner = `e.created_by = $${index}`
      return scope === 'reviewed' ? `(${owner} OR e._scheduled_reviewer_id = $${index})` : owner
    }

    assert.ok(
      list.sql.includes(
        status === 'scheduled'
          ? 'ORDER BY e."scheduled_for" ASC, e.id ASC'
          : 'ORDER BY e."updated_at" DESC, e.id ASC',
      ),
    )
    assert.ok(list.sql.includes('WHERE e.status = $3'))
    assert.ok(count.sql.includes('WHERE e.status = $1'))
    if (scope === 'all') {
      assert.deepEqual(list.values, [7, 7, status])
      assert.deepEqual(count.values, [status])
    } else {
      assert.ok(list.sql.includes(`AND ${predicate(4)}`))
      assert.ok(count.sql.includes(`AND ${predicate(2)}`))
      assert.deepEqual(list.values, [7, 7, status, 'actor'])
      assert.deepEqual(count.values, [status, 'actor'])
    }
  }
})
