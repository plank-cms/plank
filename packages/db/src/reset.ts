import pool from './pool.js'
import { migrate } from './migrate.js'

async function reset(): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS
      plank_migrations,
      plank_settings,
      plank_media,
      plank_api_tokens,
      plank_content_types,
      plank_users,
      plank_roles
    CASCADE
  `)
  console.log('[plank/db] All plank tables dropped.')
  await migrate()
}

reset().catch((err) => {
  console.error(err)
  process.exit(1)
})
