import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Spinner } from '@/components/ui/spinner.tsx'
import { useFetch } from '@/hooks/useFetch.ts'
import { EntriesList } from './EntriesList.tsx'

type ContentType = { kind: 'collection' | 'single' }
type SingleEntry = { id: string }

export function ContentSlugIndex() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()

  const { data: ct, loading: loadingCt } = useFetch<ContentType>(
    slug ? `/cms/admin/content-types/${slug}` : null
  )

  const isSingle = ct?.kind === 'single'

  const { data: entry, loading: loadingEntry, error: entryError } = useFetch<SingleEntry>(
    isSingle && slug ? `/cms/admin/content-types/${slug}/single` : null
  )

  useEffect(() => {
    if (!isSingle) return
    if (loadingEntry) return
    if (entry) {
      navigate(`/content/${slug}/${entry.id}`, { replace: true })
    } else if (entryError) {
      navigate(`/content/${slug}/new`, { replace: true })
    }
  }, [isSingle, loadingEntry, entry, entryError, slug, navigate])

  if (loadingCt || (isSingle && loadingEntry)) {
    return (
      <div className="flex items-center gap-2 py-12 text-muted-foreground">
        <Spinner className="size-4" />
        <span className="text-sm">Loading…</span>
      </div>
    )
  }

  if (!isSingle) return <EntriesList />

  return null
}
