import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboardIcon,
  LayersIcon,
  FileTextIcon,
  ImageIcon,
  Settings2Icon,
  LogOutIcon,
  UserRoundIcon,
} from 'lucide-react'
import { useAuth } from '@/context/auth.tsx'
import { SecondaryPanelProvider, useSecondaryPanelContext } from '@/context/secondaryPanel.tsx'
import { Button } from '@/components/ui/button.tsx'
import { UserAvatar } from '@/components/ui/custom/UserAvatar.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip.tsx'

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboardIcon, label: 'Dashboard', permission: null },
  { to: '/content', icon: FileTextIcon, label: 'Content', permission: null },
  { to: '/media', icon: ImageIcon, label: 'Media', permission: null },
  { to: '/content-types', icon: LayersIcon, label: 'Content Types', permission: 'content-types:read' },
  { to: '/settings', icon: Settings2Icon, label: 'Settings', permission: 'settings:read' },
]


function LayoutShell() {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { content: secondaryPanel } = useSecondaryPanelContext()

  function isActive(to: string) {
    return to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(to + '/')
  }

  const permissions = user?.permissions ?? []
  const visibleNavItems = NAV_ITEMS.filter(({ permission }) =>
    !permission || permissions.includes('*') || permissions.includes(permission),
  )

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-svh overflow-hidden bg-background">
        <aside className="flex h-full w-14 shrink-0 flex-col items-center gap-4 border-r border-sidebar-border bg-sidebar py-4">
          <NavLink to="/">
            <img src={`${import.meta.env.BASE_URL}plank-logo-w.svg`} alt="Plank CMS" className="px-3 pb-4" />
          </NavLink>

          {/* Nav */}
          <nav className="flex flex-1 flex-col items-center gap-1 pt-2">
            {visibleNavItems.map(({ to, icon: IconComponent, label }) => (
              <Tooltip key={to}>
                <TooltipTrigger asChild>
                  <Button asChild size="icon" variant={isActive(to) ? 'secondary' : 'ghost'}>
                    <NavLink to={to} end={to === '/'}>
                      <IconComponent className="size-4" />
                    </NavLink>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            ))}
          </nav>

          {/* User avatar */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <UserAvatar
                  avatarUrl={user?.avatarUrl}
                  firstName={user?.firstName}
                  lastName={user?.lastName}
                  email={user?.email}
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-52">
              <DropdownMenuLabel className="font-normal">
                <p className="truncate text-sm font-medium">{user?.email}</p>
                <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/profile')}>
                <UserRoundIcon />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={logout}
                className="text-destructive focus:text-destructive"
              >
                <LogOutIcon />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </aside>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl w-full mx-auto px-4 py-3 mb-16">
            <Outlet />
          </div>
        </main>

        {secondaryPanel && (
          <aside className="flex h-full w-64 shrink-0 flex-col border-l border-sidebar-border bg-background">
            {secondaryPanel}
          </aside>
        )}
      </div>
    </TooltipProvider>
  )
}

export function Layout() {
  return (
    <SecondaryPanelProvider>
      <LayoutShell />
    </SecondaryPanelProvider>
  )
}
