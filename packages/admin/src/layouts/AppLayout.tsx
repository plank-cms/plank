import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useFetch } from '@/shared/hooks/useFetch.ts'
import {
  ArrowUpRightIcon,
  ArrowUpIcon,
  CheckIcon,
  CopyIcon,
  LayoutDashboardIcon,
  LayersIcon,
  FileTextIcon,
  ImageIcon,
  PuzzleIcon,
  Settings2Icon,
  LogOutIcon,
  UserRoundIcon,
  PlusIcon,
} from 'lucide-react'
import { useAuth } from '@/shared/context/auth.tsx'
import { SecondaryPanelProvider, useSecondaryPanelContext } from '@/shared/context/secondaryPanel.tsx'
import { useState } from 'react'
import { Button } from '@/shared/ui/button.tsx'
import { UserAvatar } from '@/shared/ui/custom/UserAvatar.tsx'
import { Input } from '@/shared/ui/input.tsx'
import { Label } from '@/shared/ui/label.tsx'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog.tsx'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/shared/ui/tooltip.tsx'

type VersionInfo = {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  changelogUrl: string
  updateCommand: string
  checkedAt: string
}

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboardIcon, label: 'Dashboard', permission: null },
  { to: '/content', icon: FileTextIcon, label: 'Content', permission: null },
  { to: '/media', icon: ImageIcon, label: 'Media', permission: null },
  {
    to: '/content-types',
    icon: LayersIcon,
    label: 'Content Types',
    permission: 'content-types:write',
  },
  { to: '/add-ons', icon: PuzzleIcon, label: 'Add-ons', permission: 'addons:read' },
  { to: '/settings', icon: Settings2Icon, label: 'Settings', permission: 'settings:overview:read' },
]

type ContentType = {
  slug: string
  isDefault?: boolean
  name?: string
  kind?: 'collection' | 'single'
  fields?: unknown[]
}

function parseVersion(value: string): [number, number, number] {
  const [major = 0, minor = 0, patch = 0] = value
    .trim()
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)

  return [major, minor, patch]
}

function getVersionDistance(currentVersion: string, latestVersion: string | null): number {
  if (!latestVersion) return 0

  const [currentMajor, currentMinor, currentPatch] = parseVersion(currentVersion)
  const [latestMajor, latestMinor, latestPatch] = parseVersion(latestVersion)

  if (latestMajor !== currentMajor) {
    return Math.abs(latestMajor - currentMajor) * 100 + Math.abs(latestMinor - currentMinor)
  }

  if (latestMinor !== currentMinor) {
    return Math.abs(latestMinor - currentMinor)
  }

  return Math.abs(latestPatch - currentPatch)
}

function getUpdateTone(distance: number) {
  if (distance >= 5) {
    return {
      panel: 'border-rose-600/20 bg-[#370815] text-rose-600',
      label: 'text-rose-600/80',
      button:
        'border-rose-600/20 bg-[#370815] text-rose-600 hover:bg-[#45101b] hover:text-rose-500',
    }
  }

  if (distance >= 3) {
    return {
      panel: 'border-amber-400/20 bg-[#3b2d08] text-amber-400',
      label: 'text-amber-400/80',
      button:
        'border-amber-400/20 bg-[#3b2d08] text-amber-400 hover:bg-[#4a3809] hover:text-amber-300',
    }
  }

  return {
    panel: 'border-emerald-500/20 bg-[#082019] text-emerald-500',
    label: 'text-emerald-500/80',
    button:
      'border-emerald-500/20 bg-[#082019] text-emerald-500 hover:bg-[#0d2c23] hover:text-emerald-400',
  }
}

