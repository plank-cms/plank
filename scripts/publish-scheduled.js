#!/usr/bin/env node

/**
 * Scheduled entry publisher
 *
 * Connects directly to the database and publishes any entries whose
 * scheduled_for timestamp is in the past.
 *
 * Run from the project root: node scripts/publish-scheduled.js
 *
 * Required environment variables:
 *   PLANK_DATABASE_URL  PostgreSQL connection string (already required by the server)
 *
 * Recommended cron in Dokploy: every 5 minutes
 *   node scripts/publish-scheduled.js
 *   Cron: */5 * * * *
 */

const pg = require("pg");

const pool = new pg.Pool({ connectionString: process.env.PLANK_DATABASE_URL });

const SNAPSHOT_EXCLUDED = ["'id'", "'status'", "'published_data'", "'published_at'", "'scheduled_for'", "'created_at'", "'updated_at'"];
const snapshotExpr = (table) =>
  `(SELECT ${SNAPSHOT_EXCLUDED.reduce((expr, col) => `${expr} - ${col}`, `to_jsonb(t.*)`)} FROM ${table} t WHERE t.id = $1)`;

async function main() {
  const now = new Date().toISOString();
  console.log(`[publish-scheduled] Running at ${now}`);

  const { rows: cts } = await pool.query(
    "SELECT slug, table_name FROM plank_content_types"
  );

  const published = [];

  for (const { slug, table_name } of cts) {
    const { rows: due } = await pool.query(
      `SELECT id FROM ${table_name} WHERE status = 'scheduled' AND scheduled_for <= NOW()`
    );

    if (due.length === 0) continue;

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
      );
      published.push({ slug, id });
    }
  }

  if (published.length === 0) {
    console.log("[publish-scheduled] No entries ready to publish.");
    return;
  }

  console.log(`[publish-scheduled] ${published.length} entry(s) published:`);
  for (const { slug, id } of published) {
    console.log(`  ✓ ${slug} — ${id}`);
  }
}

main()
  .catch((err) => {
    console.error("[publish-scheduled] Fatal error:", err.message ?? err);
    process.exit(1);
  })
  .finally(() => pool.end());
