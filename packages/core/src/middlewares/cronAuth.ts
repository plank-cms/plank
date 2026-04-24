import type { Request, Response, NextFunction } from 'express'

export function cronAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.PLANK_CRON_SECRET
  if (!secret) {
    res.status(503).json({ error: 'Cron not configured (PLANK_CRON_SECRET missing)' })
    return
  }

  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ') || header.slice(7) !== secret) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  next()
}
