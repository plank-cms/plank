import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import handlebars, { type TemplateDelegate } from 'handlebars'

const templates = new Map<string, TemplateDelegate>()
let partialsLoaded = false

function templatesRoot(): string {
  return join(process.cwd(), 'templates')
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
