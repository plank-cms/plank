import { useEffect, useRef } from 'react'

export function HLSVideoPlayer({ url }: { url: string }) {
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
