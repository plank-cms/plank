import { intro, outro, text, spinner, note, isCancel, cancel } from '@clack/prompts'
import chalk from 'chalk'
import { randomBytes } from 'node:crypto'
import { resolve, join } from 'node:path'
import fs from 'fs-extra'
import { execa } from 'execa'

const PACKAGE_VERSION = '0.8.0'

function generateSecret(): string {
  return randomBytes(32).toString('hex')
}

function buildEnv(jwtSecret: string, encryptionKey: string): string {
  return [
    `PLANK_DATABASE_URL=postgresql://user:password@localhost:5432/plank`,
    `PLANK_JWT_SECRET=${jwtSecret}`,
    `PLANK_ENCRYPTION_KEY=${encryptionKey}`,
    `PLANK_PORT=5500`,
  ].join('\n') + '\n'
}

function buildPackageJson(name: string): object {
  return {
    name,
    version: '0.1.0',
    private: true,
    scripts: {
      start: 'plank start',
    },
    dependencies: {
      '@am25/plank-cms': PACKAGE_VERSION,
    },
  }
}

export async function init(projectName?: string): Promise<void> {
  intro(chalk.bold('▲ Plank CMS'))

  const useCurrentDir = projectName === '.'
  let name = useCurrentDir ? undefined : projectName

  if (!name) {
    if (useCurrentDir) {
      name = process.cwd().split('/').pop() ?? 'plank-cms'
    } else {
      const answer = await text({
        message: 'Project name',
        placeholder: 'my-plank-cms',
        defaultValue: 'my-plank-cms',
        validate(value) {
          if (!value.trim()) return 'Project name is required'
          if (!/^[a-z0-9-_]+$/.test(value)) return 'Use only lowercase letters, numbers, hyphens, and underscores'
        },
      })

      if (isCancel(answer)) {
        cancel('Cancelled.')
        process.exit(0)
      }

      name = answer as string
    }
  }

  const projectDir = useCurrentDir ? process.cwd() : resolve(process.cwd(), name)

  if (!useCurrentDir && await fs.pathExists(projectDir)) {
    const entries = await fs.readdir(projectDir)
    if (entries.length > 0) {
      cancel(`Directory "${name}" already exists and is not empty.`)
      process.exit(1)
    }
  }

  const s = spinner()

  s.start('Creating project...')
  await fs.ensureDir(projectDir)
  await fs.writeFile(join(projectDir, '.env'), buildEnv(generateSecret(), generateSecret()))
  await fs.writeJSON(join(projectDir, 'package.json'), buildPackageJson(name), { spaces: 2 })
  await fs.writeFile(join(projectDir, '.gitignore'), '.env\nnode_modules\n')
  s.stop('Project created')

  s.start('Installing dependencies...')
  await execa('npm', ['install'], { cwd: projectDir })
  s.stop('Dependencies installed')

  note(
    [
      `Edit ${chalk.cyan('.env')} in your project and replace:`,
      '',
      `  ${chalk.yellow('PLANK_DATABASE_URL')}=${chalk.dim('postgresql://user:password@localhost:5432/plank')}`,
      '',
      `with your real PostgreSQL connection string.`,
      '',
      `Then start your CMS:`,
      '',
      ...(!useCurrentDir ? [`  ${chalk.cyan(`cd ${name}`)}`, ''] : []),
      `  ${chalk.cyan('npm start')}`,
    ].join('\n'),
    'Next steps'
  )

  outro(`Your Plank CMS is ready${useCurrentDir ? '' : ` at ${chalk.cyan(`./${name}`)}`}`)
}
