import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const PACKAGES = [
  'packages/cli',
  'packages/core',
  'packages/db',
  'packages/schema',
  'packages/admin',
]

const newVersion = process.argv[2]

if (!newVersion) {
  console.error('Usage: node scripts/bump-version.mjs <version>')
  console.error('Example: node scripts/bump-version.mjs 0.2.0')
  process.exit(1)
}

if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(newVersion)) {
  console.error(`Invalid version: "${newVersion}" — use semver (e.g. 1.0.0, 1.0.0-beta.1)`)
  process.exit(1)
}

console.log(`\nBumping all packages to ${newVersion}\n`)

for (const pkg of PACKAGES) {
  const path = resolve(pkg, 'package.json')
  const json = JSON.parse(readFileSync(path, 'utf8'))
  const prev = json.version
  json.version = newVersion
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n')
  console.log(`  ${json.name.padEnd(24)} ${prev} → ${newVersion}`)
}

console.log('\nDone. Commit, push, then create a GitHub Release to publish.\n')
