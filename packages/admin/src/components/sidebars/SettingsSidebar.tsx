import { Settings2Icon, UsersRoundIcon, ShieldIcon, KeyRoundIcon, WebhookIcon } from 'lucide-react'
import { useAuth } from '@/context/auth.tsx'
import { SidebarNav } from './SidebarNav.tsx'

function hasPermission(user: { permissions: string[] } | null, permission: string): boolean {
  return user?.permissions.includes('*') || user?.permissions.includes(permission) || false
}

export function SettingsSidebar() {
  const { user } = useAuth()

  const items = [
    { label: 'Overview',    to: '/settings/overview',   icon: Settings2Icon, permission: 'settings:read' },
    { label: 'Users',       to: '/settings/users',      icon: UsersRoundIcon, permission: 'users:read' },
    { label: 'Roles',       to: '/settings/roles',      icon: ShieldIcon,    permission: 'users:read' },
    { label: 'API Tokens',  to: '/settings/api-tokens', icon: KeyRoundIcon,  permission: 'api-tokens:read' },
    { label: 'Webhooks',    to: '/settings/webhooks',   icon: WebhookIcon,   permission: 'webhooks:read' },
  ].filter(({ permission }) => hasPermission(user, permission))

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
