import { config } from 'dotenv'
import { resolve } from 'node:path'

export async function start(): Promise<void> {
  config({ path: resolve(process.cwd(), '.env') })

  const { start: startServer } = await import('@plank/core/server')
  await startServer()
}
