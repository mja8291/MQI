/**
 * Client-side photo compression for survey attachments.
 *
 * Phone cameras routinely produce 3-12MB photos at resolutions far beyond
 * what's useful for documenting a maintenance item. Round 3 Task 8/14 set a
 * concrete target — under 300KB per photo — which a single fixed quality
 * setting can't hit reliably across all photos (a plain wall and a
 * cluttered, detailed shot of the same pixel dimensions compress very
 * differently at the same quality level). So: resize first (the biggest
 * lever, cheapest on visible quality), then step quality down from a
 * reasonable starting point until under the target or a quality floor is
 * hit — a rare, unusually complex photo lands slightly over 300KB rather
 * than getting visibly destroyed to force it under.
 *
 * This matters twice over: less data to upload on the field connections
 * this app is used on (and to stay clear of Vercel's 4.5MB request-body
 * ceiling — see Round 3 Task 8), and less space taken in the IndexedDB
 * offline queue when a submission is stuck waiting to sync.
 *
 * Decoding itself can fail — a corrupt upload, or a format the browser's
 * fast path doesn't like — in which case there's nothing to resize or
 * re-encode. Two decode methods are tried before giving up:
 *   1. createImageBitmap — fast, the normal path.
 *   2. <img> + canvas — older and more permissive; rescues some
 *      malformed/unusual files the first method rejects outright.
 * If both fail, the file is only usable as-is if it's small enough to
 * upload safely on its own (see RAW_UPLOAD_CEILING); otherwise
 * compressImage throws UnprocessablePhotoError, which the photo-attach
 * hook (PhotoAttach.tsx) turns into a message the user can act on, rather
 * than silently attempting an upload that would blow past Vercel's
 * request-body limit.
 */

const MAX_DIMENSION = 1600; // long edge, px — the biggest single lever on file size, costs the least visible quality
const TARGET_BYTES = 300 * 1024;
const QUALITY_STEPS = [0.8, 0.7, 0.6, 0.5]; // stop at the first that clears the target; 0.5 is the floor — never go below it

// Below the real 4.5MB Vercel request-body limit, not right up against it —
// leaves headroom for multipart encoding overhead (small, but non-zero) and
// any imprecision in the platform's own enforcement.
const RAW_UPLOAD_CEILING = 4 * 1024 * 1024;

export class UnprocessablePhotoError extends Error {}

function toJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}

async function decodeViaImageBitmap(file: File): Promise<Decoded> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  return { source: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close() };
}

function decodeViaImageElement(file: File): Promise<Decoded> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve({ source: el, width: el.naturalWidth, height: el.naturalHeight, cleanup: () => URL.revokeObjectURL(url) });
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("<img> decode failed"));
    };
    el.src = url;
  });
}

async function decodeImage(file: File): Promise<Decoded> {
  try {
    return await decodeViaImageBitmap(file);
  } catch {
    // Fall through to the more permissive decode below.
  }
  return decodeViaImageElement(file);
}

export async function compressImage(file: File): Promise<File> {
  // Non-image files (shouldn't happen given the <input accept="image/*">, but
  // don't choke on it) pass through untouched.
  if (!file.type.startsWith("image/")) return file;

  let decoded: Decoded;
  try {
    decoded = await decodeImage(file);
  } catch {
    // Both decode methods failed — nothing to resize or re-encode. Still
    // safe to upload as-is if it's comfortably under the request-body
    // limit on its own; otherwise this photo genuinely can't go through.
    if (file.size <= RAW_UPLOAD_CEILING) return file;
    throw new UnprocessablePhotoError(
      "This photo couldn't be processed. Try again or pick a different photo."
    );
  }

  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(decoded.width, decoded.height));
    const width = Math.round(decoded.width * scale);
    const height = Math.round(decoded.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(decoded.source, 0, 0, width, height);

    let blob: Blob | null = null;
    for (const quality of QUALITY_STEPS) {
      blob = await toJpegBlob(canvas, quality);
      if (blob && blob.size <= TARGET_BYTES) break;
    }
    if (!blob || blob.size >= file.size) return file; // already smaller/optimized — keep the original

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    decoded.cleanup();
  }
}
