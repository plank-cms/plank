import { StarIcon } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { useFetch } from '@/hooks/useFetch.ts'
import { useApi } from '@/hooks/useApi.ts'
import { Spinner } from '@/components/ui/spinner.tsx'

type ContentType = {
  slug: string
  name: string
  kind: 'collection' | 'single'
  isDefault: boolean
}

export function ContentSidebar() {
  const { pathname } = useLocation()
  const { data, loading, error, refetch } = useFetch<ContentType[]>('/cms/admin/content-types')
  const { request } = useApi<ContentType>()

  async function handleSetDefault(e: React.MouseEvent, slug: string) {
    e.preventDefault()
    e.stopPropagation()
    await request(`/cms/admin/content-types/${slug}/default`, 'PUT')
    refetch()
  }

  function isActive(slug: string) {
    return pathname === `/content/${slug}` || pathname.startsWith(`/content/${slug}/`)
  }

  const collections = (data ?? []).filter((ct) => ct.kind === 'collection')
  const singles = (data ?? []).filter((ct) => ct.kind === 'single')

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-sidebar-border px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Content
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-6">
          <Spinner className="size-4" />
        </div>
      )}
      {error && (
        <p className="px-4 py-3 text-xs text-destructive">{error}</p>
      )}

      {!loading && !error && (
        <>
          {/* Collection Types */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 px-4 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                Collection Types
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {collections.length === 0 ? (
                <p className="px-4 pb-3 text-xs text-muted-foreground">No collection types yet.</p>
              ) : (
                <nav className="flex flex-col gap-0.5 px-2 pb-2">
                  {collections.map((ct) => (
                    <NavLink
                      key={ct.slug}
                      to={`/content/${ct.slug}`}
                      className={[
                        'group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                        isActive(ct.slug)
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
                      ].join(' ')}
                    >
                      <span className="min-w-0 flex-1 truncate">{ct.name}</span>
                      <button
                        type="button"
                        title={ct.isDefault ? 'Default content type' : 'Set as default'}
                        onClick={(e) => handleSetDefault(e, ct.slug)}
                        className={[
                          'shrink-0 rounded transition-colors',
                          ct.isDefault
                            ? 'text-amber-400'
                            : 'text-transparent group-hover:text-muted-foreground/40 hover:!text-amber-400',
                        ].join(' ')}
                      >
                        <StarIcon className={`size-3.5 ${ct.isDefault ? 'fill-amber-400' : ''}`} />
                      </button>
                    </NavLink>
                  ))}
                </nav>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t border-sidebar-border" />

          {/* Single Types */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 px-4 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                Single Types
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {singles.length === 0 ? (
                <p className="px-4 pb-3 text-xs text-muted-foreground">No single types yet.</p>
              ) : (
                <nav className="flex flex-col gap-0.5 px-2 pb-2">
                  {singles.map((ct) => (
                    <NavLink
                      key={ct.slug}
                      to={`/content/${ct.slug}`}
                      className={[
                        'group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                        isActive(ct.slug)
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
                      ].join(' ')}
                    >
                      <span className="min-w-0 flex-1 truncate">{ct.name}</span>
                    </NavLink>
                  ))}
                </nav>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
