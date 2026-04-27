import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { extname } from 'node:path'
import { randomBytes } from 'node:crypto'
import { getSetting } from '../../lib/settings.js'
import type { MediaProvider, UploadOptions } from '../index.js'

async function getConfig() {
  const [accessKeyId, secretAccessKey, accountId, bucket, pathPrefix, publicUrl] =
    await Promise.all([
      getSetting('media', 'r2.access_key_id'),
      getSetting('media', 'r2.secret_access_key'),
      getSetting('media', 'r2.account_id'),
      getSetting('media', 'r2.bucket'),
      getSetting('media', 'r2.path_prefix'),
      getSetting('media', 'r2.public_url'),
    ])

  return { accessKeyId, secretAccessKey, accountId, bucket, pathPrefix, publicUrl }
}

function buildClient(cfg: Awaited<ReturnType<typeof getConfig>>) {
  if (!cfg.accessKeyId || !cfg.secretAccessKey || !cfg.accountId) {
    throw new Error('R2 provider is not configured. Set access_key_id, secret_access_key, and account_id in Settings > Media.')
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
}

function buildKey(cfg: Awaited<ReturnType<typeof getConfig>>, filename: string, prefix?: string): string {
  const ext = extname(filename)
  const name = `${randomBytes(16).toString('hex')}${ext}`
  const parts = [cfg.pathPrefix?.replace(/\/$/, ''), prefix, name].filter(Boolean)
  return parts.join('/')
}

function buildStoredUrl(cfg: Awaited<ReturnType<typeof getConfig>>, key: string): string {
  if (!cfg.publicUrl) {
    throw new Error('R2 provider requires a public_url configured in Settings > Media.')
  }
  return `${cfg.publicUrl.replace(/\/$/, '')}/${key}`
}

export const r2Provider: MediaProvider = {
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

  async uploadRaw(buffer, exactKey, mimeType) {
    const cfg = await getConfig()
    const client = buildClient(cfg)
    await client.send(new PutObjectCommand({
      Bucket: cfg.bucket!,
      Key: exactKey,
      Body: buffer,
      ContentType: mimeType,
    }))
    return { url: buildStoredUrl(cfg, exactKey), key: exactKey }
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

  async presign(filename, mimeType, options) {
    const cfg = await getConfig()
    const client = buildClient(cfg)
    const key = buildKey(cfg, filename, options?.prefix)
    const command = new PutObjectCommand({ Bucket: cfg.bucket!, Key: key, ContentType: mimeType })
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 })
    return { key, uploadUrl, publicUrl: buildStoredUrl(cfg, key) }
  },
}
