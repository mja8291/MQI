import { UnprocessablePhotoError, compressImage } from './compress';

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

/**
 * Compress in a Web Worker where the browser can (OffscreenCanvas); otherwise v1's main-thread
 * path, with its decode fallbacks. Keeps the smaller of original and compressed, as v1 did.
 */
export async function compressPhoto(file: File): Promise<File> {
  const w = getWorker();
  if (w) {
    try {
      const id = ++seq;
      const blob = await new Promise<Blob>((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        w.postMessage({ id, file });
      });
      if (blob.size < file.size || !(PHOTO_TYPES as readonly string[]).includes(file.type)) {
        return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified });
      }
      return file;
    } catch {
      // Fall through to the main-thread path (more permissive decoding).
    }
  }
  const out = await compressImage(file);
  if (!(PHOTO_TYPES as readonly string[]).includes(out.type)) {
    throw new UnprocessablePhotoError('This photo format is not supported. Take the photo again with the camera.');
  }
  return out;
}
