export function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stableValue(v)]),
    )
  }
  return value
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value))
}

export function parseDuplicatedFieldName(errorMessage: string): string | null {
  const match = errorMessage.match(/Field "([^"]+)" already exists\.?/)
  if (!match) return null
  return match[1] ?? null
}
