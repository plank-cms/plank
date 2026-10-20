import { intro, outro, spinner } from '@clack/prompts'
import chalk from 'chalk'
import { execa } from 'execa'
import fs from 'fs-extra'
import { join } from 'node:path'
import {
  detectPackageManager,
  getPackageManagerSpec,
  getUpdateDependencyCommand,
  type PackageManagerName,
} from '../packageManager.js'

const PACKAGE_NAME = '@plank-cms/plank'
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[\da-z.-]+)?(?:\+[\da-z.-]+)?$/i

async function resolveUpdateVersion(
  packageManager: PackageManagerName,
  version: string,
): Promise<string> {
  if (version !== 'latest') return version

  const { stdout } = await execa(
    packageManager,
    ['view', PACKAGE_NAME, 'dist-tags.latest', '--json'],
    { cwd: process.cwd() },
  )
  const latest: unknown = JSON.parse(stdout)

  if (typeof latest !== 'string' || !VERSION_PATTERN.test(latest)) {
    throw new Error(`Could not resolve the latest version of ${PACKAGE_NAME}.`)
  }

  return latest
}

async function ensurePnpmPackageManager(packageJsonPath: string): Promise<void> {
  const packageJson = await fs.readJSON(packageJsonPath)
  packageJson.packageManager = getPackageManagerSpec('pnpm')
  await fs.writeJSON(packageJsonPath, packageJson, { spaces: 2 })
}

async function ensurePnpmWorkspacePackages(projectDir: string): Promise<void> {
  const workspacePath = join(projectDir, 'pnpm-workspace.yaml')
  if (!await fs.pathExists(workspacePath)) return

  const source = await fs.readFile(workspacePath, 'utf8')
  if (/^packages:/m.test(source)) return

  await fs.writeFile(workspacePath, `packages:\n  - "."\n\n${source}`)
}

async function ensurePnpmDeployConfig(
  packageManager: PackageManagerName,
  packageJsonPath: string,
): Promise<void> {
  if (packageManager !== 'pnpm') return

  await ensurePnpmPackageManager(packageJsonPath)
  await ensurePnpmWorkspacePackages(process.cwd())
}

export async function update(version = 'latest'): Promise<void> {
  intro(chalk.bold('▲ Plank CMS'))

  const packageJsonPath = join(process.cwd(), 'package.json')
  const hasPackageJson = await fs.pathExists(packageJsonPath)

  if (!hasPackageJson) {
    throw new Error('No package.json found in the current directory.')
  }

  const packageJson = await fs.readJSON(packageJsonPath)
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  }

  if (!dependencies[PACKAGE_NAME]) {
    throw new Error(`Current project does not depend on ${PACKAGE_NAME}.`)
  }

  const s = spinner()
  const packageManager = await detectPackageManager(process.cwd())
  let installedVersion: string

  s.start(`Resolving ${PACKAGE_NAME}@${version}...`)

  try {
    const targetVersion = await resolveUpdateVersion(packageManager, version)
    const target = `${PACKAGE_NAME}@${targetVersion}`
    const updateCommand = getUpdateDependencyCommand(packageManager, target)
    s.message(`Updating ${PACKAGE_NAME} to ${chalk.cyan(targetVersion)}...`)

    await execa(updateCommand.command, updateCommand.args, {
      cwd: process.cwd(),
      stdio: 'inherit',
    })
    const installed = (await fs.readJSON(
      join(process.cwd(), 'node_modules', PACKAGE_NAME, 'package.json'),
    )) as { version?: string }
    if (typeof installed.version !== 'string' || !VERSION_PATTERN.test(installed.version)) {
      throw new Error(`Could not verify the installed version of ${PACKAGE_NAME}.`)
    }
    if (VERSION_PATTERN.test(targetVersion) && installed.version !== targetVersion) {
      throw new Error(
        `Expected ${PACKAGE_NAME}@${targetVersion}, but ${installed.version} is installed.`,
      )
    }
    installedVersion = installed.version
    await ensurePnpmDeployConfig(packageManager, packageJsonPath)
  } catch (error) {
    s.stop(chalk.red('Update failed'))
    throw error
  }

  s.stop(`Updated ${PACKAGE_NAME} to ${installedVersion}`)
  outro(`Plank ${chalk.cyan(installedVersion)} is now installed`)
}
