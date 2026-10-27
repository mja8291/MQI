/// <reference lib="webworker" />
/**
 * Photo compression off the main thread (OffscreenCanvas), so the scoring screen never
 * freezes while a 12 MB camera photo is decoded. Same rules as v1's compress.ts: EXIF
 * orientation honoured, 1600 px long edge, JPEG quality stepped 0.8 → 0.5 until ≤ 300 KB.
 */
const MAX_DIMENSION = 1600;
const TARGET_BYTES = 300 * 1024;
const QUALITY_STEPS = [0.8, 0.7, 0.6, 0.5];

self.onmessage = async (e: MessageEvent<{ id: number; file: Blob }>) => {
  const { id, file } = e.data;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
      const width = Math.round(bitmap.width * scale);
      const height = Math.round(bitmap.height * scale);
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No 2D context');
      ctx.drawImage(bitmap, 0, 0, width, height);
      let blob: Blob | null = null;
      for (const quality of QUALITY_STEPS) {
        blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
        if (blob.size <= TARGET_BYTES) break;
      }
      (self as unknown as Worker).postMessage({ id, ok: true, blob });
    } finally {
      bitmap.close();
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, message: err instanceof Error ? err.message : String(err) });
  }
};
