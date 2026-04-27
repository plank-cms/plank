import { useState, useEffect } from 'react'
import { RotateCcwIcon, SaveIcon } from 'lucide-react'
import { useFetch } from '@/hooks/useFetch.ts'
import { useApi } from '@/hooks/useApi.ts'
import { useAuth } from '@/context/auth.tsx'
import { Spinner } from '@/components/ui/spinner.tsx'
import { Checkbox } from '@/components/ui/checkbox.tsx'
import { Button } from '@/components/ui/button.tsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table.tsx'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog.tsx'
import HeaderFixed from '@/components/Header'

type Role = { id: string; name: string; permissions: string[] }

const RESOURCES = [
  { key: 'content-types', label: 'Content Types' },
  { key: 'entries', label: 'Entries' },
  { key: 'media', label: 'Media' },
  { key: 'users', label: 'Users' },
  { key: 'api-tokens', label: 'API Tokens' },
  { key: 'webhooks', label: 'Webhooks' },
] as const

const ACTIONS = [
  { key: 'read', label: 'R' },
  { key: 'write', label: 'W' },
  { key: 'delete', label: 'D' },
] as const

type PermissionMap = Record<string, Set<string>>

function toMap(roles: Role[]): PermissionMap {
  return Object.fromEntries(roles.map((r) => [r.id, new Set(r.permissions)]))
}

export function SettingsRoles() {
  const { user } = useAuth()
  const { data: roles, loading, refetch } = useFetch<Role[]>('/cms/admin/roles')
  const { request, loading: submitting } = useApi()

  const [perms, setPerms] = useState<PermissionMap>({})
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [resetOpen, setResetOpen] = useState(false)

  useEffect(() => {
    if (roles) setPerms(toMap(roles))
  }, [roles])

  function toggle(roleId: string, permission: string) {
    setPerms((prev) => {
      const next = new Set(prev[roleId])
      next.has(permission) ? next.delete(permission) : next.add(permission)
      return { ...prev, [roleId]: next }
    })
    setDirty((prev) => new Set(prev).add(roleId))
  }

  async function save(role: Role) {
    await request(`/cms/admin/roles/${role.id}`, 'PUT', {
      permissions: Array.from(perms[role.id] ?? []),
    })
    setDirty((prev) => {
      const next = new Set(prev)
      next.delete(role.id)
      return next
    })
  }

  async function handleReset() {
    await request('/cms/admin/roles/reset', 'POST')
    setResetOpen(false)
    setDirty(new Set())
    refetch()
  }

  const isSuperAdmin = user?.role === 'Super Admin'
  const editableRoles = (roles ?? []).filter((r) => r.name !== 'Super Admin')
  const superAdminRole = (roles ?? []).find((r) => r.name === 'Super Admin')

  return (
    <>
      <HeaderFixed sidebar>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold -mt-2">Roles</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure what each role can do across the CMS.
            </p>
          </div>
          {isSuperAdmin && (
            <Button variant="outline" onClick={() => setResetOpen(true)}>
              <RotateCcwIcon className="size-4" />
              Reset defaults
            </Button>
          )}
        </div>
      </HeaderFixed>

      <section className="mt-24">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {/* Row 1: role names + save buttons */}
              <TableRow>
                <TableHead className="w-40" rowSpan={2} />

                {superAdminRole && (
                  <TableHead colSpan={3} className="border-l text-center">
                    {superAdminRole.name}
                  </TableHead>
                )}

                {editableRoles.map((role) => (
                  <TableHead key={role.id} colSpan={3} className="border-l">
                    <div className="flex items-center justify-between gap-2">
                      <span>{role.name}</span>
                      <Button
                        size="sm"
                        variant={dirty.has(role.id) ? 'default' : 'ghost'}
                        className="h-6 px-2 text-xs"
                        disabled={!dirty.has(role.id) || submitting}
                        onClick={() => save(role)}
                      >
                        <SaveIcon className="size-3" />
                        Save
                      </Button>
                    </div>
                  </TableHead>
                ))}
              </TableRow>

              {/* Row 2: R / W / D labels */}
              <TableRow>
                {superAdminRole &&
                  ACTIONS.map((a, i) => (
                    <TableHead
                      key={a.key}
                      className={`w-12 text-center font-normal ${i === 0 ? 'border-l' : ''}`}
                    >
                      {a.label}
                    </TableHead>
                  ))}
                {editableRoles.map((role) =>
                  ACTIONS.map((a, i) => (
                    <TableHead
                      key={`${role.id}-${a.key}`}
                      className={`w-12 text-center font-normal ${i === 0 ? 'border-l' : ''}`}
                    >
                      {a.label}
                    </TableHead>
                  )),
                )}
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={99} className="h-24">
                    <Spinner className="mx-auto size-5" />
                  </TableCell>
                </TableRow>
              ) : (
                RESOURCES.map(({ key: resource, label }) => (
                  <TableRow key={resource}>
                    <TableCell className="font-medium">{label}</TableCell>

                    {superAdminRole &&
                      ACTIONS.map((action, i) => (
                        <TableCell
                          key={action.key}
                          className={`text-center ${i === 0 ? 'border-l' : ''}`}
                        >
                          <Checkbox checked disabled />
                        </TableCell>
                      ))}

                    {editableRoles.map((role) =>
                      ACTIONS.map((action, i) => {
                        const permission = `${resource}:${action.key}`
                        return (
                          <TableCell
                            key={`${role.id}-${action.key}`}
                            className={`text-center ${i === 0 ? 'border-l' : ''}`}
                          >
                            <Checkbox
                              checked={perms[role.id]?.has(permission) ?? false}
                              onCheckedChange={() => toggle(role.id, permission)}
                            />
                          </TableCell>
                        )
                      }),
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Dialog open={resetOpen} onOpenChange={setResetOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Reset to defaults</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This will restore all role permissions to their original configuration. Any custom
              changes will be lost.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleReset} disabled={submitting}>
                {submitting ? 'Resetting…' : 'Reset'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    </>
  )
}
