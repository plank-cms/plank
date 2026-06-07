import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import handlebars, { type TemplateDelegate } from 'handlebars'

const templates = new Map<string, TemplateDelegate>()
let partialsLoaded = false

function templatesRoot(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(process.cwd(), 'templates'),
    join(process.cwd(), 'packages/core/templates'),
    join(moduleDir, '../../templates'),
  ]
  const root = candidates.find((candidate) => existsSync(candidate))
  if (!root) return candidates[0]
  return root
}

function loadPartials(): void {
  if (partialsLoaded) return
  partialsLoaded = true

  const partialsDir = join(templatesRoot(), 'mail', 'partials')
  if (!existsSync(partialsDir)) return

  for (const file of readdirSync(partialsDir)) {
    if (!file.endsWith('.hbs')) continue
    const name = file.replace(/\.hbs$/, '')
    const source = readFileSync(join(partialsDir, file), 'utf8')
    handlebars.registerPartial(name, source)
  }
}

handlebars.registerHelper('year', () => new Date().getFullYear())

function loadTemplate(name: string): TemplateDelegate {
  loadPartials()
  const cached = templates.get(name)
  if (cached) return cached

  const source = readFileSync(join(templatesRoot(), `${name}.hbs`), 'utf8')
  const compiled = handlebars.compile(source)
  templates.set(name, compiled)
  return compiled
}

export function renderMailTemplate(name: string, data: Record<string, unknown>): string {
  const body = loadTemplate(`mail/${name}`)(data)
  const base = loadTemplate('mail/base')
  return base({ ...data, body })
}
