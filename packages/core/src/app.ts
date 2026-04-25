import express, { type Express } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import authRouter from './routes/auth.js'
import adminRouter from './routes/admin.js'
import publicRouter from './routes/public.js'
import { errorHandler } from './middlewares/errorHandler.js'

const app: Express = express()

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'img-src': ["'self'", 'data:', 'https:'],
    },
  },
}))
app.use(express.json())

// /cms/* is only accessible from the admin panel origin
const PORT = process.env.PLANK_PORT ?? '5500'
const adminOrigin = process.env.PLANK_PUBLIC_URL ?? `http://localhost:${PORT}`
const cmsCorOptions = cors({ origin: adminOrigin, credentials: true })

app.use('/cms/auth', cmsCorOptions, authRouter)
app.use('/cms/admin', cmsCorOptions, adminRouter)

// /api/* is public — any origin can consume it (headless CMS)
app.use('/api', cors(), publicRouter)

app.get('/', (_req, res) => res.redirect('/admin'))

// Serve admin panel static files in production.
// PLANK_ADMIN_DIST is set by the CLI in the distributed package (bundled context).
// Fallback resolves to packages/core/public/admin in the monorepo.
const adminDist =
  process.env.PLANK_ADMIN_DIST ??
  join(dirname(fileURLToPath(import.meta.url)), '../public/admin')
app.use('/admin', express.static(adminDist))
app.get('/admin/*path', (_req, res) => res.sendFile(join(adminDist, 'index.html')))

app.use(errorHandler)

export default app
