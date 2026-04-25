import { Settings2Icon, UsersRoundIcon, ShieldIcon, KeyRoundIcon, WebhookIcon } from 'lucide-react'
import { useAuth } from '@/context/auth.tsx'
import { SidebarNav } from './SidebarNav.tsx'

const BASE_ITEMS = [
  { label: 'Overview', to: '/settings/overview', icon: Settings2Icon },
  { label: 'Users', to: '/settings/users', icon: UsersRoundIcon },
]
const SUPER_ADMIN_ITEMS = [
  { label: 'Roles', to: '/settings/roles', icon: ShieldIcon },
  { label: 'API Tokens', to: '/settings/api-tokens', icon: KeyRoundIcon },
  { label: 'Webhooks', to: '/settings/webhooks', icon: WebhookIcon },
]

export function SettingsSidebar() {
  const { user } = useAuth()
  const isSuperAdmin = user?.role.toLowerCase() === 'super admin'
  const items = isSuperAdmin ? [...BASE_ITEMS, ...SUPER_ADMIN_ITEMS] : BASE_ITEMS

  return (
    <div className="flex flex-col">
      <div className="border-b border-sidebar-border px-4 py-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Settings
        </p>
      </div>
      <SidebarNav items={items} />
    </div>
  )
}
