import type { Folder } from '../types.ts'

export function getFolderTrail(folderId: string | null, folders: Folder[]): Folder[] | null {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const trail: Folder[] = []
  const visited = new Set<string>()
  let currentId = folderId

  while (currentId) {
    const folder = byId.get(currentId)
    if (!folder || visited.has(currentId)) return null
    visited.add(currentId)
    trail.unshift(folder)
    currentId = folder.parent_id
  }

  return trail
}

export function getMediaPath(folderIds: (string | null)[]): string {
  const segments = folderIds.filter((id): id is string => id !== null).map(encodeURIComponent)
  return segments.length ? `/media/${segments.join('/')}` : '/media'
}
