import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_NAME = '@plank-cms/plank'
const CHANGELOG_BASE_URL = 'https://github.com/plank-cms/plank/releases'
const REGISTRY_URL = `https://registry.npmjs.org/${encodeURIComponent(PACKAGE_NAME)}/latest`
const CACHE_TTL_MS = 1000 * 60 * 30
const packageJsonUrls = [
  new URL('../../package.json', import.meta.url),
  new URL('../package.json', import.meta.url),
]

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

type ProjectPackageJson = {
  packageManager?: string
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

function getUpdateCommandForPackageManager(packageManager: string | null): string {
  return packageManager === 'pnpm' ? 'pnpm run update' : 'npm run update'
}

async function detectProjectPackageManager(): Promise<string | null> {
  try {
    const raw = await readFile(join(process.cwd(), 'package.json'), 'utf8')
    const parsed = JSON.parse(raw) as ProjectPackageJson

    if (parsed.packageManager?.startsWith('pnpm@') || parsed.packageManager === 'pnpm') {
      return 'pnpm'
    }

    if (parsed.packageManager?.startsWith('npm@') || parsed.packageManager === 'npm') {
      return 'npm'
    }
  } catch {
    return await detectPackageManagerFromLockfiles()
  }

  return await detectPackageManagerFromLockfiles()
}

async function hasLockfile(filename: string): Promise<boolean> {
  try {
    await readFile(join(process.cwd(), filename), 'utf8')
    return true
  } catch {
    return false
  }
}

async function detectPackageManagerFromLockfiles(): Promise<string | null> {
  if (await hasLockfile('pnpm-lock.yaml')) {
    return 'pnpm'
  }

  if (await hasLockfile('package-lock.json')) {
    return 'npm'
  }

  return null
}

export async function getCurrentVersion(): Promise<string> {
  for (const packageJsonUrl of packageJsonUrls) {
    try {
      const packageJsonPath = fileURLToPath(packageJsonUrl)
      const raw = await readFile(packageJsonPath, 'utf8')
      const parsed = JSON.parse(raw) as { version?: string }

      if (parsed.version) {
        return parsed.version
      }
    } catch {
      continue
    }
  }

  return '0.0.0'
}

export async function getVersionCheck(): Promise<VersionCheckResult> {
  if (cachedVersionCheck && cachedVersionCheck.expiresAt > Date.now()) {
    return cachedVersionCheck.value
  }

  const currentVersion = await getCurrentVersion()
  const packageManager = await detectProjectPackageManager()
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
  } catch {
    latestVersion = null
  }

  const value: VersionCheckResult = {
    currentVersion,
    latestVersion,
    updateAvailable: latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false,
    changelogUrl: getChangelogUrl(latestVersion),
    updateCommand: getUpdateCommandForPackageManager(packageManager),
    checkedAt: new Date().toISOString(),
  }

  cachedVersionCheck = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value,
  }

  return value
}
