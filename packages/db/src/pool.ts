import pg from 'pg'

// TIMESTAMP WITHOUT TIME ZONE (OID 1114): pg interprets stored values as local server
// time by default. All datetime fields in this app store UTC values (inputs always go
// through combineDateAndTime which produces a UTC ISO string), so force UTC parsing.
pg.types.setTypeParser(1114, (val: string) => (val ? new Date(val.replace(' ', 'T') + 'Z') : null))

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
