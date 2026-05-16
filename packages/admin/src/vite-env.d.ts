/// <reference types="vite/client" />

import type * as ReactNamespace from 'react'
import type { AdminAddonRuntimeModule } from '@/lib/addons.ts'

declare global {
  interface Window {
    React: typeof ReactNamespace
    PlankAddonAdminModules?: Record<string, AdminAddonRuntimeModule>
  }
}
