import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { update } from './update.js'

test('updates resolve latest to an exact version and verify the installed package', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'plank-update-'))
  const bin = join(directory, 'bin')
  const cwd = process.cwd()
  const originalPath = process.env.PATH
  await mkdir(bin)
  const shim = `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const args = process.argv.slice(2)
fs.appendFileSync('calls.jsonl', JSON.stringify(args) + '\\n')
const state = JSON.parse(fs.readFileSync('state.json', 'utf8'))
if (args[0] === 'view') {
  if (state.registryFailure) process.exit(1)
  process.stdout.write(JSON.stringify(state.latest))
} else {
  if (state.installFailure) process.exit(1)
  const version = state.installed ?? args.at(-1).split('@').at(-1)
  const directory = 'node_modules/@plank-cms/plank'
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ version }))
}
`
  for (const manager of ['pnpm', 'npm']) {
    await writeFile(join(bin, manager), shim, { mode: 0o755 })
  }
  process.chdir(directory)
  process.env.PATH = `${bin}:${originalPath}`
  t.after(async () => {
    process.chdir(cwd)
    if (originalPath === undefined) delete process.env.PATH
    else process.env.PATH = originalPath
    await rm(directory, { recursive: true, force: true })
  })

  async function setup(manager: string, state: Record<string, unknown> = { latest: '0.38.0' }) {
    await writeFile(
      'package.json',
      JSON.stringify({
        packageManager: `${manager}@11.10.0`,
        dependencies: { '@plank-cms/plank': '0.37.0' },
      }),
    )
    await writeFile('pnpm-workspace.yaml', 'packages:\n  - "."\nminimumReleaseAge: 1440\n')
    await writeFile('state.json', JSON.stringify(state))
    await writeFile('calls.jsonl', '')
  }

  async function calls(): Promise<string[][]> {
    return (await readFile('calls.jsonl', 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  }

  for (const manager of ['pnpm', 'npm']) {
    await t.test(`${manager} installs the exact version behind latest`, async () => {
      await setup(manager)
      await update()
      const commands = await calls()
      assert.deepEqual(commands[0], ['view', '@plank-cms/plank', 'dist-tags.latest', '--json'])
      assert.equal(commands[1].at(-1), '@plank-cms/plank@0.38.0')
      assert.equal(
        await readFile('pnpm-workspace.yaml', 'utf8'),
        'packages:\n  - "."\nminimumReleaseAge: 1440\n',
      )
    })
  }

  await t.test('explicit versions do not need a registry lookup', async () => {
    await setup('pnpm')
    await update('0.38.0')
    const commands = await calls()
    assert.equal(commands.length, 1)
    assert.equal(commands[0].at(-1), '@plank-cms/plank@0.38.0')
  })

  await t.test('a successful install command cannot hide an unchanged version', async () => {
    await setup('pnpm', { latest: '0.38.0', installed: '0.37.0' })
    await assert.rejects(update(), /Expected @plank-cms\/plank@0\.38\.0, but 0\.37\.0 is installed/)
  })

  await t.test('invalid registry metadata cannot start an installation', async () => {
    await setup('pnpm', { latest: null })
    await assert.rejects(update(), /Could not resolve the latest version/)
    assert.equal((await calls()).length, 1)
  })

  await t.test('registry failures cannot start an installation', async () => {
    await setup('pnpm', { registryFailure: true })
    await assert.rejects(update())
    assert.equal((await calls()).length, 1)
  })

  await t.test('installation failures are reported', async () => {
    await setup('pnpm', { latest: '0.38.0', installFailure: true })
    await assert.rejects(update())
  })
})
