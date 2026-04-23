import { migrate } from '@plank/db'
import app from './app.js'

export async function start(): Promise<void> {
  const PORT = process.env.PLANK_PORT ?? 5500

  await migrate()

  app.listen(PORT, () => {
    const isDev = process.env.NODE_ENV !== 'production'
    const base = process.env.PLANK_PUBLIC_URL ?? `http://localhost:${PORT}`
    console.log('  ▲ Plank CMS by AM25')
    if (isDev) {
      console.log(`  Admin  → http://localhost:3000`)
    } else {
      console.log(`  Admin  → ${base}/admin`)
      console.log(`  API    → ${base}/api`)
    }
  })
}