function LayoutShell() {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { content: secondaryPanel } = useSecondaryPanelContext()
  const { data: contentTypes } = useFetch<ContentType[]>('/cms/admin/content-types')
  const { data: versionInfo } = useFetch<VersionInfo>('/cms/admin/version')
  const collectionTypes = (contentTypes ?? []).filter((ct) => ct.kind === 'collection')
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false)
  const [commandCopied, setCommandCopied] = useState(false)
  const updateDistance = versionInfo
    ? getVersionDistance(versionInfo.currentVersion, versionInfo.latestVersion)
    : 0
  const updateTone = getUpdateTone(updateDistance)

  function isActive(to: string) {
    return to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(to + '/')
  }

  const permissions = user?.permissions ?? []
  const isViewer = user?.role?.toLowerCase() === 'viewer'
  const visibleNavItems = NAV_ITEMS.filter(
    ({ to, permission }) => {
      if (isViewer) return to === '/content'
      return !permission || permissions.includes('*') || permissions.includes(permission)
    },
  )

  async function handleCopyUpdateCommand() {
    if (!versionInfo?.updateCommand) return

    try {
      await navigator.clipboard.writeText(versionInfo.updateCommand)
      setCommandCopied(true)
      toast.success('Update command copied')
    } catch {
      toast.error('Could not copy the update command')
    }
  }

  function handleUpdateDialogChange(open: boolean) {
    setUpdateDialogOpen(open)
    if (!open) setCommandCopied(false)
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-svh overflow-hidden bg-background">
        <aside className="flex h-full w-14 shrink-0 flex-col items-center gap-4 border-r border-sidebar-border bg-sidebar py-4">
          <NavLink to="/">
            <img
              src={`${import.meta.env.BASE_URL}plank-logo-w.svg`}
              alt="Plank CMS"
              className="px-3 pb-4"
            />
          </NavLink>

          {/* New Entry */}
          {(user?.permissions?.includes('*') || user?.permissions?.includes('entries:write')) &&
            collectionTypes.length > 0 && (
            <div className="mt-4 px-3">
              <Button
                size="icon"
                onClick={() => {
                  const target =
                    collectionTypes.find((ct) => ct.isDefault) ?? collectionTypes[0]
                  if (!target) return
                  navigate(`/content/${target.slug}/new`)
                }}
              >
                <PlusIcon className="size-4" />
              </Button>
            </div>
            )}

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

          {versionInfo?.updateAvailable && (
            <div className="px-3">
              <Dialog open={updateDialogOpen} onOpenChange={handleUpdateDialogChange}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="outline"
                      className={updateTone.button}
                      onClick={() => setUpdateDialogOpen(true)}
                    >
                      <ArrowUpIcon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    Update to {versionInfo.latestVersion}
                  </TooltipContent>
                </Tooltip>

                <DialogContent className="max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Update available</DialogTitle>
                    <DialogDescription>
                      Plank {versionInfo.latestVersion} is ready. Run the command below in your
                      project terminal to update your installation.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-5">
                    <div className={`grid gap-3 rounded-lg border p-4 sm:grid-cols-2 ${updateTone.panel}`}>
                      <div>
                        <p className={`text-xs font-medium uppercase ${updateTone.label}`}>
                          Current version
                        </p>
                        <p className="mt-1 text-base font-semibold">{versionInfo.currentVersion}</p>
                      </div>
                      <div>
                        <p className={`text-xs font-medium uppercase ${updateTone.label}`}>
                          Latest version
                        </p>
                        <p className="mt-1 text-base font-semibold">{versionInfo.latestVersion}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="plank-update-command">Update command</Label>
                      <div className="flex gap-2">
                        <Input
                          id="plank-update-command"
                          value={versionInfo.updateCommand}
                          readOnly
                          className="font-mono text-sm"
                        />
                        <Button type="button" variant="outline" onClick={handleCopyUpdateCommand}>
                          {commandCopied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                          {commandCopied ? 'Copied' : 'Copy'}
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button asChild variant="outline">
                        <a href={versionInfo.changelogUrl} target="_blank" rel="noreferrer">
                          View changelog
                          <ArrowUpRightIcon className="size-4" />
                        </a>
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}

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

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <div
            className={`w-full mx-auto px-4 mb-16 ${secondaryPanel ? 'max-w-7xl' : 'max-w-9xl'}`}
          >
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

export function AppLayout() {
  return (
    <SecondaryPanelProvider>
      <LayoutShell />
    </SecondaryPanelProvider>
  )
}
