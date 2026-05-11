import React, { useRef, useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
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
  SearchIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
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
import { useAuth } from '@/context/auth.tsx'
import { uploadMediaFile } from '@/lib/uploadMedia.ts'
import { useApi } from '@/hooks/useApi.ts'
import { Button } from '@/components/ui/button.tsx'
import { Spinner } from '@/components/ui/spinner.tsx'
import { Checkbox } from '@/components/ui/checkbox.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
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
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination.tsx'
import HeaderFixed from '@/components/Header'
import { formatDatetime } from '@/lib/formatDate.ts'
import { useSettings } from '@/context/settings.tsx'

function handleCardKeyboard(
  event: React.KeyboardEvent<HTMLElement>,
  action: () => void,
) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  action()
}

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
  caption: string | null
  width: number | null
  height: number | null
  folder_id: string | null
  created_at: string
}

type MediaList = { items: MediaItem[]; total: number; page: number; limit: number; pages: number }
type FolderList = { folders: Folder[] }
type BreadcrumbEntry = { id: string | null; name: string }

// Helpers

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function buildDefaultAlt(filename: string): string {
  const baseName = filename.split('/').pop() ?? filename
  const withoutExtension = baseName.replace(/\.[^.]+$/, '').trim()
  return withoutExtension || baseName.trim()
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

  return (
    <video ref={videoRef} controls className="max-h-[70vh] w-full rounded-md bg-zinc-950" />
  )
}

// Media Preview

