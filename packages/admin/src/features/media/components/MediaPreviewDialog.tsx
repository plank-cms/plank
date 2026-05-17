import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon } from 'lucide-react'
import { Button } from '@/shared/ui/button.tsx'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog.tsx'
import { Input } from '@/shared/ui/input.tsx'
import { Label } from '@/shared/ui/label.tsx'
import { Textarea } from '@/shared/ui/textarea.tsx'
import { formatDatetime } from '@/shared/lib/formatDate.ts'
import { buildDefaultAlt, formatBytes } from '../lib/media.ts'
import type { MediaItem } from '../types.ts'
import { MediaPreviewContent } from './MediaPreviewContent.tsx'

type MediaPreviewDialogProps = {
  preview: MediaItem | null
  onOpenChange: (open: boolean) => void
  hasPreviousPreview: boolean
  hasNextPreview: boolean
  stepPreview: (direction: -1 | 1) => void
  timezone: string
  editFilename: string
  onFilenameChange: (value: string) => void
  editAlt: string
  onAltChange: (value: string) => void
  editCaption: string
  onCaptionChange: (value: string) => void
  editSaving: boolean
  editError: string | null
  canWriteMedia: boolean
  onSave: () => void
}

export function MediaPreviewDialog({
  preview,
  onOpenChange,
  hasPreviousPreview,
  hasNextPreview,
  stepPreview,
  timezone,
  editFilename,
  onFilenameChange,
  editAlt,
  onAltChange,
  editCaption,
  onCaptionChange,
  editSaving,
  editError,
  canWriteMedia,
  onSave,
}: MediaPreviewDialogProps) {
  return (
    <Dialog open={!!preview} onOpenChange={onOpenChange}>
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
                    {preview.width && preview.height ? `${preview.width} × ${preview.height}` : '—'}
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
                    onChange={(e) => onFilenameChange(e.target.value)}
                    placeholder={preview.filename}
                    className="text-sm"
                    disabled={!canWriteMedia}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Alt text</Label>
                  <Input
                    value={editAlt}
                    onChange={(e) => onAltChange(e.target.value)}
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
                    onChange={(e) => onCaptionChange(e.target.value)}
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
                    onClick={onSave}
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
  )
}
