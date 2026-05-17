import { Outlet } from 'react-router-dom'
import { useSecondaryPanel } from '@/shared/hooks/useSecondaryPanel.ts'
import { SettingsSidebar } from '@/shared/components/sidebars/SettingsSidebar.tsx'

export function SettingsLayout() {
  useSecondaryPanel(<SettingsSidebar />)

  return <Outlet />
}
