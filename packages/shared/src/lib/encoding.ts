/** Runtime-independent UTF-8 and base64url helpers (no TextEncoder/btoa in Apps Script). */

export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

export function utf8Decode(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; ) {
    const c = b[i++]!;
    let cp: number;
    if (c < 0x80) cp = c;
    else if (c < 0xe0) cp = ((c & 31) << 6) | (b[i++]! & 63);
    else if (c < 0xf0) cp = ((c & 15) << 12) | ((b[i++]! & 63) << 6) | (b[i++]! & 63);
    else cp = ((c & 7) << 18) | ((b[i++]! & 63) << 12) | ((b[i++]! & 63) << 6) | (b[i++]! & 63);
    s += String.fromCodePoint(cp);
  }
  return s;
}

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function base64UrlEncode(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i]! << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += ALPHA[(n >> 18) & 63]! + ALPHA[(n >> 12) & 63]!;
    if (i + 1 < b.length) s += ALPHA[(n >> 6) & 63]!;
    if (i + 2 < b.length) s += ALPHA[n & 63]!;
  }
  return s;
}

export function base64UrlDecode(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = ALPHA.indexOf(ch);
    if (v < 0) throw new Error('Invalid base64url');
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

export function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Constant-time comparison for MACs and hashes. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i]! ^ b[i]!;
  return d === 0;
}

/** Standard (padded) base64 — what browsers and Apps Script Utilities produce. */
export function base64Encode(b: Uint8Array): string {
  const s = base64UrlEncode(b).replace(/-/g, '+').replace(/_/g, '/');
  return s + '='.repeat((4 - (s.length % 4)) % 4);
}

export function base64Decode(s: string): Uint8Array {
  return base64UrlDecode(s.replace(/\s+/g, ''));
}
