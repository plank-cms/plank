import { defineConfig } from 'tsup'
import { cp, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  banner: { js: '#!/usr/bin/env node' },
  noExternal: ['@plank-cms/core', '@plank-cms/db', '@plank-cms/schema'],
  clean: true,
  dts: false,
  async onSuccess() {
    const dist = join(__dirname, 'dist')

    await mkdir(join(dist, 'migrations'), { recursive: true })
    await cp(join(__dirname, '../db/src/migrations'), join(dist, 'migrations'), { recursive: true })

    try {
      await mkdir(join(dist, 'admin'), { recursive: true })
      await cp(join(__dirname, '../core/public/admin'), join(dist, 'admin'), { recursive: true })
    } catch {
      console.warn('[cli] Admin assets not found — run pnpm --filter @plank-cms/admin build first')
    }

    await mkdir(join(dist, 'templates'), { recursive: true })
    await cp(join(__dirname, '../core/templates'), join(dist, 'templates'), { recursive: true })
  },
})
