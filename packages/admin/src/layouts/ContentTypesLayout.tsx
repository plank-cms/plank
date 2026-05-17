import { Outlet } from 'react-router-dom'
import { useSecondaryPanel } from '@/shared/hooks/useSecondaryPanel.ts'
import { ContentTypesSidebar } from '@/shared/components/sidebars/ContentTypesSidebar.tsx'

export function ContentTypesLayout() {
  useSecondaryPanel(<ContentTypesSidebar />)
  return <Outlet />
}
