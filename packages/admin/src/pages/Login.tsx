import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/auth.tsx'
import { useApi } from '@/hooks/useApi.ts'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'

interface AuthResponse {
  token: string
  user: { id: string; email: string; role: string; permissions: string[]; firstName: string | null; lastName: string | null; avatarUrl: string | null }
}

export function Login() {
  const { login } = useAuth()
  const { loading, error, request } = useApi<AuthResponse>()
  const navigate = useNavigate()

  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/cms/auth/setup')
      .then((r) => r.json())
      .then((data: { needsSetup: boolean }) => setNeedsSetup(data.needsSetup))
      .catch(() => setNeedsSetup(true))
  }, [])

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault()
    setValidationError(null)

    if (needsSetup && password !== confirm) {
      setValidationError('Passwords do not match')
      return
    }

    try {
      if (needsSetup) {
        await request('/cms/auth/register', 'POST', { email, password })
      }
      const res = await request('/cms/auth/login', 'POST', { email, password })
      login(res.user, res.token)
      navigate('/')
    } catch {
      setValidationError(
        needsSetup ? (error ?? 'Could not create account.') : 'Invalid email or password.',
      )
    }
  }

  if (needsSetup === null) return null

  const displayError = validationError

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Left panel — form */}
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex items-center">
          <img src={`${import.meta.env.BASE_URL}plank-logo-w.svg`} alt="Plank CMS" className="h-10" />
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold">
                {needsSetup ? 'Create your account' : 'Welcome back'}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {needsSetup
                  ? 'Set up your admin account to get started'
                  : 'Enter your credentials to access the panel'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {needsSetup && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                  />
                </div>
              )}

              {displayError && (
                <p className="text-sm text-destructive">{displayError}</p>
              )}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? '...' : needsSetup ? 'Create account' : 'Login'}
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Right panel — decorative */}
      <div className="hidden bg-muted lg:block" />
    </div>
  )
}
