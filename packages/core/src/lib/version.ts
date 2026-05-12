import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const PACKAGE_NAME = '@plank-cms/plank'
const CHANGELOG_BASE_URL = 'https://github.com/plank-cms/plank/releases'
const UPDATE_COMMAND = 'npm run update'
const REGISTRY_URL = `https://registry.npmjs.org/${encodeURIComponent(PACKAGE_NAME)}/latest`
const CACHE_TTL_MS = 1000 * 60 * 30
const packageJsonUrl = new URL('../../package.json', import.meta.url)

type VersionCheckResult = {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  changelogUrl: string
  updateCommand: string
  checkedAt: string
}

type CachedVersionCheck = {
  expiresAt: number
  value: VersionCheckResult
}

let cachedVersionCheck: CachedVersionCheck | null = null

function normalizeVersion(value: string): number[] {
  return value
    .trim()
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)
}

function compareVersions(a: string, b: string): number {
  const left = normalizeVersion(a)
  const right = normalizeVersion(b)
  const maxLength = Math.max(left.length, right.length)

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = left[index] ?? 0
    const rightPart = right[index] ?? 0
    if (leftPart > rightPart) return 1
    if (leftPart < rightPart) return -1
  }

  return 0
}

function getChangelogUrl(version: string | null): string {
  return version ? `${CHANGELOG_BASE_URL}/tag/${version}` : CHANGELOG_BASE_URL
}

async function readCurrentVersion(): Promise<string> {
  const packageJsonPath = fileURLToPath(packageJsonUrl)
  const raw = await readFile(packageJsonPath, 'utf8')
  const parsed = JSON.parse(raw) as { version?: string }
  return parsed.version ?? '0.0.0'
}

export async function getVersionCheck(): Promise<VersionCheckResult> {
  if (cachedVersionCheck && cachedVersionCheck.expiresAt > Date.now()) {
    return cachedVersionCheck.value
  }

  const currentVersion = await readCurrentVersion()
  let latestVersion: string | null = null

  try {
    const response = await fetch(REGISTRY_URL, {
      signal: AbortSignal.timeout(4000),
      headers: {
        Accept: 'application/json',
      },
    })

    if (response.ok) {
      const payload = (await response.json()) as { version?: string }
      latestVersion = payload.version ?? null
    }
  } catch {}

  const value: VersionCheckResult = {
    currentVersion,
    latestVersion,
    updateAvailable: latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false,
    changelogUrl: getChangelogUrl(latestVersion),
    updateCommand: UPDATE_COMMAND,
    checkedAt: new Date().toISOString(),
  }

  cachedVersionCheck = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value,
  }

  return value
}
