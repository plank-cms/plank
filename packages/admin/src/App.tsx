import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@/shared/context/auth.tsx'
import { KeyboardShortcutsProvider } from '@/shared/context/keyboardShortcuts.tsx'
import { SettingsProvider } from '@/shared/context/settings.tsx'
import { router } from '@/router'

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <KeyboardShortcutsProvider>
          <RouterProvider router={router} />
        </KeyboardShortcutsProvider>
      </SettingsProvider>
    </AuthProvider>
  )
}
