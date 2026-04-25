import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { extname } from 'node:path'
import { randomBytes } from 'node:crypto'
import { getSetting } from '../../lib/settings.js'
import type { MediaProvider, UploadOptions } from '../index.js'

async function getConfig() {
  const [accessKeyId, secretAccessKey, region, bucket, pathPrefix, publicUrl] =
    await Promise.all([
      getSetting('media', 's3.access_key_id'),
      getSetting('media', 's3.secret_access_key'),
      getSetting('media', 's3.region'),
      getSetting('media', 's3.bucket'),
      getSetting('media', 's3.path_prefix'),
      getSetting('media', 's3.public_url'),
    ])

  return { accessKeyId, secretAccessKey, region, bucket, pathPrefix, publicUrl }
}

function buildClient(cfg: Awaited<ReturnType<typeof getConfig>>) {
  if (!cfg.accessKeyId || !cfg.secretAccessKey || !cfg.region) {
    throw new Error('S3 provider is not configured. Set access_key_id, secret_access_key, and region in Settings > Media.')
  }
  return new S3Client({
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  })
}

function buildKey(cfg: Awaited<ReturnType<typeof getConfig>>, filename: string, prefix?: string): string {
  const ext = extname(filename)
  const name = `${randomBytes(16).toString('hex')}${ext}`
  const parts = [cfg.pathPrefix?.replace(/\/$/, ''), prefix, name].filter(Boolean)
  return parts.join('/')
}

function buildStoredUrl(cfg: Awaited<ReturnType<typeof getConfig>>, key: string): string {
  return cfg.publicUrl
    ? `${cfg.publicUrl.replace(/\/$/, '')}/${key}`
    : `https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com/${key}`
}

export const s3Provider: MediaProvider = {
  async upload(file, options?: UploadOptions) {
    const cfg = await getConfig()
    const client = buildClient(cfg)

    const key = buildKey(cfg, file.originalname, options?.prefix)

    await client.send(new PutObjectCommand({
      Bucket: cfg.bucket!,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }))

    return { url: buildStoredUrl(cfg, key), key }
  },

  async delete(key) {
    const cfg = await getConfig()
    const client = buildClient(cfg)
    await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket!, Key: key }))
  },

  async getUrl(key) {
    const cfg = await getConfig()
    return buildStoredUrl(cfg, key)
  },
}
