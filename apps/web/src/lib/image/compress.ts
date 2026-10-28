/**
 * Client-side photo compression for survey attachments.
 *
 * Phone cameras routinely produce 3-12MB photos at resolutions far beyond
 * what's useful for documenting a maintenance item. Round 3 Task 8/14 set a
 * concrete target — originally under 300KB; v2 aims for ≤ 400KB and caps at 450KB (W14) — which a single fixed quality
 * setting can't hit reliably across all photos (a plain wall and a
 * cluttered, detailed shot of the same pixel dimensions compress very
 * differently at the same quality level). So: resize first (the biggest
 * lever, cheapest on visible quality), then step quality down from a
 * reasonable starting point until under the target or a quality floor is
 * hit, then shrink the long edge (1600 → 800 px) so even a very detailed photo ends
 * up under the cap.
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
 * If both fail, compressImage throws UnprocessablePhotoError, which the
 * photo-attach hook (PhotoAttach.tsx) turns into a message the user can act
 * on. v2 (W32): an undecodable file is never kept as-is — it could not be
 * checked and would fail on upload.
 */

import { MAX_BYTES, encodeWithinTarget } from "./targets";

// v2 (W14): size rules live in targets.ts (aim ≤ 400 KB, never above 450 KB).

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
    // Both decode methods failed: nothing to resize or re-encode, and nothing to check.
    throw new UnprocessablePhotoError(
      "This photo couldn't be processed. Try again or pick a different photo."
    );
  }

  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      if (file.size <= MAX_BYTES) return file;
      throw new UnprocessablePhotoError("This photo couldn't be processed. Try again or pick a different photo.");
    }
    const blob = await encodeWithinTarget((longEdge, quality) => {
      const scale = Math.min(1, longEdge / Math.max(decoded.width, decoded.height));
      canvas.width = Math.round(decoded.width * scale);
      canvas.height = Math.round(decoded.height * scale);
      ctx.fillStyle = "#ffffff"; // transparent PNG → white, not black, as JPEG
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
      return toJpegBlob(canvas, quality);
    });
    // W32: always the re-encoded JPEG (see compress-photo.ts).
    if (!blob) throw new UnprocessablePhotoError("This photo couldn't be processed. Try again or pick a different photo.");

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    decoded.cleanup();
  }
}
