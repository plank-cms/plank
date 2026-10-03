import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ContentType } from '@plank-cms/schema'
import { mergeEntryPatch, assertSnapshotSafety } from './mcpEntries.js'

const ct: ContentType = {
  name: 'Posts',
  slug: 'posts',
  tableName: 'posts',
  kind: 'collection',
  fields: [
    { name: 'title', type: 'string', required: true },
    { name: 'body', type: 'richtext' },
    { name: 'items', type: 'array', arrayFields: [{ name: 'label', type: 'string' }] },
    { name: 'related', type: 'relation', relatedTable: 'posts' },
  ],
}

test('patches preserve omitted fields, replace arrays and merge localized fields', () => {
  const current = {
    title: 'Original',
    body: 'Content',
    items: [{ label: 'Old' }],
    localized: {
      es: { title: 'Anterior', body: 'Texto' },
      en: { title: 'Original' },
      _meta: { enabled: true, primary: 'en' },
    },
  }
  const patched = mergeEntryPatch(ct, current, {
    items: [{ label: 'New' }],
    localized: { es: { title: 'Nuevo' } },
  })
  assert.equal(patched.title, 'Original')
  assert.deepEqual(patched.items, [{ label: 'New' }])
  assert.deepEqual(patched.localized, {
    es: { title: 'Nuevo', body: 'Texto' },
    en: { title: 'Original' },
    _meta: { enabled: true, primary: 'en' },
  })
  assert.equal(current.localized.es.title, 'Anterior')
})

test('rejects invalid schema fields, system metadata and malformed localized content', () => {
  for (const key of [
    'status',
    'created_by',
    'published_at',
    'editor_id',
    'scheduled_for',
    'unknown',
  ]) {
    assert.throws(
      () => mergeEntryPatch(ct, { title: 'Original' }, { [key]: 'value' }),
      /Unknown or reserved/,
    )
  }
  assert.throws(() => mergeEntryPatch(ct, {}, {}), /required/)
  assert.throws(() => mergeEntryPatch(ct, { title: 'Original' }, { title: null }), /required/)
  assert.throws(
    () => mergeEntryPatch(ct, { title: 'Original' }, { localized: { es: { title: 123 } } }),
    /string/,
  )
  assert.throws(
    () => mergeEntryPatch(ct, { title: 'Original' }, { localized: { es: { related: 'id' } } }),
    /non-localizable/,
  )
  assert.throws(
    () =>
      mergeEntryPatch(ct, { title: 'Original' }, { localized: { _meta: { status: 'published' } } }),
    /metadata/,
  )
  assert.throws(() => mergeEntryPatch(ct, { title: 'Original' }, { localized: null }), /object/)
})

test('preserves published snapshots and rejects unsafe edits', () => {
  const published = {
    status: 'published',
    published_data: { title: 'Public', localized: { es: { title: 'Público' } } },
  }
  const before = structuredClone(published)
  assertSnapshotSafety(ct, published, { title: 'Working' })
  assert.deepEqual(published, before)
  assert.throws(
    () => assertSnapshotSafety(ct, { status: 'scheduled' }, { title: 'Working' }),
    /scheduled/,
  )
  assert.throws(
    () => assertSnapshotSafety(ct, { status: 'published' }, { title: 'Working' }),
    /snapshot/,
  )
  assert.throws(
    () =>
      assertSnapshotSafety(ct, { status: 'published', published_data: {} }, { title: 'Working' }),
    /snapshot/,
  )
  assert.throws(
    () =>
      assertSnapshotSafety(
        ct,
        { status: 'published', published_data: { title: 'Public' } },
        { localized: { es: { title: 'Nuevo' } } },
      ),
    /locales/,
  )
  assert.throws(() => assertSnapshotSafety(ct, published, { related: 'id' }), /relations/)
})
