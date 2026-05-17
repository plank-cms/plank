import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayersIcon } from 'lucide-react'
import { useFetch } from '@/shared/hooks/useFetch.ts'
import { Button } from '@/shared/ui/button.tsx'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/shared/ui/empty.tsx'

type ContentType = { slug: string }

export function ContentTypesIndex() {
  const navigate = useNavigate()
  const { data, loading } = useFetch<ContentType[]>('/cms/admin/content-types')

  useEffect(() => {
    if (data && data.length > 0) {
      navigate(`/content-types/${data[0].slug}`, { replace: true })
    }
  }, [data, navigate])

  if (loading || (data && data.length > 0)) return null

  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LayersIcon />
        </EmptyMedia>
        <EmptyTitle>No content types yet</EmptyTitle>
        <EmptyDescription>
          Content types define the structure of your data. Create your first one to start managing content.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => navigate('/content-types/new')}>
          Create content type
        </Button>
      </EmptyContent>
    </Empty>
  )
}
