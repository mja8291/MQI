import { UnprocessablePhotoError, compressImage } from './compress';
import { MAX_BYTES } from './targets';

/** What the server accepts for a photo (attachmentSchema). */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, { resolve: (b: Blob) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return null;
  if (!worker) {
    worker = new Worker(new URL('./compress.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; blob?: Blob; message?: string }>) => {
      const w = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      if (!w) return;
      if (e.data.ok && e.data.blob) w.resolve(e.data.blob);
      else w.reject(new Error(e.data.message ?? 'Compression failed'));
    };
  }
  return worker;
}

/** v2 (W32): the background compressor gets this long; a stuck worker falls back, never hangs the screen. */
const WORKER_TIMEOUT_MS = 30_000;

function inWorker(w: Worker, file: Blob): Promise<Blob> {
  const id = ++seq;
  return new Promise<Blob>((resolve, reject) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      // A worker that missed its deadline may be wedged: start a fresh one next time.
      worker?.terminate();
      worker = null;
      reject(new Error('Compression timed out'));
    }, WORKER_TIMEOUT_MS);
    waiting.set(id, {
      resolve: (b) => {
        clearTimeout(timer);
        resolve(b);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    w.postMessage({ id, file });
  });
}

/** First bytes of a file, for format sniffing (the reported type is often empty or wrong on Android). */
async function head(file: Blob, n = 16): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, n).arrayBuffer());
}

/** HEIC/HEIF (iPhone, Samsung "high efficiency"): by type, extension or the ISO-BMFF brand. */
export async function isHeic(file: File): Promise<boolean> {
  if (/^image\/hei[cf](-sequence)?$/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) return true;
  const b = await head(file, 12);
  const brand = String.fromCharCode(...b.slice(4, 12));
  return /^ftyp(heic|heix|hevc|hevx|heim|heis|mif1|msf1)/.test(brand);
}

/** Decodes HEIC to JPEG with heic2any (loaded only when needed; precached for offline use). */
async function heicToJpeg(file: File): Promise<File> {
  try {
    const { default: heic2any } = await import('heic2any');
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
    const blob = Array.isArray(out) ? out[0]! : out;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    throw new UnprocessablePhotoError("This HEIC photo couldn't be converted. Take the photo with the app's camera button instead.");
  }
}

/** The saved photo must be a real, readable image — checked by decoding it once more. */
async function assertReadable(file: Blob): Promise<void> {
  try {
    const bmp = await createImageBitmap(file);
    const ok = bmp.width > 0 && bmp.height > 0;
    bmp.close();
    if (ok) return;
  } catch {
    // fall through
  }
  throw new UnprocessablePhotoError("This photo couldn't be saved correctly. Try again, or take it with the camera.");
}

/**
 * v2 (W32): every picked or taken photo goes through one path —
 *   refuse empty / non-image files → convert HEIC → compress (Web Worker; main-thread fallback)
 *   → keep within 400–450 KB (targets.ts) → decode the result once more before it is saved.
 * The result is always JPEG, PNG or WebP and always readable, so uploads cannot fail on content.
 */
export async function compressPhoto(picked: File): Promise<File> {
  if (picked.size === 0) throw new UnprocessablePhotoError('This photo is empty (0 KB). Take it again.');
  let file = picked;
  if (await isHeic(file)) file = await heicToJpeg(file);
  else if (file.type && !file.type.startsWith('image/')) {
    throw new UnprocessablePhotoError('This file is not a photo. Pick a photo, or take one with the camera.');
  }

  let out: File | null = null;
  const w = getWorker();
  if (w) {
    try {
      const blob = await inWorker(w, file);
      // W32: always the re-encoded JPEG — one format, upright pixels, ≤ 1600 px and ≤ 450 KB —
      // even when the original was smaller (a 3000 px WebP must not be kept as it is).
      out = new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified });
    } catch {
      // Fall through to the main-thread path (more permissive decoding).
    }
  }
  if (!out) out = await compressImage(file);
  if (!(PHOTO_TYPES as readonly string[]).includes(out.type)) {
    throw new UnprocessablePhotoError('This photo format is not supported. Take the photo again with the camera.');
  }
  if (out.size > MAX_BYTES) throw new UnprocessablePhotoError('This photo is too large to save. Take it again with the camera.');
  await assertReadable(out);
  return out;
}
