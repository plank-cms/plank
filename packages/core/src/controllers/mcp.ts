import type { Request, Response } from 'express'
import { findAllContentTypes, findContentTypeBySlug } from '@plank-cms/schema'
import { getSettings } from '../lib/settings.js'
import { getCurrentVersion } from '../lib/version.js'

const MCP_PROTOCOL_VERSION = '2025-11-25'
const JSON_RPC_VERSION = '2.0'
const CONTENT_TYPES_URI = 'plank://content-types'
const LOCALES_URI = 'plank://locales'

type JsonRpcId = string | number

type JsonRpcError = {
  code: number
  message: string
  data?: unknown
}

type JsonRpcRequest = {
  jsonrpc?: string
  id?: JsonRpcId
  method?: string
  params?: unknown
}

type JsonRpcResponse = {
  jsonrpc: '2.0'
  id: JsonRpcId | null
  result?: unknown
  error?: JsonRpcError
}

type ContentTypeSummary = {
  name: string
  slug: string
  kind: 'collection' | 'single'
  previewEnabled: boolean
  isDefault: boolean
  schemaUri: string
  updatedAt: string | null
}

function buildSchemaUri(slug: string): string {
  return `plank://content-types/${slug}/schema`
}

function parseLocales(raw: string | undefined, fallback: string): string[] {
  if (!raw) return [fallback]

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [fallback]

    const locales = parsed.filter((value): value is string => typeof value === 'string' && value.length > 0)
    return locales.length > 0 ? [...new Set(locales)] : [fallback]
  } catch {
    return [fallback]
  }
}

async function getLocalesPayload(): Promise<{ defaultLocale: string; locales: string[] }> {
  const settings = await getSettings('general')
  const defaultLocale = settings.default_locale ?? 'en'
  const locales = parseLocales(settings.locales, defaultLocale)

  if (!locales.includes(defaultLocale)) {
    locales.unshift(defaultLocale)
  }

  return { defaultLocale, locales }
}

async function getContentTypeSummaries(): Promise<ContentTypeSummary[]> {
  const contentTypes = await findAllContentTypes()
  return contentTypes.map((contentType) => ({
    name: contentType.name,
    slug: contentType.slug,
    kind: contentType.kind,
    previewEnabled: contentType.previewEnabled ?? true,
    isDefault: contentType.isDefault ?? false,
    schemaUri: buildSchemaUri(contentType.slug),
    updatedAt: contentType.updatedAt?.toISOString() ?? null,
  }))
}

async function listResources() {
  const contentTypes = await getContentTypeSummaries()

  return [
    {
      name: 'content-types',
      title: 'Content Types',
      uri: CONTENT_TYPES_URI,
      description: 'Lists the content types available in this Plank instance.',
      mimeType: 'application/json',
    },
    {
      name: 'locales',
      title: 'Locales',
      uri: LOCALES_URI,
      description: 'Lists the enabled locales and the default locale for this Plank instance.',
      mimeType: 'application/json',
    },
    ...contentTypes.map((contentType) => ({
      name: `content-type-schema-${contentType.slug}`,
      title: `${contentType.name} schema`,
      uri: contentType.schemaUri,
      description: `Schema for the "${contentType.slug}" content type.`,
      mimeType: 'application/json',
      annotations: contentType.updatedAt
        ? {
            lastModified: contentType.updatedAt,
          }
        : undefined,
    })),
  ]
}

async function readResource(uri: string) {
  if (uri === CONTENT_TYPES_URI) {
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ contentTypes: await getContentTypeSummaries() }, null, 2),
        },
      ],
    }
  }

  if (uri === LOCALES_URI) {
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(await getLocalesPayload(), null, 2),
        },
      ],
    }
  }

  const match = /^plank:\/\/content-types\/([^/]+)\/schema$/.exec(uri)
  if (!match) {
    throw buildJsonRpcError(-32602, 'Unknown resource URI', { uri })
  }

  const slug = decodeURIComponent(match[1] ?? '')
  const contentType = await findContentTypeBySlug(slug)
  if (!contentType) {
    throw buildJsonRpcError(-32004, 'Content type not found', { slug })
  }

  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(contentType, null, 2),
      },
    ],
  }
}

function buildJsonRpcError(code: number, message: string, data?: unknown): JsonRpcError {
  return data === undefined ? { code, message } : { code, message, data }
}

function buildResult(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return {
    jsonrpc: JSON_RPC_VERSION,
    id,
    result,
  }
}

function buildError(id: JsonRpcId | null, error: JsonRpcError): JsonRpcResponse {
  return {
    jsonrpc: JSON_RPC_VERSION,
    id,
    error,
  }
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function handleRequest(message: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  if (message.jsonrpc !== JSON_RPC_VERSION) {
    return buildError(message.id ?? null, buildJsonRpcError(-32600, 'Invalid JSON-RPC version'))
  }

  if (typeof message.method !== 'string' || message.method.length === 0) {
    return buildError(message.id ?? null, buildJsonRpcError(-32600, 'Invalid method'))
  }

  if (message.id === undefined) {
    if (message.method === 'notifications/initialized') {
      return null
    }

    return null
  }

  try {
    switch (message.method) {
      case 'initialize': {
        const version = await getCurrentVersion()
        return buildResult(message.id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {
            resources: {},
          },
          serverInfo: {
            name: 'plank-cms',
            title: 'Plank CMS',
            version,
          },
          instructions:
            'Use resources/list to discover available resources, then resources/read to load Plank content types, per-type schemas, and locales.',
        })
      }

      case 'ping':
        return buildResult(message.id, {})

      case 'resources/list':
        return buildResult(message.id, { resources: await listResources() })

      case 'resources/read': {
        const uri = (message.params as { uri?: unknown } | undefined)?.uri
        if (typeof uri !== 'string' || uri.length === 0) {
          return buildError(message.id, buildJsonRpcError(-32602, 'A resource URI is required'))
        }

        return buildResult(message.id, await readResource(uri))
      }

      default:
        return buildError(message.id, buildJsonRpcError(-32601, 'Method not found', { method: message.method }))
    }
  } catch (error) {
    if (isJsonRpcError(error)) {
      return buildError(message.id, error)
    }

    return buildError(message.id, buildJsonRpcError(-32603, 'Internal server error'))
  }
}

function isJsonRpcError(error: unknown): error is JsonRpcError {
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error
}

export async function handleMcpRequest(req: Request, res: Response): Promise<void> {
  const payload = req.body as unknown

  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      res.status(400).json(buildError(null, buildJsonRpcError(-32600, 'Batch requests cannot be empty')))
      return
    }

    const responses = (
      await Promise.all(
        payload.map(async (message) => {
          if (!isJsonRpcRequest(message)) {
            return buildError(null, buildJsonRpcError(-32600, 'Invalid request'))
          }

          return await handleRequest(message)
        }),
      )
    ).filter((response): response is JsonRpcResponse => response !== null)

    if (responses.length === 0) {
      res.status(202).end()
      return
    }

    res.json(responses)
    return
  }

  if (!isJsonRpcRequest(payload)) {
    res.status(400).json(buildError(null, buildJsonRpcError(-32600, 'Invalid request')))
    return
  }

  const response = await handleRequest(payload)
  if (!response) {
    res.status(202).end()
    return
  }

  res.json(response)
}

export function handleMcpGet(_req: Request, res: Response): void {
  res.status(200).json({
    name: 'plank-cms',
    transport: 'streamable-http',
    endpoint: '/mcp',
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: ['resources'],
  })
}

export function handleMcpDelete(_req: Request, res: Response): void {
  res.status(405).json({ error: 'Session termination is not supported' })
}
