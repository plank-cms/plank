import { start } from './server.js'

start().catch((err) => {
  console.error('[plank] Failed to start:', err)
  process.exit(1)
})
