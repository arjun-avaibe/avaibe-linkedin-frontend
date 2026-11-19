/**
 * Pure time-zone conversion helpers (no React), using IANA zone rules via Intl,
 * so daylight-saving changes (e.g. London) are handled correctly.
 */

export type Parts = { year: number; month: number; day: number; hour: number; minute: number; weekday: string }

export function partsIn(ts: number, zone: string): Parts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'long',
    hourCycle: 'h23',
  })
  const p: Record<string, string> = {}
  for (const part of fmt.formatToParts(new Date(ts))) p[part.type] = part.value
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    weekday: p.weekday,
  }
}

/** Offset of `zone` from UTC at instant `ts`, in milliseconds. */
export function offsetMs(ts: number, zone: string): number {
  const p = partsIn(ts, zone)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(ts / 60000) * 60000
}

export const pad = (n: number) => String(n).padStart(2, '0')

/** "YYYY-MM-DDTHH:MM" wall-clock time in `zone` → ISO UTC string for the API. */
export function zonedInputToIso(local: string, zone: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local)
  if (!m) throw new Error(`Invalid date/time: ${local}`)
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  // Two passes handle daylight-saving boundaries
  let ts = guess - offsetMs(guess, zone)
  ts = guess - offsetMs(ts, zone)
  return new Date(ts).toISOString()
}

/** ISO UTC → "YYYY-MM-DDTHH:MM" wall-clock time in `zone` (for datetime-local inputs). */
export function isoToZonedInput(iso: string, zone: string): string {
  const p = partsIn(new Date(iso).getTime(), zone)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

/** Current time in `zone` as "YYYY-MM-DDTHH:MM". */
export function nowZonedInput(zone: string): string {
  return isoToZonedInput(new Date().toISOString(), zone)
}

export function fmt12(hour: number, minute: number): string {
  const h = hour % 12 || 12
  return minute ? `${h}:${pad(minute)} ${hour < 12 ? 'AM' : 'PM'}` : `${h} ${hour < 12 ? 'AM' : 'PM'}`
}

const SLOT_RE = /^(\d{1,2})(?: (AM|PM))?-(\d{1,2}) (AM|PM)$/

/** A UAE slot label like "10 AM-12 PM" re-expressed in `zone` at instant `at` (default now), e.g. "11:30 AM–1:30 PM". */
export function shiftSlot(uaeSlot: string, zone: string, at: number = Date.now()): string | null {
  const m = SLOT_RE.exec(uaeSlot)
  if (!m) return null
  const to24 = (h: number, ap: string) => (ap === 'PM' && h !== 12 ? h + 12 : ap === 'AM' && h === 12 ? 0 : h)
  const startH = to24(Number(m[1]), m[2] ?? m[4])
  const endH = to24(Number(m[3]), m[4])
  const diffMin = Math.round((offsetMs(at, zone) - offsetMs(at, 'Asia/Dubai')) / 60000)
  const shift = (h: number) => {
    const total = (((h * 60 + diffMin) % 1440) + 1440) % 1440
    return fmt12(Math.floor(total / 60), total % 60)
  }
  return `${shift(startH)}–${shift(endH)}`
}
