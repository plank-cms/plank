const DATE_OPTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
}

const DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}

export function formatDate(
  value: string | Date,
  timezone: string,
  options: Intl.DateTimeFormatOptions = DATE_OPTS,
): string {
  const date = value instanceof Date ? value : new Date(value)
  if (isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: timezone }).format(date)
}

export function formatDatetime(value: string | Date, timezone: string): string {
  return formatDate(value, timezone, DATETIME_OPTS)
}

// Extract "HH:MM" time from a UTC ISO string displayed in the given timezone
export function getTimeInTimezone(isoString: string, timezone: string): string {
  return isoToInputValue(isoString, timezone).slice(11, 16)
}

// Combine a Date object (date part) + "HH:MM" string in the given timezone → UTC ISO
export function combineDateAndTime(date: Date, timeStr: string, timezone: string): string {
  const dateOnly = isoToInputValue(date.toISOString(), timezone).slice(0, 10)
  return inputValueToISO(`${dateOnly}T${timeStr}`, timezone)
}

// Convert a UTC ISO string to a datetime-local input value (YYYY-MM-DDTHH:MM)
// interpreted in the given timezone.
export function isoToInputValue(isoString: string, timezone: string): string {
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return ''

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]))
  // Intl may return '24' for midnight in some environments
  const hour = p.hour === '24' ? '00' : p.hour
  return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}`
}

// Convert a datetime-local input value (YYYY-MM-DDTHH:MM) interpreted in the
// given timezone back to a UTC ISO string.
export function inputValueToISO(localString: string, timezone: string): string {
  if (!localString) return ''

  // Parse as if UTC to get a reference timestamp
  const refDate = new Date(localString + ':00.000Z')

  // Find out what that UTC instant looks like in the target timezone
  const tzFormatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(refDate)

  const p = Object.fromEntries(tzFormatted.map((x) => [x.type, x.value]))
  const hour = p.hour === '24' ? '00' : p.hour
  const tzMs = new Date(`${p.year}-${p.month}-${p.day}T${hour}:${p.minute}:00.000Z`).getTime()

  // offsetMs = UTC - TZ display. Apply to localString (also treated as UTC ms)
  const offsetMs = refDate.getTime() - tzMs
  return new Date(refDate.getTime() + offsetMs).toISOString()
}
