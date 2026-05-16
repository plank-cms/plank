import { migrate } from '@plank-cms/db'
import { syncAllTables } from '@plank-cms/schema'
import app from './app.js'
import { syncInstalledAddons } from './lib/addons.js'

export async function start(): Promise<void> {
  const PORT = process.env.PLANK_PORT ?? 5500
  const isDev = !process.env.PLANK_ADMIN_DIST

  await migrate()
  await syncAllTables()
  await syncInstalledAddons()

  app.listen(PORT, () => {
    const coreBase = `http://localhost:${PORT}`
    const adminUrl = isDev ? 'http://localhost:3000' : `${coreBase}/admin`
    console.log('  ▲ Plank CMS by AM25')
    console.log(`  Admin  → ${adminUrl}`)
    console.log(`  API    → ${coreBase}/api`)
  })
}
