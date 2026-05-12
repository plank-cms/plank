import type { Request, Response } from 'express'
import { getVersionCheck } from '../lib/version.js'

export async function getVersionInfo(_req: Request, res: Response): Promise<void> {
  const versionInfo = await getVersionCheck()
  res.json(versionInfo)
}
