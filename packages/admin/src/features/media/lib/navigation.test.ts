/// <reference types="node" />

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMemoryRouter } from 'react-router-dom'
import type { Folder } from '../types.ts'
import { getFolderTrail, getMediaPath } from './navigation.ts'

const folders: Folder[] = [
  { id: 'photos', name: 'Photos', parent_id: null, created_at: '', item_count: 1 },
  { id: 'events', name: 'Events', parent_id: 'photos', created_at: '', item_count: 0 },
]

test('media paths restore the full folder trail and breadcrumb destinations', () => {
  assert.deepEqual(getFolderTrail(null, folders), [])
  assert.equal(getMediaPath([null]), '/media')
  const trail = getFolderTrail('events', folders)
  assert.ok(trail)
  assert.deepEqual(
    trail.map((folder) => folder.name),
    ['Photos', 'Events'],
  )
  assert.equal(getMediaPath(trail.map((folder) => folder.id)), '/media/photos/events')
  assert.equal(getMediaPath(trail.slice(0, 1).map((folder) => folder.id)), '/media/photos')
})

test('renaming preserves paths and moving rebuilds the canonical hierarchy', () => {
  const renamed = folders.map((folder) => ({ ...folder, name: 'Renamed' }))
  const trail = getFolderTrail('events', renamed)
  assert.ok(trail)
  assert.equal(getMediaPath(trail.map((folder) => folder.id)), '/media/photos/events')
  const moved = folders.map((folder) => ({ ...folder, parent_id: null }))
  assert.deepEqual(
    getFolderTrail('events', moved)?.map((folder) => folder.id),
    ['events'],
  )
})

test('missing folders, missing parents, and cycles do not resolve to the root', () => {
  assert.equal(getFolderTrail('missing', folders), null)
  assert.equal(getFolderTrail('events', folders.slice(1)), null)
  const cyclic = folders.map((folder) => ({ ...folder, parent_id: 'events' }))
  assert.equal(getFolderTrail('events', cyclic), null)
})

test('folder segments survive direct entry and browser history navigation', async () => {
  const router = createMemoryRouter([{ path: 'media/*' }], {
    basename: '/admin',
    initialEntries: ['/admin/media/photos/events'],
  })

  try {
    assert.equal(router.state.matches.at(-1)?.params['*'], 'photos/events')
    await router.navigate('/media/photos')
    assert.equal(router.state.matches.at(-1)?.params['*'], 'photos')
    await router.navigate(-1)
    assert.equal(router.state.matches.at(-1)?.params['*'], 'photos/events')
    await router.navigate(1)
    assert.equal(router.state.matches.at(-1)?.params['*'], 'photos')
    await router.navigate('/media')
    assert.equal(router.state.matches.at(-1)?.params['*'], '')
  } finally {
    router.dispose()
  }
})
