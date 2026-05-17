import { Outlet } from 'react-router-dom'
import { AddonsSidebar } from '@/shared/components/sidebars/AddonsSidebar.tsx'
import { useSecondaryPanel } from '@/shared/hooks/useSecondaryPanel.ts'

export function AddonsLayout() {
  useSecondaryPanel(<AddonsSidebar />)

  return <Outlet />
}
