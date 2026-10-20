import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type PackageInfo = {
  version: string
  license?: string
  dependencies?: Record<string, string>
}

function readPackage(path: string): PackageInfo {
  return JSON.parse(readFileSync(path, 'utf8')) as PackageInfo
}

export function getBuildInfo(root: string) {
  const cli = JSON.parse(readFileSync(resolve(root, 'packages/cli/package.json'), 'utf8')) as {
    author: { name: string; url: string }
    license: string
  }
  const commitSha = process.env.GITHUB_SHA?.trim()
  let gitSha: string | null

  if (commitSha && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(commitSha)) {
    gitSha = commitSha.toLowerCase()
  } else {
    try {
      gitSha = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    } catch {
      gitSha = null
    }
  }

  const dependencies = new Map<string, { name: string; version: string; license: string }>()

  for (const workspace of ['admin', 'core', 'db', 'schema']) {
    const directory = resolve(root, 'packages', workspace)
    const pkg = readPackage(resolve(directory, 'package.json'))

    for (const [name, declaredVersion] of Object.entries(pkg.dependencies ?? {})) {
      if (declaredVersion.startsWith('workspace:')) continue

      let version = declaredVersion
      let license = 'Not declared'

      try {
        const installed = readPackage(resolve(directory, 'node_modules', name, 'package.json'))
        version = installed.version
        license = installed.license ?? license
      } catch {
        license = 'Unavailable'
      }

      dependencies.set(`${name}@${version}`, { name, version, license })
    }
  }

  return {
    version: readPackage(resolve(root, 'packages/admin/package.json')).version,
    gitSha,
    author: cli.author,
    license: cli.license,
    licenseText: readFileSync(resolve(root, 'LICENSE'), 'utf8'),
    dependencies: [...dependencies.values()].sort((a, b) => a.name.localeCompare(b.name)),
  }
}
