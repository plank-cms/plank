import { useRef, useState } from 'react'
import { UploadIcon, FileIcon, Trash2Icon } from 'lucide-react'
import { useFetch } from '@/hooks/useFetch.ts'
import { useApi } from '@/hooks/useApi.ts'
import { Button } from '@/components/ui/button.tsx'
import { Spinner } from '@/components/ui/spinner.tsx'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog.tsx'

type MediaItem = {
  id: string
  filename: string
  url: string
  mime_type: string | null
  size: number | null
  created_at: string
}

type MediaList = {
  items: MediaItem[]
  total: number
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImage(mimeType: string | null): boolean {
  return !!mimeType?.startsWith('image/')
}

function MediaCard({ item, onDelete }: { item: MediaItem; onDelete: (item: MediaItem) => void }) {
  return (
    <div className="group relative rounded-lg border bg-card overflow-hidden">
      <div className="aspect-square bg-muted flex items-center justify-center">
        {isImage(item.mime_type) ? (
          <img src={item.url} alt={item.filename} className="h-full w-full object-cover" />
        ) : (
          <FileIcon className="size-10 text-muted-foreground" />
        )}
      </div>
      <button
        onClick={() => onDelete(item)}
        className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-md bg-background/80 text-muted-foreground opacity-0 backdrop-blur-sm transition-opacity hover:text-destructive group-hover:opacity-100"
      >
        <Trash2Icon className="size-3.5" />
      </button>
      <div className="p-2">
        <p className="text-xs font-medium truncate" title={item.filename}>
          {item.filename}
        </p>
        <p className="text-xs text-muted-foreground">{formatBytes(item.size)}</p>
      </div>
    </div>
  )
}

export function MediaLibrary() {
  const { data, loading, refetch } = useFetch<MediaList>('/cms/admin/media')
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<MediaItem | null>(null)
  const { loading: deleting, error: deleteError, request } = useApi()

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setUploadError(null)

    const token = localStorage.getItem('plank_token')

    try {
      for (const file of Array.from(files)) {
        const body = new FormData()
        body.append('file', file)

        const res = await fetch('/cms/admin/media', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
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
      }
      refetch()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }

  async function handleDelete() {
    if (!toDelete) return
    try {
      await request(`/cms/admin/media/${toDelete.id}`, 'DELETE')
      setToDelete(null)
      refetch()
    } catch {
      /* error shown via deleteError */
    }
  }

  const items = data?.items ?? []

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Media Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data ? `${data.total} file${data.total !== 1 ? 's' : ''}` : ''}
          </p>
        </div>
        <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <Spinner className="size-4" /> : <UploadIcon className="size-4" />}
          {uploading ? 'Uploading…' : 'Upload'}
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {uploadError && <p className="mb-4 text-sm text-destructive">{uploadError}</p>}

      {loading ? (
        <div className="flex items-center gap-2 py-16 justify-center text-muted-foreground">
          <Spinner className="size-5" />
        </div>
      ) : items.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <UploadIcon className="size-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">Drop files here or click to upload</p>
          <p className="text-xs text-muted-foreground mt-1">Images, documents, and more</p>
        </div>
      ) : (
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          {items.map((item) => (
            <MediaCard key={item.id} item={item} onDelete={setToDelete} />
          ))}
        </div>
      )}

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
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
