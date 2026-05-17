import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayersIcon } from 'lucide-react'
import { useFetch } from '@/shared/hooks/useFetch.ts'
import { Button } from '@/shared/ui/button.tsx'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/shared/ui/empty.tsx'

type ContentType = { slug: string; isDefault: boolean }

export function ContentIndex() {
  const navigate = useNavigate()
  const { data, loading } = useFetch<ContentType[]>('/cms/admin/content-types')

  useEffect(() => {
    if (!data || data.length === 0) return
    const target = data.find((ct) => ct.isDefault) ?? data[0]
    navigate(`/content/${target.slug}`, { replace: true })
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
          Create a content type in the Builder before managing content.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => navigate('/content-types/new')}>Go to Builder</Button>
      </EmptyContent>
    </Empty>
  )
}
