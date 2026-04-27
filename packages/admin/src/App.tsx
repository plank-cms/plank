import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/auth.tsx'
import { SettingsProvider } from './context/settings.tsx'
import { KeyboardShortcutsProvider } from './context/keyboardShortcuts.tsx'
import { ProtectedRoute } from './components/ProtectedRoute.tsx'
import { Layout } from './components/Layout.tsx'
import { Login } from './pages/Login.tsx'
import { Dashboard } from './pages/Dashboard.tsx'
import { ContentTypeBuilder } from './pages/ContentTypeBuilder.tsx'
import { ContentTypesIndex } from './pages/content-types/Index.tsx'
import { ContentTypeForm } from './pages/content-types/Form.tsx'
import { ContentManager } from './pages/ContentManager.tsx'
import { ContentIndex } from './pages/content/Index.tsx'
import { ContentSlugIndex } from './pages/content/SlugIndex.tsx'
import { EntriesList } from './pages/content/EntriesList.tsx'
import { EntryForm } from './pages/content/EntryForm.tsx'
import { MediaLibrary } from './pages/MediaLibrary.tsx'
import { Settings } from './pages/Settings.tsx'
import { SettingsOverview } from './pages/settings/Overview.tsx'
import { SettingsUsers } from './pages/settings/Users.tsx'
import { SettingsRoles } from './pages/settings/Roles.tsx'
import { SettingsApiTokens } from './pages/settings/ApiTokens.tsx'
import { SettingsWebhooks } from './pages/settings/Webhooks.tsx'
import { Profile } from './pages/Profile.tsx'

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      {
        path: 'content',
        element: <ContentManager />,
        children: [
          { index: true, element: <ContentIndex /> },
          { path: ':slug', element: <ContentSlugIndex /> },
          { path: ':slug/new', element: <EntryForm /> },
          { path: ':slug/:id', element: <EntryForm /> },
        ],
      },
      { path: 'media', element: <MediaLibrary /> },
      {
        path: 'content-types',
        element: (
          <ProtectedRoute permission="content-types:read">
            <ContentTypeBuilder />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <ContentTypesIndex /> },
          { path: 'new', element: <ContentTypeForm /> },
          { path: ':slug', element: <ContentTypeForm /> },
        ],
      },
      {
        path: 'settings',
        element: (
          <ProtectedRoute permission="settings:read">
            <Settings />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <Navigate to="overview" replace /> },
          { path: 'overview', element: <SettingsOverview /> },
          { path: 'users', element: <SettingsUsers /> },
          { path: 'roles', element: <SettingsRoles /> },
          { path: 'api-tokens', element: <SettingsApiTokens /> },
          { path: 'webhooks', element: <SettingsWebhooks /> },
        ],
      },
      { path: 'profile', element: <Profile /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
], { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' })

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
