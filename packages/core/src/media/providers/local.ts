import { writeFile, mkdir } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { randomBytes } from 'node:crypto'
import { getSetting } from '../../lib/settings.js'
import type { MediaProvider, UploadOptions } from '../index.js'

async function uploadsDir(): Promise<string> {
  const fromSettings = await getSetting('media', 'local.uploads_dir')
  return fromSettings ?? process.env.PLANK_UPLOADS_DIR ?? 'public/uploads'
}

async function publicUrl(): Promise<string> {
  const fromSettings = await getSetting('media', 'local.public_url')
  return fromSettings ?? process.env.PLANK_PUBLIC_URL ?? 'http://localhost:1337'
}

export const localProvider: MediaProvider = {
  async upload(file, options?: UploadOptions) {
    const base_dir = await uploadsDir()
    const subdir = options?.prefix ? join(base_dir, options.prefix) : base_dir
    await mkdir(subdir, { recursive: true })

    const ext = extname(file.originalname)
    const filename = `${randomBytes(16).toString('hex')}${ext}`
    const key = options?.prefix ? `${options.prefix}/${filename}` : filename
    await writeFile(join(base_dir, key), file.buffer)

    const base = await publicUrl()
    return { url: `${base}/uploads/${key}`, key }
  },

  async delete(key) {
    const { unlink } = await import('node:fs/promises')
    const dir = await uploadsDir()
    await unlink(join(dir, key))
  },

  async getUrl(key) {
    const base = await publicUrl()
    return `${base}/uploads/${key}`
  },
}
