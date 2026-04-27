import HeaderFixed from '@/components/Header'

export function Dashboard() {
  return (
    <div className="relative min-h-[calc(100vh-8rem)]">
      <HeaderFixed>
        <h1 className="text-2xl font-bold -mt-2">Dashboard</h1>
      </HeaderFixed>

      <section className="mt-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 984.8739 1079.5625"
          className="absolute inset-0 m-auto w-64 opacity-[0.06] dark:opacity-[0.04] pointer-events-none"
          aria-hidden="true"
        >
          <path
            d="M654.0548,0h-166.4155L0,399.8729v565.8804l441.927-363.306v180.4008h212.1278c174.2523,0,330.8192-98.4874,330.8192-395.2159C984.8739,88.3854,834.6244,0,654.0548,0ZM0,965.7533v113.8092h441.927v-113.8092c0-7.4991-441.927,0-441.927,0Z"
            className="fill-foreground"
          />
        </svg>
      </section>
    </div>
  )
}
