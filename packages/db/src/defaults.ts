export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  'Super Admin': ['*'],
  'Admin': [
    'content-types:read', 'content-types:write',
    'entries:read', 'entries:write', 'entries:delete',
    'media:read', 'media:write', 'media:delete',
    'settings:overview:read',
    'settings:users:read', 'settings:users:write', 'settings:users:delete',
    'settings:webhooks:read', 'settings:webhooks:write', 'settings:webhooks:delete',
  ],
  'User': [
    'content-types:read',
    'entries:read', 'entries:write',
    'media:read', 'media:write',
  ],
}
