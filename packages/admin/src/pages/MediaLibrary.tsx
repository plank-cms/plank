import React, { useRef, useState, useEffect, useCallback } from 'react'
import {
  UploadIcon,
  FileIcon,
  Trash2Icon,
  DownloadIcon,
  FileAudioIcon,
  FileVideoIcon,
  FileTextIcon,
  FolderIcon,
  FolderPlusIcon,
  HomeIcon,
  PencilIcon,
  EllipsisIcon,
} from 'lucide-react'
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb.tsx'
import { useFetch } from '@/hooks/useFetch.ts'
import { uploadMediaFile } from '@/lib/uploadMedia.ts'
import { useApi } from '@/hooks/useApi.ts'
import { Button } from '@/components/ui/button.tsx'
import { Spinner } from '@/components/ui/spinner.tsx'
import { Checkbox } from '@/components/ui/checkbox.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu.tsx'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog.tsx'
import HeaderFixed from '@/components/Header'

// Types

type Folder = {
  id: string
  name: string
  parent_id: string | null
  created_at: string
  item_count: number
}

type MediaItem = {
  id: string
  filename: string
  url: string
  mime_type: string | null
  size: number | null
  alt: string | null
  width: number | null
  height: number | null
  folder_id: string | null
  created_at: string
}

type MediaList = { items: MediaItem[]; total: number }
type FolderList = { folders: Folder[] }
type BreadcrumbEntry = { id: string | null; name: string }

// Helpers

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImage(mime: string | null) {
  return !!mime?.startsWith('image/')
}
function isVideo(mime: string | null) {
  return !!mime?.startsWith('video/')
}
function isAudio(mime: string | null) {
  return !!mime?.startsWith('audio/')
}
function isPDF(mime: string | null) {
  return mime === 'application/pdf'
}
function isHLS(url: string, mime: string | null) {
  return (
    url.split('?')[0].endsWith('.m3u8') ||
    mime === 'application/x-mpegurl' ||
    mime === 'application/vnd.apple.mpegurl'
  )
}

async function readFSEntry(
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

// HLS Video Player

function HLSVideoPlayer({ url }: { url: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url
      return
    }
    let hlsInstance: { destroy(): void } | null = null
    import('hls.js').then(({ default: Hls }) => {
      if (!Hls.isSupported()) return
      const hls = new Hls()
      hlsInstance = hls
      hls.loadSource(url)
      hls.attachMedia(video)
    })
    return () => {
      hlsInstance?.destroy()
    }
  }, [url])

  return <video ref={videoRef} controls className="max-h-[70vh] w-full rounded-md bg-black" />
}

// Media Preview

function MediaPreviewContent({ item }: { item: MediaItem }) {
  const mime = item.mime_type?.toLowerCase() ?? null

  if (isImage(mime))
    return (
      <img
        src={item.url}
        alt={item.filename}
        className="max-h-[70vh] w-full rounded-md object-contain"
      />
    )
  if (isHLS(item.url, mime)) return <HLSVideoPlayer url={item.url} />
  if (isVideo(mime))
    return (
      <video
        src={item.url}
        controls
        preload="none"
        className="max-h-[70vh] w-full rounded-md bg-black"
      />
    )
  if (isAudio(mime))
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <FileAudioIcon className="size-14 text-muted-foreground" />
        <audio src={item.url} controls className="w-full" />
      </div>
    )
  if (isPDF(mime))
    return (
      <iframe src={item.url} title={item.filename} className="h-[70vh] w-full rounded-md border" />
    )

  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <FileTextIcon className="size-14 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{item.mime_type ?? 'Unknown type'}</p>
      <a href={item.url} target="_blank" rel="noreferrer" download={item.filename}>
        <Button variant="outline" size="sm">
          <DownloadIcon className="size-4" />
          Download
        </Button>
      </a>
    </div>
  )
}

// Folder Card

