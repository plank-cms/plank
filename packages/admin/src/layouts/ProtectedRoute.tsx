import { Navigate } from 'react-router-dom'
import { useAuth } from '@/shared/context/auth.tsx'
import type { ReactNode } from 'react'

function hasPermission(permissions: string[], permission: string): boolean {
  return permissions.includes('*') || permissions.includes(permission)
}

export function ProtectedRoute({
  children,
  roles,
  permission,
  redirectTo = '/',
}: {
  children: ReactNode
  roles?: string[]
  permission?: string
  redirectTo?: string
}) {
  const { status, user } = useAuth()

  if (status === 'idle') return null
  if (status === 'unauthenticated') return <Navigate to="/login" replace />

  if (roles && user && !roles.map((r) => r.toLowerCase()).includes(user.role.toLowerCase())) {
    return <Navigate to={redirectTo} replace />
  }

  if (permission && user && !hasPermission(user.permissions, permission)) {
    return <Navigate to={redirectTo} replace />
  }

  return <>{children}</>
}
