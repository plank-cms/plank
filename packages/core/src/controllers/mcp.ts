import type { Request, Response } from 'express'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server'
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node'
import { z } from 'zod'
import { findAllContentTypes, findContentTypeBySlug, ValidationError } from '@plank-cms/schema'
import { getSettings } from '../lib/settings.js'
import { getCurrentVersion } from '../lib/version.js'
import { resolveAppModes } from '../lib/appModes.js'
import { resolveMcpIdentity, hasMcpPermission } from '../services/mcpAuth.js'
import type { McpIdentity } from '../services/mcpAuth.js'
import { EntryError, listEntryData, getEntryData } from '../services/entries.js'
import type { EntryContext } from '../services/entries.js'
import { writeMcpEntry, McpEntryError } from '../services/mcpEntries.js'
import { searchMcpEntries } from '../services/mcpSearch.js'

const CONTENT_TYPES_URI = 'plank://content-types'
const LOCALES_URI = 'plank://locales'

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

    const locales = parsed.filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    )
    return locales.length > 0 ? [...new Set(locales)] : [fallback]
  } catch {
    return [fallback]
  }
}

export async function getLocalesPayload(): Promise<{ defaultLocale: string; locales: string[] }> {
  const settings = await getSettings('general')
  const defaultLocale = settings.default_locale ?? 'en'
  const locales = parseLocales(settings.locales, defaultLocale)

  if (!locales.includes(defaultLocale)) {
    locales.unshift(defaultLocale)
  }

  return { defaultLocale, locales }
}

export async function getContentTypeSummaries(): Promise<ContentTypeSummary[]> {
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

function toolResult(payload: Record<string, unknown>, isError = false) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
    structuredContent: payload,
    ...(isError ? { isError: true } : {}),
  }
}

export function mcpError(error: unknown) {
  if (error instanceof McpEntryError)
    return toolResult({ error: { code: error.code, message: error.message } }, true)
  if (error instanceof ValidationError)
    return toolResult(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Entry validation failed',
          details: error.errors,
        },
      },
      true,
    )
  if (error instanceof EntryError) {
    const code =
      error.status === 404 ? 'NOT_FOUND' : error.status === 403 ? 'FORBIDDEN' : 'INVALID_ARGUMENT'
    return toolResult({ error: { code, message: error.message } }, true)
  }
  const code = (error as { code?: string })?.code
  if (code === '23505')
    return toolResult(
      { error: { code: 'CONFLICT', message: 'A unique value already exists.' } },
      true,
    )
  if (code === '23503')
    return toolResult(
      { error: { code: 'INVALID_REFERENCE', message: 'An entry reference is invalid.' } },
      true,
    )
  return toolResult({ error: { code: 'INTERNAL_ERROR', message: 'The operation failed.' } }, true)
}

async function resourceOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof EntryError) throw error
    throw new Error('The resource operation failed.', { cause: error })
  }
}

const slugSchema = z.string().min(1)
const dataSchema = z.record(z.string(), z.unknown())

