import { useEffect, useState } from 'react'
import type { ContentType, EntriesResponse, RecentEntry } from '../types.ts'

type Status = 'draft' | 'scheduled'
type DashboardEntries = { userId: string; entries: RecentEntry[] }

async function fetchEntries(
  contentType: ContentType,
  status: Status,
  locale: string,
  signal: AbortSignal,
): Promise<RecentEntry[]> {
  const params = new URLSearchParams({ status, displayLocale: locale })
  const endpoint = `/cms/admin/content-types/${contentType.slug}/dashboard-entries`
  const entries: RecentEntry[] = []
  let page = 1
  let total: number

  do {
    params.set('page', String(page++))
    const response = await fetch(`${endpoint}?${params}`, { credentials: 'include', signal })
    if (!response.ok) break
    const result = (await response.json()) as EntriesResponse
    if (!result.data.length) break
    total = result.total
    entries.push(
      ...result.data.map((entry) => ({
        ...entry,
        slug: contentType.slug,
        contentTypeName: contentType.name,
      })),
    )
  } while (status === 'scheduled' && entries.length < total)

  return entries
}

export function useDashboardEntries(
  contentTypes: ContentType[] | null,
  userId: string | undefined,
  locale: string,
  status: Status,
) {
  const [result, setResult] = useState<DashboardEntries>()

  useEffect(() => {
    if (!userId || !contentTypes?.length) return
    const controller = new AbortController()
    const { signal } = controller

    Promise.allSettled(contentTypes.map((ct) => fetchEntries(ct, status, locale, signal))).then(
      (results) => {
        if (signal.aborted) return
        const rows = results.flatMap((response) =>
          response.status === 'fulfilled' ? response.value : [],
        )
        const entries =
          status === 'scheduled'
            ? rows.sort(
                (a, b) =>
                  (a.scheduled_for ? Date.parse(a.scheduled_for) : Infinity) -
                  (b.scheduled_for ? Date.parse(b.scheduled_for) : Infinity),
              )
            : rows.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)).slice(0, 7)
        setResult({ userId, entries })
      },
    )
    return () => controller.abort()
  }, [contentTypes, userId, locale, status])

  return result && result.userId === userId && contentTypes?.length ? result.entries : []
}
