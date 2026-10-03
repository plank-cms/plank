import { pool } from '@plank-cms/db'
import { assertSafeIdentifier, findAllContentTypes, quoteIdentifier } from '@plank-cms/schema'

type Search = { page: number; limit: number; status?: string; author?: string; search?: string }

export async function searchMcpEntries(input: Search) {
  const types = await findAllContentTypes()
  const params: unknown[] = []
  function parameter(value: unknown) {
    params.push(value)
    return `$${params.length}`
  }
  const status = input.status ? parameter(input.status) : undefined
  const author = input.author ? parameter(input.author) : undefined
  const search = input.search?.trim() ? parameter(`%${input.search.trim()}%`) : undefined
  const queries = types.map((ct) => {
    assertSafeIdentifier(ct.tableName)
    const textFields = ct.fields.filter((field) =>
      ['string', 'uid', 'text', 'richtext'].includes(field.type),
    )
    for (const field of textFields) assertSafeIdentifier(field.name)
    const title =
      textFields.find((field) => ['title', 'name', 'headline'].includes(field.name)) ??
      textFields.find((field) => ['string', 'uid'].includes(field.type))
    const titleColumn = title ? `NULLIF(e.${quoteIdentifier(title.name)}::text, '')` : 'NULL'
    const clauses = [status && `e.status = ${status}`, author && `e.created_by = ${author}`].filter(
      Boolean,
    )
    if (search)
      clauses.push(
        textFields.length
          ? `(${textFields.map((field) => `e.${quoteIdentifier(field.name)}::text ILIKE ${search}`).join(' OR ')})`
          : 'FALSE',
      )
    return `SELECT e.id::text AS id, ${parameter(ct.slug)}::text AS content_type,
      ${parameter(ct.name)}::text AS content_type_name,
      LEFT(COALESCE(${titleColumn}, e.id::text), 200) AS title,
      e.status, e.created_by AS author_id,
      NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), '') AS author,
      e.updated_at
      FROM ${quoteIdentifier(ct.tableName)} e LEFT JOIN plank_users u ON u.id = e.created_by
      ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}`
  })
  if (!queries.length)
    return {
      data: [],
      total: 0,
      page: input.page,
      limit: input.limit,
      hasMore: false,
      contentTypes: [],
    }
  const union = queries.join(' UNION ALL ')
  const [{ rows }, { rows: counts }] = await Promise.all([
    pool.query(
      `SELECT * FROM (${union}) entries ORDER BY updated_at DESC NULLS LAST, content_type, id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, input.limit, (input.page - 1) * input.limit],
    ),
    pool.query(`SELECT COUNT(*) AS count FROM (${union}) entries`, params),
  ])
  const total = Number(counts[0].count)
  return {
    data: rows,
    total,
    page: input.page,
    limit: input.limit,
    hasMore: input.page * input.limit < total,
    contentTypes: types.map(({ slug, name }) => ({ slug, name })),
  }
}
