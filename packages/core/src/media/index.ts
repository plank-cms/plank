import multer from 'multer'
import { getSetting } from '../lib/settings.js'
import { localProvider } from './providers/local.js'
import { s3Provider } from './providers/s3.js'
import { r2Provider } from './providers/r2.js'

export interface UploadOptions {
  prefix?: string
}

export interface MediaProvider {
  upload(file: Express.Multer.File, options?: UploadOptions): Promise<{ url: string; key: string }>
  uploadRaw(buffer: Buffer, exactKey: string, mimeType: string): Promise<{ url: string; key: string }>
  delete(key: string): Promise<void>
  getUrl(key: string): Promise<string>
}

const providers: Record<string, MediaProvider> = {
  local: localProvider,
  s3: s3Provider,
  r2: r2Provider,
}

export async function getProvider(): Promise<MediaProvider> {
  // Settings DB takes precedence over env var
  const fromSettings = await getSetting('media', 'provider')
  const name = fromSettings ?? process.env.PLANK_MEDIA_PROVIDER ?? 'local'
  const provider = providers[name]
  if (!provider) throw new Error(`Unknown media provider: "${name}". Use local, s3, or r2.`)
  return provider
}

export const upload = multer({ storage: multer.memoryStorage() })
