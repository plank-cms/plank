import type React from 'react'

export function handleCardKeyboard(
  event: React.KeyboardEvent<HTMLElement>,
  action: () => void,
) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  action()
}

export function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function buildDefaultAlt(filename: string): string {
  const baseName = filename.split('/').pop() ?? filename
  const withoutExtension = baseName.replace(/\.[^.]+$/, '').trim()
  return withoutExtension || baseName.trim()
}

export function isImage(mime: string | null) {
  return !!mime?.startsWith('image/')
}

export function isVideo(mime: string | null) {
  return !!mime?.startsWith('video/')
}

export function isAudio(mime: string | null) {
  return !!mime?.startsWith('audio/')
}

export function isPDF(mime: string | null) {
  return mime === 'application/pdf'
}

export function isHLS(url: string, mime: string | null) {
  return (
    url.split('?')[0].endsWith('.m3u8') ||
    mime === 'application/x-mpegurl' ||
    mime === 'application/vnd.apple.mpegurl'
  )
}

export async function readFSEntry(
  entry: FileSystemEntry,
): Promise<{ file: File; relativePath: string }[]> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      ;(entry as FileSystemFileEntry).file((f) =>
        resolve([{ file: f, relativePath: entry.fullPath.replace(/^\//, '') }]),
      )
    })
  }

  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    const results: { file: File; relativePath: string }[] = []
    await new Promise<void>((resolve) => {
      const readBatch = () => {
        reader.readEntries(async (entries) => {
          if (entries.length === 0) {
            resolve()
            return
          }
          const nested = await Promise.all(entries.map(readFSEntry))
          results.push(...nested.flat())
          readBatch()
        })
      }
      readBatch()
    })
    return results
  }

  return []
}
