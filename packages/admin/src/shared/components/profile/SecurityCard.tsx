import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useApi } from '@/shared/hooks/useApi.ts'
import { useFetch } from '@/shared/hooks/useFetch.ts'
import { useAuth } from '@/shared/context/auth.tsx'
import { Button } from '@/shared/ui/button.tsx'
import { Input } from '@/shared/ui/input.tsx'
import { Label } from '@/shared/ui/label.tsx'
import { Card, CardHeader, CardTitle, CardContent, CardAction } from '@/shared/ui/card.tsx'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/shared/ui/input-otp.tsx'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/tabs.tsx'
import { QRCodeSVG } from 'qrcode.react'
import { XIcon } from 'lucide-react'

interface TwoFactorSetupResponse {
  otpauthUri: string
  secret: string
}

interface VerifyTwoFactorResponse {
  backupCodes: string[]
}

export function SecurityCard() {
  const { user, updateUser, logout } = useAuth()
  const { loading: changingPw, error: pwError, request } = useApi()
  const { loading: loading2FA, error: twoFaError, request: request2FA } = useApi()
  const { loading: requestingReset, request: requestReset } = useApi()
  const { data: authFeatures } = useFetch<{ passwordRecovery?: boolean }>('/cms/auth/features')

  const [activeTab, setActiveTab] = useState<'' | 'password' | 'two-factor'>('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [confirmError, setConfirmError] = useState<string | null>(null)

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [setupData, setSetupData] = useState<TwoFactorSetupResponse | null>(null)
  const [otpCode, setOtpCode] = useState('')
  const [disablePassword, setDisablePassword] = useState('')
  const [justEnabled2FA, setJustEnabled2FA] = useState(false)
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [copiedBackupCodes, setCopiedBackupCodes] = useState(false)

  useEffect(() => {
    if (typeof user?.twoFactorEnabled === 'boolean') {
      setTwoFactorEnabled(user.twoFactorEnabled)
    }
  }, [user?.twoFactorEnabled])

  function handleClose() {
    setActiveTab('')
    setCurrentPassword('')
    setNewPassword('')
    setConfirm('')
    setConfirmError(null)
    setSetupData(null)
    setOtpCode('')
  }

  function closeTwoFactorSetup() {
    setSetupData(null)
    setOtpCode('')
    setDisablePassword('')
    setJustEnabled2FA(false)
    setCopiedBackupCodes(false)
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setConfirmError(null)
    if (newPassword !== confirm) {
      setConfirmError('New passwords do not match')
      return
    }
    try {
      await request('/cms/admin/users/me/password', 'PATCH', { currentPassword, newPassword })
      handleClose()
      toast.success('Password updated')
    } catch {
      toast.error('Could not update password')
    }
  }

  async function handleStart2FA() {
    const data = (await request2FA(
      '/cms/admin/users/me/2fa/setup',
      'POST',
    )) as TwoFactorSetupResponse
    setSetupData(data)
  }

  async function handleEnable2FA() {
    try {
      const data = (await request2FA('/cms/admin/users/me/2fa/verify', 'POST', {
        code: otpCode,
      })) as VerifyTwoFactorResponse
      setTwoFactorEnabled(true)
      updateUser({ twoFactorEnabled: true })
      setSetupData(null)
      setOtpCode('')
      setJustEnabled2FA(true)
      setBackupCodes(data.backupCodes ?? [])
      toast.success('Two-factor authentication enabled')
    } catch {
      toast.error('Could not enable 2FA')
    }
  }

  async function handleDisable2FA() {
    try {
      await request2FA('/cms/admin/users/me/2fa/disable', 'POST', {
        code: otpCode,
        password: disablePassword,
      })
      setTwoFactorEnabled(false)
      updateUser({ twoFactorEnabled: false })
      setOtpCode('')
      setDisablePassword('')
      setBackupCodes([])
      setCopiedBackupCodes(false)
      toast.success('Two-factor authentication disabled')
    } catch {
      toast.error('Could not disable 2FA')
    }
  }

  async function handleRequestPasswordReset() {
    if (!user?.email) return
    try {
      await requestReset('/cms/auth/password-reset', 'POST', { email: user.email })
      toast.success('Password reset link sent')
    } catch {
      toast.error('Could not request password reset')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="uppercase">Security</CardTitle>
        <CardAction />
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs value={activeTab}>
          <TabsList>
            <TabsTrigger
              value="password"
              onClick={() => setActiveTab((prev) => (prev === 'password' ? '' : 'password'))}
            >
              Password
            </TabsTrigger>
            <TabsTrigger
              value="two-factor"
              onClick={() => setActiveTab((prev) => (prev === 'two-factor' ? '' : 'two-factor'))}
            >
              2FA
            </TabsTrigger>
          </TabsList>

          <TabsContent value="password" className="mt-4">
            <div className="space-y-4 rounded-md border border-border p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Update your account password.</p>
                <Button variant="ghost" size="icon" onClick={handleClose}>
                  <XIcon className="size-4" />
                </Button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="current">Current password</Label>
                  <Input
                    id="current"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new">New password</Label>
                  <Input
                    id="new"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm">Confirm new password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                  />
                </div>

                {(confirmError ?? pwError) && (
                  <p className="text-destructive text-sm">{confirmError ?? pwError}</p>
                )}

                <Button type="submit" disabled={changingPw}>
                  {changingPw ? 'Saving…' : 'Update password'}
                </Button>
              </form>
              {authFeatures?.passwordRecovery && (
                <div className="border-t pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRequestPasswordReset}
                    disabled={requestingReset}
                  >
                    {requestingReset ? 'Sending…' : 'Send password reset link'}
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="two-factor" className="mt-4">
            <div className="space-y-4">
              {!twoFactorEnabled && !setupData && (
                <Button variant="secondary" onClick={handleStart2FA} disabled={loading2FA}>
                  Enable 2FA
                </Button>
              )}

              {setupData && !twoFactorEnabled && (
                <div className="space-y-3 rounded-md border border-border p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Scan this QR code with your authenticator app and enter the 6-digit code.
                    </p>
                    <Button variant="ghost" size="icon" onClick={closeTwoFactorSetup}>
                      <XIcon className="size-4" />
                    </Button>
                  </div>
                  <div className="inline-flex rounded-md bg-white p-2">
                    <QRCodeSVG value={setupData.otpauthUri} size={176} />
                  </div>
                  <p className="text-xs text-muted-foreground">Manual code: {setupData.secret}</p>
                  <InputOTP
                    maxLength={6}
                    value={otpCode}
                    onChange={setOtpCode}
                    containerClassName="w-fit"
                    className="w-fit"
                  >
                    <InputOTPGroup className="w-fit">
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                  <Button onClick={handleEnable2FA} disabled={loading2FA || otpCode.length !== 6}>
                    Confirm and enable 2FA
                  </Button>
                  {twoFaError && <p className="text-sm text-destructive">{twoFaError}</p>}
                </div>
              )}

              {twoFactorEnabled && (
                <div className="space-y-3 rounded-md border border-border p-4">
                  {justEnabled2FA && (
                    <div className="space-y-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3">
                      <p className="text-sm font-medium text-emerald-300">2FA is now enabled.</p>
                      <p className="text-xs text-emerald-200/90">
                        For security, re-login is recommended now. This prevents accidental changes
                        and confirms your new security state.
                      </p>
                      <Button
                        variant="default"
                        onClick={() => {
                          logout()
                        }}
                      >
                        Re-login now
                      </Button>
                      {backupCodes.length > 0 && (
                        <div className="space-y-2 rounded-md border border-emerald-400/30 bg-background/40 p-3">
                          <p className="text-xs font-medium text-emerald-200">
                            Save these backup codes now. Each code can be used once if you lose
                            access to your authenticator.
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            {backupCodes.map((code) => (
                              <code
                                key={code}
                                className="rounded bg-black/20 px-2 py-1 text-xs text-emerald-100"
                              >
                                {code}
                              </code>
                            ))}
                          </div>
                          <Button
                            variant="outline"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(backupCodes.join('\n'))
                                setCopiedBackupCodes(true)
                                setTimeout(() => setCopiedBackupCodes(false), 2000)
                              } catch {
                                setCopiedBackupCodes(false)
                              }
                            }}
                          >
                            {copiedBackupCodes ? 'Copied' : 'Copy backup codes'}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Enter a verification code from your authenticator app to disable 2FA.
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setOtpCode('')
                        setDisablePassword('')
                      }}
                    >
                      <XIcon className="size-4" />
                    </Button>
                  </div>
                  <InputOTP
                    maxLength={6}
                    value={otpCode}
                    onChange={setOtpCode}
                    containerClassName="w-fit"
                    className="w-fit"
                  >
                    <InputOTPGroup className="w-fit">
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                  <div className="space-y-1.5">
                    <Label htmlFor="disable-2fa-password">Current password</Label>
                    <Input
                      id="disable-2fa-password"
                      type="password"
                      value={disablePassword}
                      onChange={(e) => setDisablePassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button
                    variant="destructive"
                    onClick={handleDisable2FA}
                    disabled={
                      justEnabled2FA || loading2FA || otpCode.length !== 6 || !disablePassword
                    }
                  >
                    Disable 2FA
                  </Button>
                  {twoFaError && <p className="text-sm text-destructive">{twoFaError}</p>}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
