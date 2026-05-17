import { useEffect, useState } from 'react'
import { FileIcon, ImageIcon } from 'lucide-react'

export function MediaThumbnail({ value }: { value: string }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (value.startsWith('http')) {
      setUrl(value)
      return
    }
    fetch(`/cms/admin/media/${value}/url`, { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<{ url: string }>) : null))
      .then((data) => setUrl(data?.url ?? null))
      .catch(() => {})
  }, [value])

  if (!url) {
    return <ImageIcon className="size-4 text-muted-foreground" />
  }

  const isImage = /\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i.test(url)
  if (isImage) {
    return <img src={url} alt="" className="size-8 object-cover" />
  }

  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <FileIcon className="size-3.5 shrink-0" />
      <span className="max-w-30 truncate">File</span>
    </span>
  )
}
