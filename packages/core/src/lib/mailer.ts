import { getSettings } from './settings.js'

type MailingSettings = {
  enabled: boolean
  host: string
  port: number
  secure: boolean
  user: string
  password: string
  fromEmail: string
  fromName: string
  replyTo: string
}

type SendMailInput = {
  to: string | string[]
  subject: string
  html: string
  text?: string
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value == null) return fallback
  return value.toLowerCase() === 'true'
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? 587)
  return Number.isFinite(port) ? port : 587
}

function formatFrom(name: string, email: string): string {
  if (!name.trim()) return email
  return `"${name.replaceAll('"', '\\"')}" <${email}>`
}

export async function getMailingSettings(): Promise<MailingSettings> {
  const settings = await getSettings('mailing')

  return {
    enabled: parseBoolean(settings.enabled),
    host: settings['smtp.host'] ?? '',
    port: parsePort(settings['smtp.port']),
    secure: parseBoolean(settings['smtp.secure']),
    user: settings['smtp.user'] ?? '',
    password: settings['smtp.password'] ?? '',
    fromEmail: settings['from.email'] ?? '',
    fromName: settings['from.name'] ?? 'Plank CMS',
    replyTo: settings.reply_to ?? '',
  }
}

export async function sendMail(input: SendMailInput): Promise<void> {
  const settings = await getMailingSettings()
  if (!settings.enabled) throw new Error('Mailing is disabled.')
  if (!settings.host || !settings.user || !settings.password || !settings.fromEmail) {
    throw new Error('Mailing is not configured.')
  }

  const nodemailer = await import('nodemailer')
  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: {
      user: settings.user,
      pass: settings.password,
    },
  })

  await transporter.sendMail({
    from: formatFrom(settings.fromName, settings.fromEmail),
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: settings.replyTo || undefined,
  })
}
