import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { extname } from 'node:path'
import { randomBytes } from 'node:crypto'
import { getSetting } from '../../lib/settings.js'
import type { MediaProvider, UploadOptions } from '../index.js'

const SIGNED_URL_TTL = 3600 // 1 hour

async function getConfig() {
  const [accessKeyId, secretAccessKey, accountId, bucket, pathPrefix, accessMode, publicUrl] =
    await Promise.all([
      getSetting('media', 'r2.access_key_id'),
      getSetting('media', 'r2.secret_access_key'),
      getSetting('media', 'r2.account_id'),
      getSetting('media', 'r2.bucket'),
      getSetting('media', 'r2.path_prefix'),
      getSetting('media', 'r2.access_mode'),
      getSetting('media', 'r2.public_url'),
    ])

  return { accessKeyId, secretAccessKey, accountId, bucket, pathPrefix, accessMode, publicUrl }
}

function buildClient(cfg: Awaited<ReturnType<typeof getConfig>>) {
  if (!cfg.accessKeyId || !cfg.secretAccessKey || !cfg.accountId) {
    throw new Error('R2 provider is not configured. Set access_key_id, secret_access_key, and account_id in Settings > Media.')
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  })
}

export const r2Provider: MediaProvider = {
  async upload(file, options?: UploadOptions) {
    const cfg = await getConfig()
    const client = buildClient(cfg)

    const ext = extname(file.originalname)
    const filename = `${randomBytes(16).toString('hex')}${ext}`
    const parts = [cfg.pathPrefix?.replace(/\/$/, ''), options?.prefix, filename].filter(Boolean)
    const key = parts.join('/')

    await client.send(new PutObjectCommand({
      Bucket: cfg.bucket!,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }))

    const url = cfg.accessMode === 'private'
      ? key  // store key only; URL generated on-demand
      : cfg.publicUrl
        ? `${cfg.publicUrl.replace(/\/$/, '')}/${key}`
        : key  // R2 has no default public URL — require publicUrl for public buckets

    return { url, key }
  },

  async delete(key) {
    const cfg = await getConfig()
    const client = buildClient(cfg)
    await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket!, Key: key }))
  },

  async getUrl(key) {
    const cfg = await getConfig()

    if (cfg.accessMode === 'private') {
      const client = buildClient(cfg)
      return getSignedUrl(client, new GetObjectCommand({ Bucket: cfg.bucket!, Key: key }), {
        expiresIn: SIGNED_URL_TTL,
      })
    }

    if (!cfg.publicUrl) {
      throw new Error('R2 public bucket requires a public_url configured in Settings > Media.')
    }
    return `${cfg.publicUrl.replace(/\/$/, '')}/${key}`
  },
}
