export type PreviewSettings = Record<string, string>

export type PreviewConfig = {
  enabled: boolean
  syncUrl: string
  urlTemplate: string
  slugField: string
}

export type PreviewEntryLike = Record<string, unknown> & {
  id?: string
  status?: string
}

export const PREVIEW_WINDOW_NAME = 'plank-preview'

type PreviewPlaceholder = 'contentType' | 'entryId' | 'slug' | 'status'

function replacePlaceholders(
  template: string,
  values: Record<PreviewPlaceholder, string | null>,
): string | null {
  let unresolved = false

  const replaced = template.replace(/\{(contentType|entryId|slug|status)\}/g, (_match, key) => {
    const value = values[key as PreviewPlaceholder]
    if (value == null || value === '') {
      unresolved = true
      return ''
    }
    return encodeURIComponent(value)
  })

  if (unresolved) return null
  if (/\{[^}]+\}/.test(replaced)) return null

  return replaced
}

export function parsePreviewConfig(settings?: PreviewSettings | null): PreviewConfig {
  return {
    enabled: String(settings?.enabled ?? 'false').toLowerCase() === 'true',
    syncUrl: settings?.sync_url?.trim() ?? '',
    urlTemplate: settings?.url_template?.trim() ?? '',
    slugField: settings?.slug_field?.trim() || 'slug',
  }
}

export function parsePreviewClientSettings(settings?: PreviewSettings | null): PreviewConfig {
  return {
    enabled: String(settings?.preview_enabled ?? 'false').toLowerCase() === 'true',
    syncUrl: settings?.preview_sync_url?.trim() ?? '',
    urlTemplate: settings?.preview_url_template?.trim() ?? '',
    slugField: settings?.preview_slug_field?.trim() || 'slug',
  }
}

export function getPreviewSetupError(
  config: PreviewConfig,
  fieldNames: string[],
): string | null {
  if (!config.enabled) return null
  if (!config.urlTemplate) return 'Set a preview URL template in Settings > Overview > Preview.'
  if (config.syncUrl) {
    try {
      new URL(config.syncUrl)
    } catch {
      return 'Preview sync webhook URL must be an absolute URL.'
    }
  }

  if (config.urlTemplate.includes('{slug}') && !fieldNames.includes(config.slugField)) {
    return `Preview slug field "${config.slugField}" does not exist on this content type.`
  }

  const sampleUrl = replacePlaceholders(config.urlTemplate, {
    contentType: 'sample-content',
    entryId: 'sample-entry',
    slug: 'sample-slug',
    status: 'draft',
  })

  if (!sampleUrl) {
    return 'Preview URL template contains unsupported or unresolved placeholders.'
  }

  try {
    new URL(sampleUrl)
    return null
  } catch {
    return 'Preview URL template must resolve to an absolute URL.'
  }
}

export function resolvePreviewUrl(params: {
  config: PreviewConfig
  contentType: string
  entry: PreviewEntryLike
  status?: string
}): string | null {
  const { config, contentType, entry, status } = params

  if (!config.enabled || !config.urlTemplate) return null

  const slugValue = entry[config.slugField]
  const url = replacePlaceholders(config.urlTemplate, {
    contentType,
    entryId: entry.id ? String(entry.id) : null,
    slug: typeof slugValue === 'string' && slugValue.trim() ? slugValue.trim() : null,
    status: status ?? (typeof entry.status === 'string' ? entry.status : null),
  })

  if (!url) return null

  try {
    return new URL(url).toString()
  } catch {
    return null
  }
}
