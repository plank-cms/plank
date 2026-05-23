import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import fs from 'fs-extra'

export type PackageManagerName = 'npm' | 'pnpm'

type PackageJsonShape = {
  packageManager?: string
}

function parsePackageManagerName(value?: string): PackageManagerName | null {
  if (!value) return null
  if (value.startsWith('pnpm@') || value === 'pnpm') return 'pnpm'
  if (value.startsWith('npm@') || value === 'npm') return 'npm'
  return null
}

function parseUserAgentPackageManager(userAgent = process.env.npm_config_user_agent): {
  name: PackageManagerName
  version: string | null
} | null {
  if (!userAgent) return null

  const [descriptor] = userAgent.split(' ')
  const [name, version] = descriptor.split('/')
  const parsedName = parsePackageManagerName(name)

  if (!parsedName) return null

  return {
    name: parsedName,
    version: version || null,
  }
}

async function readProjectPackageManager(projectDir: string): Promise<PackageManagerName | null> {
  const packageJsonPath = join(projectDir, 'package.json')

  if (!await fs.pathExists(packageJsonPath)) {
    return null
  }

  const raw = await readFile(packageJsonPath, 'utf8')
  const parsed = JSON.parse(raw) as PackageJsonShape

  return parsePackageManagerName(parsed.packageManager)
}

async function readLockfilePackageManager(projectDir: string): Promise<PackageManagerName | null> {
  if (await fs.pathExists(join(projectDir, 'pnpm-lock.yaml'))) {
    return 'pnpm'
  }

  if (await fs.pathExists(join(projectDir, 'package-lock.json'))) {
    return 'npm'
  }

  return null
}

export async function detectPackageManager(projectDir: string): Promise<PackageManagerName> {
  const projectPackageManager = await readProjectPackageManager(projectDir)
  if (projectPackageManager) return projectPackageManager

  const lockfilePackageManager = await readLockfilePackageManager(projectDir)
  if (lockfilePackageManager) return lockfilePackageManager

  return parseUserAgentPackageManager()?.name ?? 'npm'
}

export function getPackageManagerVersion(name: PackageManagerName): string | null {
  const userAgentPackageManager = parseUserAgentPackageManager()

  if (userAgentPackageManager?.name === name) {
    return userAgentPackageManager.version
  }

  return null
}

export function getInstallCommand(name: PackageManagerName): {
  command: string
  args: string[]
} {
  if (name === 'pnpm') {
    return {
      command: 'pnpm',
      args: ['install'],
    }
  }

  return {
    command: 'npm',
    args: ['install'],
  }
}

export function getUpdateDependencyCommand(
  name: PackageManagerName,
  target: string,
): {
  command: string
  args: string[]
} {
  if (name === 'pnpm') {
    return {
      command: 'pnpm',
      args: ['add', '--save-exact', target],
    }
  }

  return {
    command: 'npm',
    args: ['install', '--save-exact', target],
  }
}

export function getStartScriptCommand(name: PackageManagerName): string {
  return name === 'pnpm' ? 'pnpm plank' : 'npm run plank'
}

export function getUpdateScriptCommand(name: PackageManagerName): string {
  return name === 'pnpm' ? 'pnpm plank update' : 'npm run plank -- update'
}
