import { pool } from '@plank-cms/db'
import { encrypt, decrypt } from './encrypt.js'

// Fields that are encrypted at rest per namespace
const SENSITIVE_FIELDS: Record<string, Set<string>> = {
  media: new Set(['s3.secret_access_key', 'r2.secret_access_key']),
  mailing: new Set(['smtp.password']),
}

function isSensitive(namespace: string, key: string): boolean {
  return SENSITIVE_FIELDS[namespace]?.has(key) ?? false
}

export async function getSettings(namespace: string): Promise<Record<string, string>> {
  const { rows } = await pool.query<{ key: string; value: string }>(
    'SELECT key, value FROM plank_settings WHERE namespace = $1',
    [namespace],
  )

  return Object.fromEntries(
    rows.map((r) => [r.key, isSensitive(namespace, r.key) ? decrypt(r.value) : r.value]),
  )
}

export async function getSetting(namespace: string, key: string): Promise<string | null> {
  const { rows } = await pool.query<{ value: string }>(
    'SELECT value FROM plank_settings WHERE namespace = $1 AND key = $2',
    [namespace, key],
  )
  if (!rows[0]) return null
  return isSensitive(namespace, key) ? decrypt(rows[0].value) : rows[0].value
}

export async function setSettings(
  namespace: string,
  values: Record<string, string>,
): Promise<void> {
  if (Object.keys(values).length === 0) return

  const entries = Object.entries(values).map(([key, value]) => ({
    key,
    value: isSensitive(namespace, key) ? encrypt(value) : value,
  }))

  // Upsert all entries in a single query
  const placeholders = entries.map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(', ')

  const params: unknown[] = [namespace]
  for (const { key, value } of entries) {
    params.push(key, value)
  }

  await pool.query(
    `INSERT INTO plank_settings (namespace, key, value)
     VALUES ${placeholders}
     ON CONFLICT (namespace, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    params,
  )
}
