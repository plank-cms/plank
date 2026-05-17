import { NavLink, useLocation } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'

export type SidebarNavItem = {
  label: string
  to: string
  icon?: LucideIcon
}

type SidebarNavProps = {
  items: SidebarNavItem[]
}

export function SidebarNav({ items }: SidebarNavProps) {
  const { pathname } = useLocation()

  function isActive(to: string) {
    return pathname === to || pathname.startsWith(to + '/')
  }

  return (
    <nav className="flex flex-col gap-0.5 p-2">
      {items.map(({ label, to, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={[
            'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
            isActive(to)
              ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
              : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
          ].join(' ')}
        >
          {Icon && <Icon className="size-3.5 shrink-0" />}
          <span className="truncate">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
