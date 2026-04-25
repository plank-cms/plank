import { config } from 'dotenv'
import { resolve } from 'node:path'
import pg from 'pg'

const SNAPSHOT_EXCLUDED = ["'id'", "'status'", "'published_data'", "'published_at'", "'scheduled_for'", "'created_at'", "'updated_at'"]
const snapshotExpr = (table: string) =>
  `(SELECT ${SNAPSHOT_EXCLUDED.reduce((expr, col) => `${expr} - ${col}`, `to_jsonb(t.*)`)} FROM ${table} t WHERE t.id = $1)`

export async function publishScheduled(): Promise<void> {
  config({ path: resolve(process.cwd(), '.env') })

  const connectionString = process.env.PLANK_DATABASE_URL
  if (!connectionString) {
    console.error('[publish-scheduled] PLANK_DATABASE_URL is not set')
    process.exit(1)
  }

  const pool = new pg.Pool({ connectionString })

  try {
    console.log(`[publish-scheduled] Running at ${new Date().toISOString()}`)

    const { rows: cts } = await pool.query<{ slug: string; table_name: string }>(
      'SELECT slug, table_name FROM plank_content_types'
    )

    const published: { slug: string; id: string }[] = []

    for (const { slug, table_name } of cts) {
      const { rows: due } = await pool.query<{ id: string }>(
        `SELECT id FROM ${table_name} WHERE status = 'scheduled' AND scheduled_for <= NOW()`
      )

      if (due.length === 0) continue

      for (const { id } of due) {
        await pool.query(
          `UPDATE ${table_name} SET
            status = 'published',
            published_data = ${snapshotExpr(table_name)},
            published_at = NOW(),
            scheduled_for = NULL,
            updated_at = NOW()
          WHERE id = $1`,
          [id]
        )
        published.push({ slug, id })
      }
    }

    if (published.length === 0) {
      console.log('[publish-scheduled] No entries ready to publish.')
      return
    }

    console.log(`[publish-scheduled] ${published.length} entry(s) published:`)
    for (const { slug, id } of published) {
      console.log(`  ✓ ${slug} — ${id}`)
    }
  } finally {
    await pool.end()
  }
}
