import HeaderFixed from '@/shared/components/Header'
import { AccountCard } from '@/shared/components/profile/AccountCard.tsx'
import { SecurityCard } from '@/shared/components/profile/SecurityCard.tsx'

export function Profile() {
  return (
    <>
      <HeaderFixed>
        <h1 className="text-2xl font-bold -mt-2">Profile</h1>
      </HeaderFixed>

      <section className="mt-18">
        <div className="grid grid-cols-2 gap-4 items-start">
          <div className="space-y-4">
            <AccountCard />
            <SecurityCard />
          </div>
        </div>
      </section>
    </>
  )
}
