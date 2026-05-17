import {
  DownloadIcon,
  FileAudioIcon,
  FileTextIcon,
} from 'lucide-react'
import { Button } from '@/shared/ui/button.tsx'
import { isAudio, isHLS, isImage, isPDF, isVideo } from '../lib/media.ts'
import type { MediaItem } from '../types.ts'
import { HLSVideoPlayer } from './HLSVideoPlayer.tsx'

export function MediaPreviewContent({ item }: { item: MediaItem }) {
  const mime = item.mime_type?.toLowerCase() ?? null

  if (isImage(mime)) {
    return (
      <img
        src={item.url}
        alt={item.alt ?? item.filename}
        className="max-h-full max-w-full rounded-md object-contain"
      />
    )
  }

  if (isHLS(item.url, mime)) return <HLSVideoPlayer url={item.url} />

  if (isVideo(mime)) {
    return (
      <video
        src={item.url}
        controls
        preload="none"
        className="max-h-[70vh] w-full rounded-md bg-zinc-950"
      />
    )
  }

  if (isAudio(mime)) {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <FileAudioIcon className="size-14 text-muted-foreground" />
        <audio src={item.url} controls className="w-full" />
      </div>
    )
  }

  if (isPDF(mime)) {
    return (
      <iframe src={item.url} title={item.filename} className="h-[70vh] w-full rounded-md border" />
    )
  }

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
