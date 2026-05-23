import type { Request, Response, NextFunction } from 'express'

export function validateMcpOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.get('origin')
  if (!origin) {
    next()
    return
  }

  const host = req.get('host')
  if (!host) {
    res.status(400).json({ error: 'Missing Host header' })
    return
  }

  const forwardedProto = req.get('x-forwarded-proto')
  const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol
  const allowedOrigins = new Set<string>([`${protocol}://${host}`])

  if (!process.env.PLANK_ADMIN_DIST) {
    const port = process.env.PLANK_PORT ?? '5500'
    allowedOrigins.add(`http://localhost:${port}`)
    allowedOrigins.add('http://localhost:3000')
  }

  if (!allowedOrigins.has(origin)) {
    res.status(403).json({ error: 'Origin not allowed' })
    return
  }

  next()
}
