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
  const target = `${PACKAGE_NAME}@${version}`
  const packageManager = await detectPackageManager(process.cwd())
  const updateCommand = getUpdateDependencyCommand(packageManager, target)

  s.start(`Updating ${PACKAGE_NAME} to ${chalk.cyan(version)}...`)

  try {
    await execa(updateCommand.command, updateCommand.args, {
      cwd: process.cwd(),
      stdio: 'inherit',
    })
    await ensurePnpmDeployConfig(packageManager, packageJsonPath)
  } catch (error) {
    s.stop(chalk.red('Update failed'))
    throw error
  }

  s.stop(`Updated ${PACKAGE_NAME}`)
  outro(`Plank is now installed from ${chalk.cyan(target)}`)
}
