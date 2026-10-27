/**
 * UUID v7 (RFC 9562): 48-bit Unix ms timestamp + version + 74 random bits.
 * The random source is injected so the same code runs in the browser
 * (crypto.getRandomValues), Node (crypto) and Apps Script (Utilities.getUuid).
 */
export type RandomBytes = (n: number) => Uint8Array;

export function uuidv7(randomBytes: RandomBytes, now: number = Date.now()): string {
  const b = new Uint8Array(16);
  const rnd = randomBytes(10);
  let ts = Math.floor(now);
  for (let i = 5; i >= 0; i--) {
    b[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }
  b.set(rnd, 6);
  b[6] = (b[6]! & 0x0f) | 0x70; // version 7
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Record ids: UUID v7 for user-created rows, stable slugs for seed catalogue rows. */
export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function slugId(prefix: string, name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56 - prefix.length);
  return `${prefix}-${slug}`;
}
