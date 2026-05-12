import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/auth.tsx'
import { useApi } from '@/hooks/useApi.ts'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp.tsx'

interface AuthResponse {
  requiresTwoFactor: boolean
  challengeToken?: string
  user?: {
    id: string
    email: string
    role: string
    permissions: string[]
    firstName: string | null
    lastName: string | null
    avatarUrl: string | null
    jobTitle?: string | null
    organization?: string | null
    country?: string | null
    twoFactorEnabled?: boolean
  }
}

export function Login() {
  const { login } = useAuth()
  const { loading, error, request } = useApi<AuthResponse>()
  const navigate = useNavigate()

  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [challengeToken, setChallengeToken] = useState<string | null>(null)
  const [otpCode, setOtpCode] = useState('')
  const [backupCode, setBackupCode] = useState('')
  const [useBackupCode, setUseBackupCode] = useState(false)

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
      if (challengeToken) {
        const verifyRes = await request('/cms/auth/login/2fa', 'POST', {
          challengeToken,
          code: useBackupCode ? backupCode.trim() : otpCode,
        })
        if (!verifyRes.user) throw new Error('Invalid 2FA response')
        login(
          {
            ...verifyRes.user,
            jobTitle: verifyRes.user.jobTitle ?? null,
            organization: verifyRes.user.organization ?? null,
            country: verifyRes.user.country ?? null,
            twoFactorEnabled: verifyRes.user.twoFactorEnabled ?? false,
          },
        )
        navigate('/')
        return
      }

      if (needsSetup) {
        await request('/cms/auth/register', 'POST', { email, firstName, lastName, password })
      }
      const res = await request('/cms/auth/login', 'POST', { email, password })
      if (res.requiresTwoFactor && res.challengeToken) {
        setChallengeToken(res.challengeToken)
        setOtpCode('')
        setBackupCode('')
        setUseBackupCode(false)
        return
      }
      if (!res.user) throw new Error('Invalid login response')
      login(
        {
          ...res.user,
          jobTitle: res.user.jobTitle ?? null,
          organization: res.user.organization ?? null,
          country: res.user.country ?? null,
          twoFactorEnabled: res.user.twoFactorEnabled ?? false,
        },
      )
      navigate('/')
    } catch {
      setValidationError(challengeToken ? 'Invalid verification code.' : needsSetup ? (error ?? 'Could not create account.') : 'Invalid email or password.')
    }
  }

  if (needsSetup === null) return null

  const displayError = validationError

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Left panel — form */}
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

              {needsSetup && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="firstName">First name</Label>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="lastName">Last name</Label>
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                  </div>
                </>
              )}

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

              {challengeToken && (
                <>
                  {!useBackupCode ? (
                    <div className="flex flex-col gap-1.5">
                      <Label>Verification code</Label>
                      <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode}>
                        <InputOTPGroup>
                          <InputOTPSlot index={0} />
                          <InputOTPSlot index={1} />
                          <InputOTPSlot index={2} />
                        </InputOTPGroup>
                        <InputOTPSeparator />
                        <InputOTPGroup>
                          <InputOTPSlot index={3} />
                          <InputOTPSlot index={4} />
                          <InputOTPSlot index={5} />
                        </InputOTPGroup>
                      </InputOTP>
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-fit px-0 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setUseBackupCode(true)
                          setOtpCode('')
                        }}
                      >
                        Use backup code instead
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="backup-code">Backup code</Label>
                      <Input
                        id="backup-code"
                        placeholder="ABCD-EFGH"
                        value={backupCode}
                        onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-fit px-0 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setUseBackupCode(false)
                          setBackupCode('')
                        }}
                      >
                        Use authenticator code instead
                      </Button>
                    </div>
                  )}
                </>
              )}

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

              {displayError && <p className="text-sm text-destructive">{displayError}</p>}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? '...' : challengeToken ? 'Verify code' : needsSetup ? 'Create account' : 'Login'}
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Right panel — decorative */}
      <div
        className="hidden lg:block bg-center bg-cover bg-no-repeat"
        style={{ backgroundImage: `url(${import.meta.env.BASE_URL}particles-texture.png)` }}
      />
    </div>
  )
}
