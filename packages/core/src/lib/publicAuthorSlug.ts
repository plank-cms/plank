import { pool } from '@plank-cms/db'

type AuthorSlugInput = {
  email: string
  firstName?: string | null
  lastName?: string | null
}

function slugifySegment(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
}

function baseSlugFromUser(input: AuthorSlugInput): string {
  const fullName = [input.firstName, input.lastName]
    .map((value) => value?.trim() ?? '')
    .filter(Boolean)
    .join(' ')
  const base = fullName || input.email.split('@')[0] || 'author'
  return slugifySegment(base) || 'author'
}

export async function resolveUniquePublicAuthorSlug(
  input: AuthorSlugInput,
  excludeUserId?: string,
): Promise<string> {
  const baseSlug = baseSlugFromUser(input)
  let slug = baseSlug
  let suffix = 2

  while (true) {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id
       FROM plank_users
       WHERE public_author_slug = $1
         AND ($2::text IS NULL OR id != $2)
       LIMIT 1`,
      [slug, excludeUserId ?? null],
    )
    if (!rows[0]) return slug
    slug = `${baseSlug}-${suffix}`
    suffix += 1
  }
}
