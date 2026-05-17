import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card.tsx'
import type { ContentType, DashboardStats as DashboardStatsType } from '../types.ts'

type DashboardStatsProps = {
  contentTypes: ContentType[] | undefined
  collectionCount: number
  singleCount: number
  stats: DashboardStatsType | null
}

export function DashboardStats({
  contentTypes,
  collectionCount,
  singleCount,
  stats,
}: DashboardStatsProps) {
  return (
    <section className="mt-24 grid grid-cols-2 gap-4 lg:grid-cols-4">
      {[
        {
          label: 'Entries',
          value: stats?.totalEntries ?? '—',
          context: contentTypes ? `${collectionCount} Content Types` : '—',
        },
        {
          label: 'Content Types',
          value: contentTypes?.length ?? '—',
          context: contentTypes ? `${collectionCount} Collection · ${singleCount} Single` : '—',
        },
        {
          label: 'Drafts',
          value: stats?.totalDrafts ?? '—',
          context: stats ? `${stats.myDrafts} owned by you` : '—',
        },
        {
          label: 'Scheduled',
          value: stats?.totalScheduled ?? '—',
          context: stats ? `${stats.myScheduled} owned by you` : '—',
        },
      ].map(({ label, value, context }) => (
        <Card key={label} className="bg-background">
          <CardHeader>
            <CardTitle className="text-base font-bold uppercase">{label}</CardTitle>
            <div className="text-3xl font-bold">{value}</div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{context}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  )
}
