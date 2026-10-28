/// <reference lib="webworker" />
/**
 * Photo compression off the main thread (OffscreenCanvas), so the scoring screen never
 * freezes while a 12 MB camera photo is decoded. EXIF orientation honoured; size rules in
 * targets.ts (aim ≤ 400 KB, never above 450 KB).
 */
import { encodeWithinTarget } from './targets';

self.onmessage = async (e: MessageEvent<{ id: number; file: Blob }>) => {
  const { id, file } = e.data;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      const blob = await encodeWithinTarget(async (longEdge, quality) => {
        const scale = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height));
        const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No 2D context');
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        return canvas.convertToBlob({ type: 'image/jpeg', quality });
      });
      if (!blob) throw new Error('Could not encode the photo');
      (self as unknown as Worker).postMessage({ id, ok: true, blob });
    } finally {
      bitmap.close();
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, message: err instanceof Error ? err.message : String(err) });
  }
};
