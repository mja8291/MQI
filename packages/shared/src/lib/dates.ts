/**
 * Dates are stored as ISO calendar dates ('yyyy-mm-dd', no zone); instants as ISO UTC.
 * Display is dd/mm/yyyy in Asia/Karachi (UTC+5, no DST).
 */
export const TIME_ZONE = 'Asia/Karachi';
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's calendar date in Pakistan. */
export function todayPk(now: number = Date.now()): string {
  return new Date(now + PKT_OFFSET_MS).toISOString().slice(0, 10);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = iso.slice(0, 10);
  if (!ISO_DATE.test(d)) return iso;
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

/** Parses dd/mm/yyyy (or an ISO date) into ISO; returns null if invalid. */
export function parseDisplayDate(s: string): string | null {
  const t = s.trim();
  if (ISO_DATE.test(t)) return isValidIsoDate(t) ? t : null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  return isValidIsoDate(iso) ? iso : null;
}

export function isValidIsoDate(iso: string): boolean {
  if (!ISO_DATE.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

export function formatDateTime(instant: string | null | undefined): string {
  if (!instant) return '';
  const t = Date.parse(instant);
  if (Number.isNaN(t)) return instant;
  const pk = new Date(t + PKT_OFFSET_MS).toISOString();
  return `${formatDate(pk.slice(0, 10))} ${pk.slice(11, 16)}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** 0 = Sunday. */
export function dayOfWeek(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

export function relativeTime(instant: string | null | undefined, now: number = Date.now()): string {
  if (!instant) return 'never';
  const diff = Math.max(0, now - Date.parse(instant));
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  return formatDateTime(instant);
}