function MediaPreviewContent({ item }: { item: MediaItem }) {
  const mime = item.mime_type?.toLowerCase() ?? null

  if (isImage(mime))
    return (
      <img
        src={item.url}
        alt={item.alt ?? item.filename}
        className="max-h-full max-w-full rounded-md object-contain"
      />
    )
  if (isHLS(item.url, mime)) return <HLSVideoPlayer url={item.url} />
  if (isVideo(mime))
    return (
      <video
        src={item.url}
        controls
        preload="none"
        className="max-h-[70vh] w-full rounded-md bg-zinc-950"
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
  canDelete,
  canRename,
  selected,
  onToggle,
}: {
  folder: Folder
  onOpen: (folder: Folder) => void
  onDelete: (folder: Folder) => void
  onRename: (folder: Folder) => void
  canDelete: boolean
  canRename: boolean
  selected: boolean
  onToggle: (id: string) => void
}) {
  return (
    <div
      className={`group relative flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors cursor-pointer hover:bg-muted/50 ${selected ? 'ring-2 ring-primary' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => {
        if (!selected) onOpen(folder)
      }}
      onKeyDown={(event) => {
        handleCardKeyboard(event, () => {
          if (!selected) onOpen(folder)
        })
      }}
    >
      <div className="relative shrink-0 size-7 flex items-center justify-center">
        <FolderIcon
          className={`size-7 text-muted-foreground transition-opacity ${selected ? 'opacity-0' : 'group-hover:opacity-0'}`}
        />
        <div
          className={`absolute inset-0 flex items-center justify-center transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          onPointerDown={(e) => e.stopPropagation()}
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
      {!selected && (canRename || canDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <EllipsisIcon className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {canRename && (
              <DropdownMenuItem onSelect={() => onRename(folder)}>
                <PencilIcon className="size-4" />
                Rename
              </DropdownMenuItem>
            )}
            {canDelete && (
              <DropdownMenuItem
                onSelect={() => onDelete(folder)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2Icon className="size-4" />
                Delete
              </DropdownMenuItem>
            )}
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
  canDelete,
  selected,
  onToggle,
}: {
  item: MediaItem
  onDelete: (item: MediaItem) => void
  onPreview: (item: MediaItem) => void
  canDelete: boolean
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
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={() => {
          if (!selected) onPreview(item)
        }}
        onKeyDown={(event) => {
          handleCardKeyboard(event, () => {
            if (!selected) onPreview(item)
          })
        }}
      >
        {isImage(mime) ? (
          <img
            src={item.url}
            alt={item.alt ?? item.filename}
            className="h-full w-full object-cover"
          />
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
      {!selected && canDelete && (
        <button
          type="button"
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
  const { timezone } = useSettings()
  const token = localStorage.getItem('plank_token')
  const inputRef = useRef<HTMLInputElement>(null)
  const { user } = useAuth()
  const permissions = user?.permissions ?? []
  const canWriteMedia = permissions.includes('*') || permissions.includes('media:write')
  const canDeleteMedia = permissions.includes('*') || permissions.includes('media:delete')

  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbEntry[]>([{ id: null, name: 'Media' }])
  const currentFolderId = breadcrumb[breadcrumb.length - 1].id
  const [page, setPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    setPage(1)
    setSearchQuery('')
    setDebouncedSearch('')
  }, [currentFolderId])

  const MEDIA_LIMIT = 48

  const {
    data: folderData,
    loading: foldersLoading,
    refetch: refetchFolders,
  } = useFetch<FolderList>(`/cms/admin/folders?parent_id=${currentFolderId ?? ''}`)
  const {
    data: mediaData,
    loading: mediaLoading,
    refetch: refetchMedia,
  } = useFetch<MediaList>(
    `/cms/admin/media?folder_id=${currentFolderId ?? ''}&page=${page}&limit=${MEDIA_LIMIT}${debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ''}`,
  )

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
  const [editCaption, setEditCaption] = useState('')
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
    if (!canWriteMedia) return
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
      toast.success('Upload complete')
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.')
      toast.error('Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleDrop(e: React.DragEvent) {
    if (!canWriteMedia) return
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
      toast.success('Upload complete')
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.')
      toast.error('Upload failed')
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
    if (!canWriteMedia) return
    if (!newFolderName.trim()) return
    try {
      await folderRequest('/cms/admin/folders', 'POST', {
        name: newFolderName.trim(),
        parent_id: currentFolderId,
      })
      setNewFolderOpen(false)
      setNewFolderName('')
      refetchFolders()
      toast.success('Folder created')
    } catch {
      toast.error('Could not create folder')
    }
  }

  async function handleRenameFolder() {
    if (!canWriteMedia) return
    if (!folderToRename || !renameValue.trim()) return
    try {
      await folderRequest(`/cms/admin/folders/${folderToRename.id}`, 'PATCH', {
        name: renameValue.trim(),
      })
      setFolderToRename(null)
      refetchFolders()
      toast.success('Folder renamed')
    } catch {
      toast.error('Could not rename folder')
    }
  }

  async function handleDeleteFolder() {
    if (!canDeleteMedia) return
    if (!folderToDelete) return
    try {
      await request(`/cms/admin/folders/${folderToDelete.id}`, 'DELETE')
      setFolderToDelete(null)
      refetchFolders()
      toast.success('Folder deleted')
    } catch {
      toast.error('Could not delete folder')
    }
  }

  // Media CRUD

  async function handleDeleteMedia() {
    if (!canDeleteMedia) return
    if (!toDelete) return
    try {
      await request(`/cms/admin/media/${toDelete.id}`, 'DELETE')
      setToDelete(null)
      refetchMedia()
      toast.success('File deleted')
    } catch {
      toast.error('Could not delete file')
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

  function openPreview(item: MediaItem) {
    setPreview(item)
    setEditFilename(item.filename)
    setEditAlt(item.alt ?? buildDefaultAlt(item.filename))
    setEditCaption(item.caption ?? '')
    setEditError(null)
  }

  function stepPreview(direction: -1 | 1) {
    if (!preview) return
    const currentIndex = items.findIndex((item) => item.id === preview.id)
    if (currentIndex === -1) return
    const nextItem = items[currentIndex + direction]
    if (!nextItem) return
    openPreview(nextItem)
  }

  async function handleSavePreview() {
    if (!preview) return
    setEditSaving(true)
    setEditError(null)
    try {
      const res = await fetch(`/cms/admin/media/${preview.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          filename: editFilename || preview.filename,
          alt: editAlt.trim() || null,
          caption: editCaption.trim() || null,
        }),
      })
      if (!res.ok) throw new Error('Save failed.')
      const updated = (await res.json()) as MediaItem
      openPreview(updated)
      refetchMedia()
      toast.success('File updated')
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Save failed.')
      toast.error('Could not update file')
    } finally {
      setEditSaving(false)
    }
  }

  function handleFilenameChange(nextFilename: string) {
    setEditFilename(nextFilename)
    const previousDefaultAlt = buildDefaultAlt(editFilename)
    const nextDefaultAlt = buildDefaultAlt(nextFilename)
    if (!editAlt.trim() || editAlt === previousDefaultAlt) {
      setEditAlt(nextDefaultAlt)
    }
  }

  const folders = folderData?.folders ?? []
  const items = mediaData?.items ?? []
  const previewIndex = preview ? items.findIndex((item) => item.id === preview.id) : -1
  const hasPreviousPreview = previewIndex > 0
  const hasNextPreview = previewIndex !== -1 && previewIndex < items.length - 1
  const allKeys = [...folders.map((f) => `folder:${f.id}`), ...items.map((i) => i.id)]

  useEffect(() => {
    if (!preview) return

    function handlePreviewKeydown(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft' && hasPreviousPreview) {
        event.preventDefault()
        stepPreview(-1)
      }
      if (event.key === 'ArrowRight' && hasNextPreview) {
        event.preventDefault()
        stepPreview(1)
      }
    }

    window.addEventListener('keydown', handlePreviewKeydown)
    return () => window.removeEventListener('keydown', handlePreviewKeydown)
  }, [preview, hasPreviousPreview, hasNextPreview, items])

  async function handleBulkDelete() {
    if (!canDeleteMedia) return
    if (bulkLoading) return
    setBulkLoading(true)
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
      toast.success('Files deleted')
      setBulkConfirmDelete(false)
      setSelected(new Set())
      refetch()
    } catch {
      toast.error('Could not delete files')
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
          <h1 className="text-2xl font-semibold -mt-2">Media Library</h1>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setNewFolderName('')
                setNewFolderOpen(true)
              }}
              disabled={!canWriteMedia}
            >
              <FolderPlusIcon className="size-4" />
              New folder
            </Button>
            <Button
              onClick={() => inputRef.current?.click()}
              disabled={uploading || !canWriteMedia}
            >
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
                <React.Fragment key={`${entry.id ?? 'root'}:${entry.name}`}>
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

        {/* Toolbar */}
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-2">
          <div className="relative max-w-72 w-full">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9 h-8 bg-background"
              placeholder="Search media…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {!mediaLoading && mediaData != null && (
            <span className="text-sm text-muted-foreground">
              {items.length} / {mediaData.total} {mediaData.total === 1 ? 'file' : 'files'}
            </span>
          )}
          <div className="ml-auto flex h-8 items-center gap-2">
            {selected.size > 0 ? (
              <>
                <span className="text-sm font-medium">{selected.size} selected</span>
                <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
                {canDeleteMedia && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={bulkLoading}
                    onClick={() => setBulkConfirmDelete(true)}
                  >
                    <Trash2Icon className="size-3.5" />
                    Delete
                  </Button>
                )}
              </>
            ) : !empty && !loading ? (
              <button
                type="button"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setSelected(new Set(allKeys))}
              >
                <Checkbox checked={false} aria-hidden className="pointer-events-none" />
                Select all
              </button>
            ) : null}
          </div>
        </div>

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
            onClick={() => canWriteMedia && inputRef.current?.click()}
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
                    canDelete={canDeleteMedia}
                    canRename={canWriteMedia}
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
                    onPreview={openPreview}
                    canDelete={canDeleteMedia}
                    selected={selected.has(item.id)}
                    onToggle={toggleOne}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Pagination */}
        {(mediaData?.pages ?? 0) > 1 && (
          <div className="mt-4">
            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => { e.preventDefault(); if (page > 1) setPage(page - 1) }}
                    aria-disabled={page === 1}
                    className={page === 1 ? 'pointer-events-none opacity-50' : ''}
                  />
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => { e.preventDefault(); if (page < (mediaData?.pages ?? 1)) setPage(page + 1) }}
                    aria-disabled={page === (mediaData?.pages ?? 1)}
                    className={page === (mediaData?.pages ?? 1) ? 'pointer-events-none opacity-50' : ''}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}

        {/* Preview */}
        <Dialog
          open={!!preview}
          onOpenChange={(o) => {
            if (!o) {
              setPreview(null)
              setEditError(null)
              setEditCaption('')
            }
          }}
        >
          <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-hidden p-0">
            <DialogHeader>
              <DialogTitle className="truncate px-6 pt-6 pr-12" title={preview?.filename}>
                {preview?.filename}
              </DialogTitle>
            </DialogHeader>
            {preview && (
              <div className="grid max-h-[calc(90vh-4rem)] min-h-0 gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="relative flex min-h-0 items-center justify-center overflow-hidden bg-muted/30 px-6 py-4">
                  <div className="flex h-full w-full min-h-[280px] items-center justify-center overflow-hidden rounded-xl border bg-background/70 p-4">
                    <MediaPreviewContent item={preview} />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="absolute left-8 top-1/2 size-10 -translate-y-1/2 rounded-full shadow-sm"
                    onClick={() => stepPreview(-1)}
                    disabled={!hasPreviousPreview}
                    aria-label="Previous file"
                  >
                    <ChevronLeftIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="absolute right-8 top-1/2 size-10 -translate-y-1/2 rounded-full shadow-sm"
                    onClick={() => stepPreview(1)}
                    disabled={!hasNextPreview}
                    aria-label="Next file"
                  >
                    <ChevronRightIcon className="size-4" />
                  </Button>
                </div>
                <div className="flex min-h-0 flex-col border-t lg:border-l lg:border-t-0">
                  <div className="grid grid-cols-2 gap-3 border-b px-6 py-4 text-xs text-muted-foreground">
                    <div>
                      <p className="mb-1 font-medium text-foreground">Type</p>
                      <p className="break-all">{preview.mime_type ?? '—'}</p>
                    </div>
                    <div>
                      <p className="mb-1 font-medium text-foreground">Size</p>
                      <p>{formatBytes(preview.size ?? null)}</p>
                    </div>
                    <div>
                      <p className="mb-1 font-medium text-foreground">Dimensions</p>
                      <p>
                        {preview.width && preview.height
                          ? `${preview.width} × ${preview.height}`
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 font-medium text-foreground">Created</p>
                      <p>{formatDatetime(preview.created_at, timezone)}</p>
                    </div>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Filename</Label>
                      <Input
                        value={editFilename}
                        onChange={(e) => handleFilenameChange(e.target.value)}
                        placeholder={preview.filename}
                        className="text-sm"
                        disabled={!canWriteMedia}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Alt text</Label>
                      <Input
                        value={editAlt}
                        onChange={(e) => setEditAlt(e.target.value)}
                        placeholder={buildDefaultAlt(editFilename || preview.filename)}
                        className="text-sm"
                        disabled={!canWriteMedia}
                      />
                      <p className="text-xs text-muted-foreground">
                        Defaulted from the filename without extension. You can override it.
                      </p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Subtitle</Label>
                      <Textarea
                        value={editCaption}
                        onChange={(e) => setEditCaption(e.target.value)}
                        placeholder="Used as figcaption in the frontend…"
                        className="min-h-28 resize-none text-sm"
                        disabled={!canWriteMedia}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 pt-2">
                      <a
                        href={preview.url}
                        target="_blank"
                        rel="noreferrer"
                        download={preview.filename}
                      >
                        <Button variant="outline" size="sm" type="button">
                          <DownloadIcon className="size-3.5" />
                          Download
                        </Button>
                      </a>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleSavePreview}
                        disabled={editSaving || !canWriteMedia}
                      >
                        {editSaving ? 'Saving…' : 'Save'}
                      </Button>
                    </div>
                    {editError && <p className="text-xs text-destructive">{editError}</p>}
                  </div>
                </div>
              </div>
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
            />
            {folderSaveError && <p className="text-sm text-destructive">{folderSaveError}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewFolderOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateFolder}
                disabled={folderSaving || !newFolderName.trim() || !canWriteMedia}
              >
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
            />
            {folderSaveError && <p className="text-sm text-destructive">{folderSaveError}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setFolderToRename(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleRenameFolder}
                disabled={folderSaving || !renameValue.trim() || !canWriteMedia}
              >
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
              <Button
                variant="destructive"
                onClick={handleDeleteMedia}
                disabled={deleting || !canDeleteMedia}
              >
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
              <Button
                variant="destructive"
                onClick={handleDeleteFolder}
                disabled={deleting || !canDeleteMedia}
              >
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
