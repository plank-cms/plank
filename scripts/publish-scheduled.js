#!/usr/bin/env node

/**
 * Scheduled entry publisher
 *
 * Calls POST /cms/cron/publish to publish any entries whose
 * scheduled_for timestamp is in the past.
 *
 * Run from the project root: node scripts/publish-scheduled.js
 *
 * Required environment variables:
 *   PLANK_URL          Base URL of the running Plank server (e.g. http://localhost:5500)
 *   PLANK_CRON_SECRET  Secret generated during setup (set in the server's environment)
 *
 * Recommended cron in Dokploy: every 5 minutes
 *   node scripts/publish-scheduled.js
 *   Cron: */5 * * * *
 */

const url = process.env.PLANK_URL;
const secret = process.env.PLANK_CRON_SECRET;

if (!url || !secret) {
  console.error("[publish-scheduled] Missing PLANK_URL or PLANK_CRON_SECRET env vars.");
  process.exit(1);
}

async function main() {
  const now = new Date().toISOString();
  console.log(`[publish-scheduled] Running at ${now}`);

  const res = await fetch(`${url}/cms/cron/publish`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[publish-scheduled] Request failed (${res.status}): ${text}`);
    process.exit(1);
  }

  const { published } = await res.json();

  if (published.length === 0) {
    console.log("[publish-scheduled] No entries ready to publish.");
    return;
  }

  console.log(`[publish-scheduled] ${published.length} entry(s) published:`);
  for (const { slug, id } of published) {
    console.log(`  ✓ ${slug} — ${id}`);
  }
}

main().catch((err) => {
  console.error("[publish-scheduled] Fatal error:", err.message ?? err);
  process.exit(1);
});
