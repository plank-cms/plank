import { Outlet } from 'react-router-dom'
import { useSecondaryPanel } from '@/shared/hooks/useSecondaryPanel.ts'
import { ContentSidebar } from '@/shared/components/sidebars/ContentSidebar.tsx'

export function ContentLayout() {
  useSecondaryPanel(<ContentSidebar />)
  return <Outlet />
}
