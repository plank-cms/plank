import express, { type Express } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import authRouter from './routes/auth.js'
import adminRouter from './routes/admin.js'
import cronRouter from './routes/cron.js'
import publicRouter from './routes/public.js'
import { errorHandler } from './middlewares/errorHandler.js'

const app: Express = express()

app.use(helmet())
app.use(express.json())

// /cms/* is only accessible from the admin panel origin
const adminOrigin = process.env.PLANK_PUBLIC_URL ?? 'http://localhost:3000'
const cmsCorOptions = cors({ origin: adminOrigin, credentials: true })

app.use('/cms/auth', cmsCorOptions, authRouter)
app.use('/cms/admin', cmsCorOptions, adminRouter)

// /cms/cron is open to any origin (called by server-side cron jobs, not the browser)
app.use('/cms/cron', cors(), cronRouter)

// /api/* is public — any origin can consume it (headless CMS)
app.use('/api', cors(), publicRouter)

// Serve admin panel static files in production.
// PLANK_ADMIN_DIST is set by the CLI in the distributed package (bundled context).
// Fallback resolves to packages/core/public/admin in the monorepo.
if (process.env.NODE_ENV === 'production') {
  const adminDist =
    process.env.PLANK_ADMIN_DIST ??
    join(dirname(fileURLToPath(import.meta.url)), '../public/admin')
  app.use('/admin', express.static(adminDist))
}

app.use(errorHandler)

export default app
