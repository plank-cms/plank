import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

export async function start(): Promise<void> {
  config({ path: resolve(process.cwd(), '.env') })

  // Apunta al admin compilado que viaja junto al bundle en dist/admin/
  process.env.PLANK_ADMIN_DIST = join(dirname(fileURLToPath(import.meta.url)), 'admin')

  const { start: startServer } = await import('@plank/core/server')
  await startServer()
}
