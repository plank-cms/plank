import { useRef, useState } from 'react'
import { useAuth } from '@/context/auth.tsx'
import { useApi } from '@/hooks/useApi.ts'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Card, CardHeader, CardTitle, CardContent, CardAction } from '@/components/ui/card.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar.tsx'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible.tsx'
import { PencilIcon, XIcon, CameraIcon, Trash2Icon } from 'lucide-react'

type MeResponse = { first_name: string | null; last_name: string | null; avatar_url: string | null }
type AvatarResponse = { avatarUrl: string }

function getInitials(firstName: string | null, lastName: string | null, email: string) {
  if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase()
  if (firstName) return firstName.slice(0, 2).toUpperCase()
  return email.slice(0, 2).toUpperCase()
}

export function AccountCard() {
  const { user, updateUser } = useAuth()
  const { loading: saving, error: saveError, request } = useApi<MeResponse>()
  const { request: requestDeleteAvatar } = useApi()
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [deletingAvatar, setDeletingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [firstName, setFirstName] = useState(user?.firstName ?? '')
  const [lastName, setLastName] = useState(user?.lastName ?? '')

  function handleEditToggle() {
    if (editing) {
      setFirstName(user?.firstName ?? '')
      setLastName(user?.lastName ?? '')
    }
    setEditing(!editing)
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    setAvatarError(null)
    const token = localStorage.getItem('plank_token')
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/cms/admin/users/me/avatar', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
      })
      if (!res.ok) throw new Error('Upload failed.')
      const data = (await res.json()) as AvatarResponse
      updateUser({ avatarUrl: data.avatarUrl })
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploadingAvatar(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }

  async function handleAvatarDelete() {
    setDeletingAvatar(true)
    setAvatarError(null)
    try {
      await requestDeleteAvatar('/cms/admin/users/me/avatar', 'DELETE')
      updateUser({ avatarUrl: null })
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setDeletingAvatar(false)
    }
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    try {
      const updated = await request('/cms/admin/users/me', 'PATCH', { firstName, lastName })
      updateUser({ firstName: updated.first_name, lastName: updated.last_name })
      setEditing(false)
    } catch {
      /* error shown via saveError */
    }
  }

  return (
    <Collapsible open={editing} onOpenChange={setEditing}>
      <Card>
        <CardHeader>
          <CardTitle className="uppercase">Account</CardTitle>
          <CardAction>
            <Button variant="ghost" size="icon" onClick={handleEditToggle}>
              {editing ? <XIcon className="size-4" /> : <PencilIcon className="size-4" />}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 -mt-4">
            <div className="group relative shrink-0">
              <button
                type="button"
                className="block"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar || deletingAvatar}
                title="Change avatar"
              >
                <Avatar className="size-20">
                  {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt="Avatar" className="object-cover" />}
                  <AvatarFallback className="text-xl">
                    {getInitials(user?.firstName ?? null, user?.lastName ?? null, user?.email ?? '')}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  {uploadingAvatar || deletingAvatar
                    ? <div className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    : <CameraIcon className="size-5 text-white" />}
                </div>
              </button>
              {user?.avatarUrl && !uploadingAvatar && !deletingAvatar && (
                <button
                  type="button"
                  onClick={handleAvatarDelete}
                  title="Remove avatar"
                  className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Trash2Icon className="size-3" />
                </button>
              )}
            </div>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            <div>
              {avatarError && <p className="text-xs text-destructive mb-1">{avatarError}</p>}
              <p className="font-bold text-xl">
                {user?.firstName || user?.lastName
                  ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
                  : user?.email}
              </p>
              <p className="text-muted-foreground text-sm">{user?.email}</p>
              <Badge className="mt-2 capitalize">{user?.role}</Badge>
            </div>
          </div>

          <CollapsibleContent>
            <form onSubmit={handleSubmit} className="space-y-4 mt-8">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">First name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>

              {saveError && <p className="text-destructive text-sm">{saveError}</p>}

              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </form>
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  )
}
