/// <reference types="vite/client" />

import type * as ReactNamespace from 'react'
import type { AdminAddonRuntimeModule } from '@/shared/lib/addons.ts'

declare global {
  const __PLANK_BUILD_INFO__: {
    version: string
    gitSha: string | null
    author: { name: string; url: string }
    license: string
    licenseText: string
    dependencies: { name: string; version: string; license: string }[]
  }

  interface Window {
    React: typeof ReactNamespace
    PlankAddonAdminModules?: Record<string, AdminAddonRuntimeModule>
  }
}
