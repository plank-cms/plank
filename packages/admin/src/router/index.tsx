import { createBrowserRouter, Navigate } from 'react-router-dom'
import { Dashboard } from '@/features/dashboard/DashboardPage.tsx'
import { Login } from '@/features/login/LoginPage.tsx'
import { ResetPassword } from '@/features/login/ResetPasswordPage.tsx'
import { MediaLibrary } from '@/features/media/MediaLibraryPage.tsx'
import { Profile } from '@/features/profile/ProfilePage.tsx'
import { AddonDetail } from '@/features/addons/routes/AddonDetailPage.tsx'
import { AddonsOverview } from '@/features/addons/routes/AddonsOverviewPage.tsx'
import { ContentIndex } from '@/features/content/ContentPage.tsx'
import { EntryForm } from '@/features/content/routes/EntryPage.tsx'
import { ContentSlugIndex } from '@/features/content/routes/ContentSlugPage.tsx'
import { ContentTypesIndex } from '@/features/content-types/ContentTypesPage.tsx'
import { ContentTypeForm } from '@/features/content-types/routes/ContentTypeFormPage.tsx'
import { SettingsApiTokens } from '@/features/settings/routes/SettingsApiTokensPage.tsx'
import { SettingsOverview } from '@/features/settings/routes/SettingsOverviewPage.tsx'
import { SettingsRoles } from '@/features/settings/routes/SettingsRolesPage.tsx'
import { SettingsUsers } from '@/features/settings/routes/SettingsUsersPage.tsx'
import { SettingsWebhooks } from '@/features/settings/routes/SettingsWebhooksPage.tsx'
import { AddonsLayout } from '@/layouts/AddonsLayout.tsx'
import { AppLayout } from '@/layouts/AppLayout.tsx'
import { ContentLayout } from '@/layouts/ContentLayout.tsx'
import { ContentTypesLayout } from '@/layouts/ContentTypesLayout.tsx'
import { ProtectedRoute } from '@/layouts/ProtectedRoute.tsx'
import { SettingsLayout } from '@/layouts/SettingsLayout.tsx'

const NON_VIEWER_ROLES = ['Super Admin', 'Admin', 'Editor', 'Contributor']

export const router = createBrowserRouter(
  [
    { path: '/login', element: <Login /> },
    { path: '/reset-password', element: <ResetPassword /> },
    {
      element: (
        <ProtectedRoute>
          <AppLayout />
        </ProtectedRoute>
      ),
      children: [
        {
          index: true,
          element: (
            <ProtectedRoute roles={NON_VIEWER_ROLES} redirectTo="/content">
              <Dashboard />
            </ProtectedRoute>
          ),
        },
        {
          path: 'content',
          element: <ContentLayout />,
          children: [
            { index: true, element: <ContentIndex /> },
            { path: ':slug', element: <ContentSlugIndex /> },
            {
              path: ':slug/new',
              element: (
                <ProtectedRoute permission="entries:write" redirectTo="/content">
                  <EntryForm />
                </ProtectedRoute>
              ),
            },
            { path: ':slug/:id', element: <EntryForm /> },
          ],
        },
        {
          path: 'media',
          element: (
            <ProtectedRoute roles={NON_VIEWER_ROLES} redirectTo="/content">
              <MediaLibrary />
            </ProtectedRoute>
          ),
        },
        {
          path: 'content-types',
          element: (
            <ProtectedRoute
              permission="content-types:write"
              roles={NON_VIEWER_ROLES}
              redirectTo="/content"
            >
              <ContentTypesLayout />
            </ProtectedRoute>
          ),
          children: [
            { index: true, element: <ContentTypesIndex /> },
            { path: 'new', element: <ContentTypeForm /> },
            { path: ':slug', element: <ContentTypeForm /> },
          ],
        },
        {
          path: 'add-ons',
          element: (
            <ProtectedRoute permission="addons:read" roles={NON_VIEWER_ROLES} redirectTo="/content">
              <AddonsLayout />
            </ProtectedRoute>
          ),
          children: [
            { index: true, element: <Navigate to="overview" replace /> },
            {
              path: 'overview',
              element: (
                <ProtectedRoute permission="addons:read">
                  <AddonsOverview />
                </ProtectedRoute>
              ),
            },
            {
              path: ':addonId',
              element: (
                <ProtectedRoute permission="addons:read">
                  <AddonDetail />
                </ProtectedRoute>
              ),
            },
          ],
        },
        {
          path: 'settings',
          element: (
            <ProtectedRoute
              permission="settings:overview:read"
              roles={NON_VIEWER_ROLES}
              redirectTo="/content"
            >
              <SettingsLayout />
            </ProtectedRoute>
          ),
          children: [
            { index: true, element: <Navigate to="overview" replace /> },
            {
              path: 'overview',
              element: (
                <ProtectedRoute permission="settings:overview:read">
                  <SettingsOverview />
                </ProtectedRoute>
              ),
            },
            {
              path: 'users',
              element: (
                <ProtectedRoute permission="settings:users:read">
                  <SettingsUsers />
                </ProtectedRoute>
              ),
            },
            {
              path: 'roles',
              element: (
                <ProtectedRoute permission="settings:roles:read">
                  <SettingsRoles />
                </ProtectedRoute>
              ),
            },
            {
              path: 'api-tokens',
              element: (
                <ProtectedRoute permission="settings:api-tokens:read">
                  <SettingsApiTokens />
                </ProtectedRoute>
              ),
            },
            {
              path: 'webhooks',
              element: (
                <ProtectedRoute permission="settings:webhooks:read">
                  <SettingsWebhooks />
                </ProtectedRoute>
              ),
            },
          ],
        },
        { path: 'profile', element: <Profile /> },
      ],
    },
    { path: '*', element: <Navigate to="/" replace /> },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
)
