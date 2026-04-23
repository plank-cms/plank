import { PlusIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useFetch } from '@/hooks/useFetch.ts'
import { SidebarNav } from './SidebarNav.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Spinner } from '@/components/ui/spinner.tsx'

type ContentType = {
  id: string
  name: string
  slug: string
}

export function ContentTypesSidebar() {
  const navigate = useNavigate()
  const { data, loading, error } = useFetch<ContentType[]>('/cms/admin/content-types')

  const items = (data ?? []).map((ct) => ({
    label: ct.name,
    to: `/content-types/${ct.slug}`,
  }))

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
        {!loading && !error && items.length === 0 && (
          <p className="px-4 py-3 text-xs text-muted-foreground">No content types yet.</p>
        )}
        {!loading && !error && items.length > 0 && (
          <SidebarNav items={items} />
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
