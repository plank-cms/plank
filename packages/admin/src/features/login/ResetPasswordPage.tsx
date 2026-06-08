import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useApi } from '@/shared/hooks/useApi.ts'
import { Button } from '@/shared/ui/button.tsx'
import { Input } from '@/shared/ui/input.tsx'
import { Label } from '@/shared/ui/label.tsx'

export function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { loading, error, request } = useApi()
  const token = useMemo(() => searchParams.get('token') ?? '', [searchParams])

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    setValidationError(null)

    if (password !== confirm) {
      setValidationError('Passwords do not match')
      return
    }

    try {
      await request('/cms/auth/password-reset/confirm', 'POST', { token, password })
      toast.success('Password updated')
      navigate('/login')
    } catch {
      toast.error('Could not update password')
    }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex items-center">
          <img
            src={`${import.meta.env.BASE_URL}plank-logo-w.svg`}
            alt="Plank CMS"
            className="h-10"
          />
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold">Create new password</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter a new password for your account.
              </p>
            </div>

            {token ? (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="confirm-password">Confirm new password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>

                {(validationError ?? error) && (
                  <p className="text-sm text-destructive">{validationError ?? error}</p>
                )}

                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? 'Saving...' : 'Update password'}
                </Button>
              </form>
            ) : (
              <div className="space-y-4 text-center">
                <p className="text-sm text-destructive">Invalid password reset link.</p>
                <Button asChild className="w-full">
                  <Link to="/login">Back to login</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="hidden bg-center bg-cover bg-no-repeat lg:block"
        style={{ backgroundImage: `url(${import.meta.env.BASE_URL}particles-texture.png)` }}
      />
    </div>
  )
}
