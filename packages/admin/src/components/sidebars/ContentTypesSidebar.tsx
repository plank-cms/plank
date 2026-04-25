import { useEffect } from 'react'
import { PlusIcon, FileIcon } from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useFetch } from '@/hooks/useFetch.ts'
import { Button } from '@/components/ui/button.tsx'
import { Spinner } from '@/components/ui/spinner.tsx'

type ContentType = {
  id: string
  name: string
  slug: string
  kind: 'collection' | 'single'
}

export function ContentTypesSidebar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { data, loading, error, refetch } = useFetch<ContentType[]>('/cms/admin/content-types')

  useEffect(() => {
    window.addEventListener('plank:content-types-changed', refetch)
    return () => window.removeEventListener('plank:content-types-changed', refetch)
  }, [refetch])

  function isActive(slug: string) {
    const to = `/content-types/${slug}`
    return pathname === to || pathname.startsWith(to + '/')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-sidebar-border px-4 py-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Content Types
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-6">
            <Spinner className="size-4" />
          </div>
        )}
        {error && (
          <p className="px-4 py-3 text-xs text-destructive">{error}</p>
        )}
        {!loading && !error && (data ?? []).length === 0 && (
          <p className="px-4 py-3 text-xs text-muted-foreground">No content types yet.</p>
        )}
        {!loading && !error && (data ?? []).length > 0 && (
          <nav className="flex flex-col gap-0.5 p-2">
            {(data ?? []).map((ct) => (
              <NavLink
                key={ct.slug}
                to={`/content-types/${ct.slug}`}
                className={[
                  'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                  isActive(ct.slug)
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
                ].join(' ')}
              >
                <span className="min-w-0 flex-1 truncate">{ct.name}</span>
                {ct.kind === 'single' && (
                  <FileIcon className="size-3.5 shrink-0 text-violet-500 dark:text-violet-400" />
                )}
              </NavLink>
            ))}
          </nav>
        )}
      </div>

      <div className="border-t border-sidebar-border p-3">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={() => navigate('/content-types/new')}
        >
          <PlusIcon className="size-3.5" />
          New Content Type
        </Button>
      </div>
    </div>
  )
}
