import { intro, outro, spinner } from '@clack/prompts'
import chalk from 'chalk'
import { execa } from 'execa'
import fs from 'fs-extra'
import { join } from 'node:path'

const PACKAGE_NAME = '@plank-cms/plank'

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

  s.start(`Updating ${PACKAGE_NAME} to ${chalk.cyan(version)}...`)

  try {
    await execa('npm', ['install', '--save-exact', target], {
      cwd: process.cwd(),
      stdio: 'inherit',
    })
  } catch (error) {
    s.stop(chalk.red('Update failed'))
    throw error
  }

  s.stop(`Updated ${PACKAGE_NAME}`)
  outro(`Plank is now installed from ${chalk.cyan(target)}`)
}
