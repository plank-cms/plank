import express, { type Express } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import authRouter from './routes/auth.js'
import adminRouter from './routes/admin.js'
import publicRouter from './routes/public.js'
import { errorHandler } from './middlewares/errorHandler.js'

function assertSecurityEnv(): void {
  const isBundledRuntime = Boolean(process.env.PLANK_ADMIN_DIST)
  if (!isBundledRuntime) return

  if (!process.env.PLANK_JWT_SECRET || process.env.PLANK_JWT_SECRET.length < 32) {
    throw new Error('PLANK_JWT_SECRET is required in production and should be at least 32 characters.')
  }
  if (!process.env.PLANK_ENCRYPTION_KEY || process.env.PLANK_ENCRYPTION_KEY.length !== 64) {
    throw new Error('PLANK_ENCRYPTION_KEY is required in production and must be 64 hex characters.')
  }
}

assertSecurityEnv()

const app: Express = express()

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'img-src': ["'self'", 'blob:', 'data:', 'https:'],
      'connect-src': ["'self'", 'https:'],
      'media-src': ["'self'", 'blob:', 'https:'],
    },
  },
}))
app.use(express.json())

// /cms/* is only accessible from the admin panel origin
const PORT = process.env.PLANK_PORT ?? '5500'
const isDev = !process.env.PLANK_ADMIN_DIST
const coreBaseUrl = `http://localhost:${PORT}`
const adminDevUrl = 'http://localhost:3000'
const cmsAllowedOrigins = isDev ? [coreBaseUrl, adminDevUrl] : [coreBaseUrl]
const cmsCorOptions = cors({ origin: cmsAllowedOrigins, credentials: true })

app.use('/cms/auth', cmsCorOptions, authRouter)
app.use('/cms/admin', cmsCorOptions, adminRouter)

// /api/* is public — any origin can consume it (headless CMS)
app.use('/api', cors(), publicRouter)

app.get('/', (_req, res) => {
  if (isDev) {
    res.redirect(adminDevUrl)
    return
  }

  res.redirect('/admin')
})

if (isDev) {
  app.get('/admin/*path', (_req, res) => res.redirect(adminDevUrl))
  app.get('/admin', (_req, res) => res.redirect(adminDevUrl))
} else {
  // Serve admin panel static files in production.
  // PLANK_ADMIN_DIST is set by the CLI in the distributed package (bundled context).
  // Fallback resolves to packages/core/public/admin in the monorepo.
  const adminDist =
    process.env.PLANK_ADMIN_DIST ??
    join(dirname(fileURLToPath(import.meta.url)), '../public/admin')
  app.use('/admin', express.static(adminDist))
  app.get('/admin/*path', async (_req, res) => {
    try {
      const source = await readFile(join(adminDist, 'index.html'), 'utf8')
      res.type('text/html')
      res.send(source)
    } catch {
      res.status(404).send('Admin entry not found')
    }
  })
}

app.use(errorHandler)

export default app
