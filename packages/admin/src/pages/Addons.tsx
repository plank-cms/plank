import { Outlet } from 'react-router-dom'
import { AddonsSidebar } from '@/components/sidebars/AddonsSidebar.tsx'
import { useSecondaryPanel } from '@/hooks/useSecondaryPanel.ts'

export function Addons() {
  useSecondaryPanel(<AddonsSidebar />)

  return <Outlet />
}
