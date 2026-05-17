import React, { useRef, useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  UploadIcon,
  Trash2Icon,
  FolderPlusIcon,
  HomeIcon,
  SearchIcon,
} from 'lucide-react'
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/shared/ui/breadcrumb.tsx'
import { useFetch } from '@/shared/hooks/useFetch.ts'
import { useAuth } from '@/shared/context/auth.tsx'
import { uploadMediaFile } from '@/shared/lib/uploadMedia.ts'
import { useApi } from '@/shared/hooks/useApi.ts'
import { Button } from '@/shared/ui/button.tsx'
import { Checkbox } from '@/shared/ui/checkbox.tsx'
import { Spinner } from '@/shared/ui/spinner.tsx'
import { Input } from '@/shared/ui/input.tsx'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/ui/dialog.tsx'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/shared/ui/pagination.tsx'
import HeaderFixed from '@/shared/components/Header'
import { useSettings } from '@/shared/context/settings.tsx'
import { FolderCard } from './components/FolderCard.tsx'
import { MediaCard } from './components/MediaCard.tsx'
import { MediaPreviewDialog } from './components/MediaPreviewDialog.tsx'
import { buildDefaultAlt, readFSEntry } from './lib/media.ts'
import type { BreadcrumbEntry, Folder, FolderList, MediaItem, MediaList } from './types.ts'

export function MediaLibrary() {
  const { timezone } = useSettings()
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
      const body = new FormData()
      for (const { file, relativePath } of filesWithPaths) {
        body.append('files', file, relativePath)
      }
      if (currentFolderId) body.append('folder_id', currentFolderId)
      body.append('bundle', 'true')
      const res = await fetch('/cms/admin/media', {
        method: 'POST',
        credentials: 'include',
        body,
      })
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
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
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
    try {
      await Promise.all([
        ...[...selected]
          .filter((k) => k.startsWith('folder:'))
          .map((k) =>
            fetch(`/cms/admin/folders/${k.slice(7)}`, {
              method: 'DELETE',
              credentials: 'include',
            }),
          ),
        ...[...selected]
          .filter((k) => !k.startsWith('folder:'))
          .map((k) =>
            fetch(`/cms/admin/media/${k}`, {
              method: 'DELETE',
              credentials: 'include',
            }),
          ),
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
        <MediaPreviewDialog
          preview={preview}
          onOpenChange={(open) => {
            if (open) return
            setPreview(null)
            setEditError(null)
            setEditCaption('')
          }}
          hasPreviousPreview={hasPreviousPreview}
          hasNextPreview={hasNextPreview}
          stepPreview={stepPreview}
          timezone={timezone}
          editFilename={editFilename}
          onFilenameChange={handleFilenameChange}
          editAlt={editAlt}
          onAltChange={setEditAlt}
          editCaption={editCaption}
          onCaptionChange={setEditCaption}
          editSaving={editSaving}
          editError={editError}
          canWriteMedia={canWriteMedia}
          onSave={handleSavePreview}
        />

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
