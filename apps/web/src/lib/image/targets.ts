/**
 * Photo size rules shared by the worker and the main-thread fallback (v2, W14): aim for
 * TARGET_BYTES, never keep more than MAX_BYTES. Quality is stepped down first (cheap on what
 * the eye sees), then the long edge, so even an unusually detailed photo ends up under the cap.
 * Typical camera photos land around 100–400 KB; a plain, low-detail shot can be much smaller.
 */
export const TARGET_BYTES = 400 * 1024;
export const MAX_BYTES = 450 * 1024;
export const QUALITY_STEPS = [0.82, 0.74, 0.66, 0.58, 0.5];
export const LONG_EDGE_STEPS = [1600, 1280, 1024, 800];

/**
 * Encodes at falling quality, then smaller sizes, until the target is met. Returns the first
 * result within the target, else the smallest result tried (always within MAX_BYTES in
 * practice: an 800 px JPEG at quality 0.5 is far below it).
 */
export async function encodeWithinTarget(encode: (longEdge: number, quality: number) => Promise<Blob | null>): Promise<Blob | null> {
  let smallest: Blob | null = null;
  for (const edge of LONG_EDGE_STEPS) {
    for (const quality of QUALITY_STEPS) {
      const blob = await encode(edge, quality);
      if (!blob) continue;
      if (!smallest || blob.size < smallest.size) smallest = blob;
      if (blob.size <= TARGET_BYTES) return blob;
    }
  }
  return smallest;
}