function FolderCard({
  folder,
  onOpen,
  onDelete,
  onRename,
  selected,
  onToggle,
}: {
  folder: Folder
  onOpen: (folder: Folder) => void
  onDelete: (folder: Folder) => void
  onRename: (folder: Folder) => void
  selected: boolean
  onToggle: (id: string) => void
}) {
  return (
    <div
      className={`group relative flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors cursor-pointer hover:bg-muted/50 ${selected ? 'ring-2 ring-primary' : ''}`}
      onClick={() => {
        if (!selected) onOpen(folder)
      }}
    >
      <div className="relative shrink-0 size-7 flex items-center justify-center">
        <FolderIcon
          className={`size-7 text-muted-foreground transition-opacity ${selected ? 'opacity-0' : 'group-hover:opacity-0'}`}
        />
        <div
          className={`absolute inset-0 flex items-center justify-center transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggle(`folder:${folder.id}`)}
            aria-label="Select folder"
          />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold truncate" title={folder.name}>
          {folder.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {folder.item_count} {folder.item_count === 1 ? 'item' : 'items'}
        </p>
      </div>
      {!selected && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <EllipsisIcon className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onSelect={() => onRename(folder)}>
              <PencilIcon className="size-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onDelete(folder)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2Icon className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

// Media Card

function MediaCard({
  item,
  onDelete,
  onPreview,
  selected,
  onToggle,
}: {
  item: MediaItem
  onDelete: (item: MediaItem) => void
  onPreview: (item: MediaItem) => void
  selected: boolean
  onToggle: (id: string) => void
}) {
  const mime = item.mime_type?.toLowerCase() ?? null

  return (
    <div
      className={`group relative rounded-lg border bg-card overflow-hidden transition-colors ${selected ? 'ring-2 ring-primary' : ''}`}
    >
      <div
        className="aspect-square bg-muted flex items-center justify-center cursor-pointer"
        onClick={() => {
          if (!selected) onPreview(item)
        }}
      >
        {isImage(mime) ? (
          <img src={item.url} alt={item.filename} className="h-full w-full object-cover" />
        ) : isVideo(mime) || isHLS(item.url, mime) ? (
          <FileVideoIcon className="size-10 text-muted-foreground" />
        ) : isAudio(mime) ? (
          <FileAudioIcon className="size-10 text-muted-foreground" />
        ) : isPDF(mime) ? (
          <FileTextIcon className="size-10 text-muted-foreground" />
        ) : (
          <FileIcon className="size-10 text-muted-foreground" />
        )}
      </div>
      <div
        className={`absolute top-1.5 left-1.5 transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggle(item.id)}
          aria-label="Select file"
          className="bg-background/80 backdrop-blur-sm"
        />
      </div>
      {!selected && (
        <button
          onClick={() => onDelete(item)}
          className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-md bg-background/80 text-muted-foreground opacity-0 backdrop-blur-sm transition-opacity hover:text-destructive group-hover:opacity-100"
        >
          <Trash2Icon className="size-3.5" />
        </button>
      )}
      <div className="p-2">
        <p className="text-xs font-medium truncate" title={item.filename}>
          {item.filename}
        </p>
        <p className="text-xs text-muted-foreground">{formatBytes(item.size)}</p>
      </div>
    </div>
  )
}

// Media Library

