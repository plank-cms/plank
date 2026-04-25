import pg from 'pg'

// TIMESTAMP WITHOUT TIME ZONE (OID 1114): pg interprets stored values as local server
// time by default. All datetime fields in this app store UTC values (inputs always go
// through combineDateAndTime which produces a UTC ISO string), so force UTC parsing.
pg.types.setTypeParser(1114, (val: string) => (val ? new Date(val.replace(' ', 'T') + 'Z') : null))

// NUMERIC (OID 1700): pg returns strings by default to preserve arbitrary precision.
// All numeric fields in this app use standard float precision, so parse as JS number
// to match the JSON number type that to_jsonb() produces in published_data snapshots.
pg.types.setTypeParser(1700, (val: string) => (val !== null ? parseFloat(val) : null))

const pool = new pg.Pool({
  connectionString: process.env.PLANK_DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

pool.on('error', (err: Error) => {
  console.error('[plank/db] Unexpected pool error:', err.message)
  process.exit(1)
})

export default pool