export async function createMcpServer(tokenId: string, identity: McpIdentity) {
  const server = new McpServer(
    { name: 'plank-cms', title: 'Plank CMS', version: await getCurrentVersion() },
    {
      instructions:
        'Discover content types and field formats before writing. Create drafts or edit working content only. Publishing, scheduling, deleting and media management require the Plank admin. Read an entry before editing it. Rich text is a JSON-stringified TipTap document.',
    },
  )
  async function authorize(permission?: string) {
    const current = await resolveMcpIdentity(tokenId)
    if (!current) throw new EntryError(403, 'The MCP token or its owner is no longer available')
    if (permission && !hasMcpPermission(current, permission)) throw new EntryError(403, 'Forbidden')
    return current
  }
  const contents = (uri: string, payload: unknown) => ({
    contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(payload) }],
  })
  server.registerResource(
    'locales',
    LOCALES_URI,
    { title: 'Locales', mimeType: 'application/json' },
    async (uri) =>
      resourceOperation(async () => {
        await authorize()
        return contents(uri.href, await getLocalesPayload())
      }),
  )
  if (hasMcpPermission(identity, 'content-types:read')) {
    server.registerResource(
      'content-types',
      CONTENT_TYPES_URI,
      { title: 'Content Types', mimeType: 'application/json' },
      async (uri) =>
        resourceOperation(async () => {
          await authorize('content-types:read')
          return contents(uri.href, { contentTypes: await getContentTypeSummaries() })
        }),
    )
    server.registerResource(
      'content-type-schema',
      new ResourceTemplate('plank://content-types/{slug}/schema', {
        list: async () =>
          resourceOperation(async () => {
            await authorize('content-types:read')
            return {
              resources: (await getContentTypeSummaries()).map((ct) => ({
                name: `content-type-schema-${ct.slug}`,
                title: `${ct.name} schema`,
                uri: ct.schemaUri,
                mimeType: 'application/json',
              })),
            }
          }),
      }),
      { title: 'Content type schema', mimeType: 'application/json' },
      async (uri, variables) =>
        resourceOperation(async () => {
          await authorize('content-types:read')
          const ct = await findContentTypeBySlug(String(variables.slug))
          if (!ct) throw new EntryError(404, 'Content type not found')
          return contents(uri.href, ct)
        }),
    )
  }
  function register<T extends z.ZodRawShape>(
    name: string,
    description: string,
    inputSchema: T,
    permission: string | undefined,
    readOnly: boolean,
    run: (input: z.infer<z.ZodObject<T>>, current: McpIdentity) => Promise<Record<string, unknown>>,
  ) {
    if (permission && !hasMcpPermission(identity, permission)) return
    server.registerTool(
      name,
      {
        description,
        inputSchema: z.object(inputSchema).strict(),
        annotations: {
          readOnlyHint: readOnly,
          destructiveHint: !readOnly,
          idempotentHint: readOnly,
          openWorldHint: false,
        },
      },
      async (input) => {
        try {
          return toolResult(await run(input, await authorize(permission)))
        } catch (error) {
          return mcpError(error)
        }
      },
    )
  }
  register(
    'list_content_types',
    'List available content types and their schema resource URIs.',
    {},
    'content-types:read',
    true,
    async () => ({ contentTypes: await getContentTypeSummaries() }),
  )
  register(
    'get_content_type_schema',
    'Read field definitions. Rich text is a JSON-stringified TipTap document. Relations use entry IDs; media uses existing references. localized contains locale-keyed field objects and optional _meta.enabled/_meta.primary.',
    { slug: slugSchema },
    'content-types:read',
    true,
    async ({ slug }) => {
      const ct = await findContentTypeBySlug(slug)
      if (!ct) throw new EntryError(404, 'Content type not found')
      return { contentType: ct }
    },
  )
  register(
    'get_locales',
    'Read enabled locales and the default locale.',
    {},
    undefined,
    true,
    getLocalesPayload,
  )
  register(
    'search_entries',
    'Search entries across all content types in one request. Returns compact titles, content types, current status, authors and update dates. For the user\'s own entries pass author: "me"; omit author for all accessible entries or pass a user ID. Use status: "draft" for drafts, including previously published entries. Follow hasMore and page to retrieve every result. Use get_entry for full content.',
    {
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
      search: z.string().optional(),
      status: z.enum(['draft', 'published', 'scheduled', 'pending', 'in_review']).optional(),
      author: z.string().min(1).optional(),
    },
    'entries:read',
    true,
    async ({ author, ...query }, current) =>
      searchMcpEntries({ ...query, author: author === 'me' ? current.id : author }),
  )
  register(
    'list_entries',
    'Search working entries, including drafts, with pagination. Text search defaults to all textual fields.',
    {
      slug: slugSchema,
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
      search: z.string().optional(),
      searchFields: z.array(z.string()).optional(),
      status: z.enum(['draft', 'published', 'scheduled', 'pending', 'in_review']).optional(),
      sort: z.string().optional(),
      order: z.enum(['asc', 'desc']).optional(),
    },
    'entries:read',
    true,
    async ({ slug, searchFields, ...query }) => {
      const ct = await findContentTypeBySlug(slug)
      if (!ct) throw new EntryError(404, 'Content type not found')
      const fields =
        searchFields ??
        ct.fields
          .filter((field) => ['string', 'uid', 'text', 'richtext'].includes(field.type))
          .map((field) => field.name)
      return listEntryData({
        slug,
        id: '',
        data: {},
        query: { ...query, searchFields: fields.join(',') },
      })
    },
  )
  register(
    'get_entry',
    'Read the working content of an entry by content type slug and entry ID.',
    { slug: slugSchema, id: z.string().min(1) },
    'entries:read',
    true,
    async ({ slug, id }) => ({ entry: await getEntryData({ slug, id, data: {}, query: {} }) }),
  )
  for (const create of [true, false]) {
    register(
      create ? 'create_entry' : 'update_entry',
      create
        ? 'Create a draft. Single types must not already exist. Only schema fields and localized are accepted.'
        : 'Patch working content without publishing. Omitted fields are preserved, arrays replaced, localized fields merged. Scheduled entries and unsafe public relationships must be edited in the admin.',
      { slug: slugSchema, ...(create ? {} : { id: z.string().min(1) }), data: dataSchema },
      'entries:write',
      false,
      async (input, current) => {
        const context: EntryContext = {
          slug: input.slug,
          id: 'id' in input ? String(input.id) : '',
          data: input.data,
          query: {},
          user: { id: current.id, roleId: current.roleId },
          editorial: (await resolveAppModes()).editorial,
        }
        return { entry: await writeMcpEntry(context, create) }
      },
    )
  }
  return server
}

export async function handleMcpRequest(req: Request, res: Response): Promise<void> {
  if (req.method !== 'POST') {
    res.set('Allow', 'POST').status(405).end()
    return
  }
  const tokenId = req.apiToken!.id
  const identity = await resolveMcpIdentity(tokenId)
  if (!identity) {
    res.status(401).json({ error: 'MCP token owner is unavailable or disabled' })
    return
  }
  const server = await createMcpServer(tokenId, identity)
  const transport = new NodeStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  res.once('close', () => {
    void server.close().catch(() => {})
  })
  await server.connect(transport)
  await transport.handleRequest(req, res, req.body)
}