export function MediaLibrary() {
  const inputRef = useRef<HTMLInputElement>(null)

  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbEntry[]>([{ id: null, name: 'Media' }])
  const currentFolderId = breadcrumb[breadcrumb.length - 1].id

  const {
    data: folderData,
    loading: foldersLoading,
    refetch: refetchFolders,
  } = useFetch<FolderList>(`/cms/admin/folders?parent_id=${currentFolderId ?? ''}`)
  const {
    data: mediaData,
    loading: mediaLoading,
    refetch: refetchMedia,
  } = useFetch<MediaList>(`/cms/admin/media?folder_id=${currentFolderId ?? ''}`)

  const refetch = useCallback(() => {
    refetchFolders()
    refetchMedia()
  }, [refetchFolders, refetchMedia])

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<MediaItem | null>(null)
  const [editFilename, setEditFilename] = useState('')
  const [editAlt, setEditAlt] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<MediaItem | null>(null)
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null)
  const [folderToRename, setFolderToRename] = useState<Folder | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [bulkConfirmDelete, setBulkConfirmDelete] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)

  const { loading: deleting, error: deleteError, request } = useApi()
  const { loading: folderSaving, error: folderSaveError, request: folderRequest } = useApi<Folder>()

  // Upload

  async function uploadFilesWithPaths(filesWithPaths: { file: File; relativePath: string }[]) {
    const hasM3U8 = filesWithPaths.some(({ relativePath }) => relativePath.endsWith('.m3u8'))

    if (hasM3U8) {
      // HLS bundles always go through the server (need server-side bundleId generation)
      const token = localStorage.getItem('plank_token')
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
      const body = new FormData()
      for (const { file, relativePath } of filesWithPaths) {
        body.append('files', file, relativePath)
      }
      if (currentFolderId) body.append('folder_id', currentFolderId)
      body.append('bundle', 'true')
      const res = await fetch('/cms/admin/media', { method: 'POST', headers, body })
      if (!res.ok) {
        const text = await res.text()
        let msg = 'Upload failed.'
        try {
          msg = (JSON.parse(text) as { error?: string }).error ?? msg
        } catch {
          /* ignore */
        }
        throw new Error(msg)
      }
    } else {
      await Promise.all(
        filesWithPaths.map(({ file }) => uploadMediaFile(file, { folderId: currentFolderId })),
      )
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setUploadError(null)
    try {
      const filesWithPaths = Array.from(files).map((f) => ({
        file: f,
        relativePath: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
      }))
      await uploadFilesWithPaths(filesWithPaths)
      refetch()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const items = Array.from(e.dataTransfer.items)
    const hasEntry = items.some((i) => typeof i.webkitGetAsEntry === 'function')

    if (!hasEntry) {
      handleFiles(e.dataTransfer.files)
      return
    }

    setUploading(true)
    setUploadError(null)
    try {
      const entries = items
        .map((i) => i.webkitGetAsEntry())
        .filter((entry): entry is FileSystemEntry => entry !== null)
      const nested = await Promise.all(entries.map(readFSEntry))
      await uploadFilesWithPaths(nested.flat())
      refetch()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  // Navigation

  function openFolder(folder: Folder) {
    setBreadcrumb((prev) => [...prev, { id: folder.id, name: folder.name }])
    setSelected(new Set())
  }

  function navigateTo(index: number) {
    setBreadcrumb((prev) => prev.slice(0, index + 1))
    setSelected(new Set())
  }

  // Folder CRUD

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return
    try {
      await folderRequest('/cms/admin/folders', 'POST', {
        name: newFolderName.trim(),
        parent_id: currentFolderId,
      })
      setNewFolderOpen(false)
      setNewFolderName('')
      refetchFolders()
    } catch {
      /* shown via folderSaveError */
    }
  }

  async function handleRenameFolder() {
    if (!folderToRename || !renameValue.trim()) return
    try {
      await folderRequest(`/cms/admin/folders/${folderToRename.id}`, 'PATCH', {
        name: renameValue.trim(),
      })
      setFolderToRename(null)
      refetchFolders()
    } catch {
      /* shown via folderSaveError */
    }
  }

  async function handleDeleteFolder() {
    if (!folderToDelete) return
    try {
      await request(`/cms/admin/folders/${folderToDelete.id}`, 'DELETE')
      setFolderToDelete(null)
      refetchFolders()
    } catch {
      /* shown via deleteError */
    }
  }

  // Media CRUD

  async function handleDeleteMedia() {
    if (!toDelete) return
    try {
      await request(`/cms/admin/media/${toDelete.id}`, 'DELETE')
      setToDelete(null)
      refetchMedia()
    } catch {
      /* shown via deleteError */
    }
  }

  // Selection

  function toggleOne(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const folders = folderData?.folders ?? []
  const items = mediaData?.items ?? []
  const allKeys = [...folders.map((f) => `folder:${f.id}`), ...items.map((i) => i.id)]
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k))
  const someSelected = !allSelected && allKeys.some((k) => selected.has(k))

  async function handleBulkDelete() {
    if (bulkLoading) return
    setBulkLoading(true)
    const token = localStorage.getItem('plank_token')
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
    try {
      await Promise.all([
        ...[...selected]
          .filter((k) => k.startsWith('folder:'))
          .map((k) => fetch(`/cms/admin/folders/${k.slice(7)}`, { method: 'DELETE', headers })),
        ...[...selected]
          .filter((k) => !k.startsWith('folder:'))
          .map((k) => fetch(`/cms/admin/media/${k}`, { method: 'DELETE', headers })),
      ])
      setBulkConfirmDelete(false)
      setSelected(new Set())
      refetch()
    } finally {
      setBulkLoading(false)
    }
  }

  const loading = foldersLoading || mediaLoading
  const empty = folders.length === 0 && items.length === 0

  return (
    <div>
      {/* Header */}
      <HeaderFixed>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold -mt-2">Media Library</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mediaData ? `${mediaData.total} file${mediaData.total !== 1 ? 's' : ''}` : ''}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setNewFolderName('')
                setNewFolderOpen(true)
              }}
            >
              <FolderPlusIcon className="size-4" />
              New folder
            </Button>
            <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
              {uploading ? <Spinner className="size-4" /> : <UploadIcon className="size-4" />}
              {uploading ? 'Uploading…' : 'Upload'}
            </Button>
          </div>
        </div>
      </HeaderFixed>

      <section className="mt-24">
        {/* Breadcrumb */}
        {breadcrumb.length > 1 && (
          <Breadcrumb className="mb-4">
            <BreadcrumbList>
              {breadcrumb.map((entry, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>
                    {i === breadcrumb.length - 1 ? (
                      <BreadcrumbPage>
                        {i === 0 ? <HomeIcon className="size-3.5" /> : entry.name}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <button onClick={() => navigateTo(i)}>
                          {i === 0 ? <HomeIcon className="size-3.5" /> : entry.name}
                        </button>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </React.Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        )}

        {/* Bulk bar */}
        {!empty && !loading && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-4 py-2.5">
            <Checkbox
              checked={allSelected ? true : someSelected ? 'indeterminate' : false}
              onCheckedChange={() => {
                if (allSelected) setSelected(new Set())
                else setSelected(new Set(allKeys))
              }}
              aria-label="Select all"
            />
            {selected.size > 0 ? (
              <>
                <span className="text-sm font-medium">{selected.size} selected</span>
                <div className="ml-auto flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
                    Clear
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={bulkLoading}
                    onClick={() => setBulkConfirmDelete(true)}
                  >
                    <Trash2Icon className="size-3.5" />
                    Delete
                  </Button>
                </div>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Select all</span>
            )}
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {uploadError && <p className="mb-4 text-sm text-destructive">{uploadError}</p>}

        {/* Grid */}
        {loading ? (
          <div className="flex items-center gap-2 py-16 justify-center text-muted-foreground">
            <Spinner className="size-5" />
          </div>
        ) : empty ? (
          <div
            className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <UploadIcon className="size-8 text-muted-foreground mb-3" />
            <p className="text-sm font-medium">Drop files or folders here, or click to upload</p>
            <p className="text-xs text-muted-foreground mt-1">
              Images, videos, audio, documents and more
            </p>
          </div>
        ) : (
          <div
            className="flex flex-col gap-6"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {folders.length > 0 && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {folders.map((folder) => (
                  <FolderCard
                    key={folder.id}
                    folder={folder}
                    onOpen={openFolder}
                    onDelete={setFolderToDelete}
                    onRename={(f) => {
                      setFolderToRename(f)
                      setRenameValue(f.name)
                    }}
                    selected={selected.has(`folder:${folder.id}`)}
                    onToggle={toggleOne}
                  />
                ))}
              </div>
            )}
            {items.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {items.map((item) => (
                  <MediaCard
                    key={item.id}
                    item={item}
                    onDelete={setToDelete}
                    onPreview={(item) => {
                      setPreview(item)
                      setEditFilename(item.filename)
                      setEditAlt(item.alt ?? '')
                      setEditError(null)
                    }}
                    selected={selected.has(item.id)}
                    onToggle={toggleOne}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Preview */}
        <Dialog
          open={!!preview}
          onOpenChange={(o) => {
            if (!o) {
              setPreview(null)
              setEditError(null)
            }
          }}
        >
          <DialogContent className="sm:max-w-4xl h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="truncate pr-6" title={preview?.filename}>
                {preview?.filename}
              </DialogTitle>
            </DialogHeader>
            {preview && <MediaPreviewContent item={preview} />}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{preview?.mime_type ?? '—'}</span>
              <div className="flex items-center gap-3">
                {preview?.width && preview?.height && (
                  <span>
                    {preview.width} × {preview.height}
                  </span>
                )}
                <span>{formatBytes(preview?.size ?? null)}</span>
                <a
                  href={preview?.url}
                  target="_blank"
                  rel="noreferrer"
                  download={preview?.filename}
                >
                  <Button variant="ghost" size="sm" className="h-7 px-2">
                    <DownloadIcon className="size-3.5" />
                  </Button>
                </a>
              </div>
            </div>
            {preview && isImage(preview.mime_type) && (
              <form
                className="flex flex-col gap-3 border-t pt-3"
                onSubmit={async (e) => {
                  e.preventDefault()
                  setEditSaving(true)
                  setEditError(null)
                  const token = localStorage.getItem('plank_token')
                  try {
                    const res = await fetch(`/cms/admin/media/${preview.id}`, {
                      method: 'PATCH',
                      headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                      },
                      body: JSON.stringify({
                        filename: editFilename || preview.filename,
                        alt: editAlt || null,
                      }),
                    })
                    if (!res.ok) throw new Error('Save failed.')
                    const updated = (await res.json()) as MediaItem
                    setPreview(updated)
                    refetchMedia()
                  } catch (err) {
                    setEditError(err instanceof Error ? err.message : 'Save failed.')
                  } finally {
                    setEditSaving(false)
                  }
                }}
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Filename</Label>
                    <Input
                      value={editFilename}
                      onChange={(e) => setEditFilename(e.target.value)}
                      placeholder={preview.filename}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Alt text</Label>
                    <Input
                      value={editAlt}
                      onChange={(e) => setEditAlt(e.target.value)}
                      placeholder="Describe the image…"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                {editError && <p className="text-xs text-destructive">{editError}</p>}
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={editSaving}>
                    {editSaving ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* New folder */}
        <Dialog
          open={newFolderOpen}
          onOpenChange={(o) => {
            if (!o) setNewFolderOpen(false)
          }}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>New folder</DialogTitle>
            </DialogHeader>
            <Input
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder()
              }}
              autoFocus
            />
            {folderSaveError && <p className="text-sm text-destructive">{folderSaveError}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewFolderOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateFolder} disabled={folderSaving || !newFolderName.trim()}>
                {folderSaving ? 'Creating…' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rename folder */}
        <Dialog
          open={!!folderToRename}
          onOpenChange={(o) => {
            if (!o) setFolderToRename(null)
          }}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Rename folder</DialogTitle>
            </DialogHeader>
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameFolder()
              }}
              autoFocus
            />
            {folderSaveError && <p className="text-sm text-destructive">{folderSaveError}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setFolderToRename(null)}>
                Cancel
              </Button>
              <Button onClick={handleRenameFolder} disabled={folderSaving || !renameValue.trim()}>
                {folderSaving ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete media */}
        <Dialog
          open={!!toDelete}
          onOpenChange={(o) => {
            if (!o) setToDelete(null)
          }}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete file</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete{' '}
              <span className="font-medium text-foreground">{toDelete?.filename}</span>? This action
              cannot be undone.
            </p>
            {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setToDelete(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteMedia} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete folder */}
        <Dialog
          open={!!folderToDelete}
          onOpenChange={(o) => {
            if (!o) setFolderToDelete(null)
          }}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete folder</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete{' '}
              <span className="font-medium text-foreground">{folderToDelete?.name}</span>? The
              folder must be empty.
            </p>
            {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setFolderToDelete(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteFolder} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk delete */}
        <Dialog
          open={bulkConfirmDelete}
          onOpenChange={(o) => {
            if (!o) setBulkConfirmDelete(false)
          }}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>
                Delete {selected.size} {selected.size === 1 ? 'item' : 'items'}?
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This action cannot be undone. Non-empty folders will be skipped.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBulkConfirmDelete(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkLoading}>
                {bulkLoading ? <Spinner className="size-4" /> : null}Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    </div>
  )
}
