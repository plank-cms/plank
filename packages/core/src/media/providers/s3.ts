import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { extname } from 'node:path'
import { randomBytes } from 'node:crypto'
import { getSetting } from '../../lib/settings.js'
import type { MediaProvider, UploadOptions } from '../index.js'

const SIGNED_URL_TTL = 3600 // 1 hour

async function getConfig() {
  const [accessKeyId, secretAccessKey, region, bucket, pathPrefix, accessMode, publicUrl] =
    await Promise.all([
      getSetting('media', 's3.access_key_id'),
      getSetting('media', 's3.secret_access_key'),
      getSetting('media', 's3.region'),
      getSetting('media', 's3.bucket'),
      getSetting('media', 's3.path_prefix'),
      getSetting('media', 's3.access_mode'),
      getSetting('media', 's3.public_url'),
    ])

  return { accessKeyId, secretAccessKey, region, bucket, pathPrefix, accessMode, publicUrl }
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

export const s3Provider: MediaProvider = {
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
        : `https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com/${key}`

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

    return cfg.publicUrl
      ? `${cfg.publicUrl.replace(/\/$/, '')}/${key}`
      : `https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com/${key}`
  },
}
