export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  'Super Admin': ['*'],
  'Admin': [
    'content-types:read', 'content-types:write', 'content-types:delete',
    'entries:read', 'entries:write', 'entries:delete',
    'media:read', 'media:write', 'media:delete',
    'users:read', 'users:write', 'users:delete',
    'settings:read', 'settings:write',
    'webhooks:read', 'webhooks:write',
  ],
  'User': [
    'entries:read', 'entries:write',
    'media:read', 'media:write',
  ],
}
