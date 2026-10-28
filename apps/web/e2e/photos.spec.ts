import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { installAndSignIn, scoreEverything, startSurvey } from './helpers';

/**
 * Photo assurance (W32): every kind of file a phone can hand over is either saved as a readable
 * JPEG/PNG/WebP within 450 KB — upright, at a sensible size — or refused with a clear message.
 * Runs on the production build, through the real photo button, with no signal.
 */

type Kind = 'jpeg-12mp-noise' | 'jpeg-48mp' | 'png-alpha' | 'webp' | 'gif' | 'bmp' | 'exif-rotated' | 'tiny' | 'empty' | 'text' | 'corrupt-jpeg' | 'heic-named';

interface Outcome {
  error: string | null;
  saved: { type: string; size: number; width: number; height: number } | null;
  ms: number;
}

/** Builds the file in the page, hands it to the item's photo input, and reports what was saved. */
async function attach(page: Page, kind: Kind): Promise<Outcome> {
  return page.evaluate(async (kind) => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const canvas = (w: number, h: number, paint: (g: CanvasRenderingContext2D) => void) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      paint(c.getContext('2d')!);
      return c;
    };
    const noise = (g: CanvasRenderingContext2D, w: number, h: number) => {
      const img = g.createImageData(w, h);
      for (let i = 0; i < img.data.length; i++) img.data[i] = i % 4 === 3 ? 255 : (Math.random() * 255) | 0;
      g.putImageData(img, 0, 0);
    };
    const scene = (g: CanvasRenderingContext2D, w: number, h: number) => {
      const grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#6b8f71');
      grad.addColorStop(1, '#d9d2c5');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 600; i++) {
        g.fillStyle = `hsl(${(i * 37) % 360},35%,${30 + (i % 50)}%)`;
        g.fillRect((i * 97) % w, (i * 61) % h, 80, 50);
      }
    };
    const blobOf = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob>((r) => c.toBlob((b) => r(b!), type, q));
    /** JPEG with an EXIF Orientation = 6 (rotate 90°) segment spliced in after SOI. */
    const withExifOrientation6 = async (jpeg: Blob) => {
      const src = new Uint8Array(await jpeg.arrayBuffer());
      const tiff = [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
      const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
      const len = payload.length + 2;
      const app1 = [0xff, 0xe1, len >> 8, len & 0xff, ...payload];
      return new Blob([src.slice(0, 2), new Uint8Array(app1), src.slice(2)], { type: 'image/jpeg' });
    };

    let file: File;
    switch (kind) {
      case 'jpeg-12mp-noise':
        file = new File([await blobOf(canvas(4000, 3000, (g) => noise(g, 4000, 3000)), 'image/jpeg', 0.95)], 'IMG_0001.jpg', { type: 'image/jpeg' });
        break;
      case 'jpeg-48mp':
        file = new File([await blobOf(canvas(8000, 6000, (g) => scene(g, 8000, 6000)), 'image/jpeg', 0.95)], 'IMG_48MP.jpg', { type: 'image/jpeg' });
        break;
      case 'png-alpha':
        file = new File([await blobOf(canvas(2400, 1800, (g) => { scene(g, 2400, 1800); g.clearRect(0, 0, 600, 600); }), 'image/png')], 'screenshot.png', { type: 'image/png' });
        break;
      case 'webp':
        file = new File([await blobOf(canvas(3000, 2000, (g) => scene(g, 3000, 2000)), 'image/webp', 0.9)], 'photo.webp', { type: 'image/webp' });
        break;
      case 'gif': {
        // A minimal 1×1 GIF (browsers cannot encode GIF from canvas).
        const gif = Uint8Array.from(atob('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='), (c) => c.charCodeAt(0));
        file = new File([gif], 'anim.gif', { type: 'image/gif' });
        break;
      }
      case 'bmp': {
        // 2×2 24-bit BMP.
        const w = 2, h = 2, row = 8, size = 54 + row * h;
        const b = new Uint8Array(size);
        const dv = new DataView(b.buffer);
        b.set([0x42, 0x4d]);
        dv.setUint32(2, size, true); dv.setUint32(10, 54, true); dv.setUint32(14, 40, true);
        dv.setInt32(18, w, true); dv.setInt32(22, h, true); dv.setUint16(26, 1, true); dv.setUint16(28, 24, true);
        for (let i = 54; i < size; i++) b[i] = 0x80;
        file = new File([b], 'scan.bmp', { type: 'image/bmp' });
        break;
      }
      case 'exif-rotated': {
        const jpeg = await blobOf(canvas(1600, 800, (g) => scene(g, 1600, 800)), 'image/jpeg', 0.9);
        file = new File([await withExifOrientation6(jpeg)], 'rotated.jpg', { type: 'image/jpeg' });
        break;
      }
      case 'tiny':
        file = new File([await blobOf(canvas(64, 48, (g) => scene(g, 64, 48)), 'image/jpeg', 0.9)], 'tiny.jpg', { type: 'image/jpeg' });
        break;
      case 'empty':
        file = new File([], 'empty.jpg', { type: 'image/jpeg' });
        break;
      case 'text':
        file = new File(['not a photo'], 'notes.txt', { type: 'text/plain' });
        break;
      case 'corrupt-jpeg': {
        const junk = new Uint8Array(200_000).map(() => (Math.random() * 255) | 0);
        junk.set([0xff, 0xd8, 0xff, 0xe0]);
        file = new File([junk], 'broken.jpg', { type: 'image/jpeg' });
        break;
      }
      case 'heic-named':
        // Not real HEIC bytes: checks that a HEIC is recognised and refused clearly if it can't be converted.
        file = new File([new Uint8Array(5000).map((_, i) => i % 255)], 'IMG_2001.HEIC', { type: 'image/heic' });
        break;
    }

    const row = [...document.querySelectorAll('div.py-2\\.5')].find((d) => d.querySelector('input[type=file]'))!;
    const input = row.querySelector('input[type=file]') as HTMLInputElement;
    const before = row.querySelectorAll('button[aria-label^="View"]').length;
    const t0 = performance.now();
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    let error: string | null = null;
    for (let i = 0; i < 600; i++) {
      await sleep(100);
      const msg = [...row.querySelectorAll('div')].map((d) => d.textContent ?? '').find((t) => /couldn't|not a photo|empty|out of storage|too large|not supported|HEIC/.test(t) && t.length < 200);
      if (msg) {
        error = msg;
        break;
      }
      if (row.querySelectorAll('button[aria-label^="View"]').length > before) break;
    }
    const ms = Math.round(performance.now() - t0);
    if (error) return { error, saved: null, ms };
    // Read back exactly what was stored on the phone.
    const saved = await new Promise<{ type: string; size: number; blob: Blob }>((resolve) => {
      const open = indexedDB.open('mqi-v2');
      open.onsuccess = () => {
        const req = open.result.transaction('photos').objectStore('photos').getAll();
        req.onsuccess = () => {
          const all = req.result as { blob: Blob; mimeType: string; size: number; createdAt: string }[];
          const last = all.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).pop()!;
          resolve({ type: last.mimeType, size: last.size, blob: last.blob });
        };
      };
    });
    const bmp = await createImageBitmap(saved.blob);
    const out = { type: saved.type, size: saved.size, width: bmp.width, height: bmp.height };
    bmp.close();
    return { error: null, saved: out, ms };
  }, kind);
}

test('photo formats: every file is saved as a readable photo within 450 KB, or refused clearly', async ({ context, page }) => {
  test.setTimeout(300_000);
  await installAndSignIn(page);
  await context.setOffline(true); // compression and saving never need the network
  await startSurvey(page, /^OGS Trust Campus South West/);
  await page.getByRole('button', { name: /^Roof/ }).click();
  await scoreEverything(page);

  const results: Record<string, Outcome> = {};
  for (const kind of ['jpeg-12mp-noise', 'jpeg-48mp', 'png-alpha', 'webp', 'gif', 'bmp', 'exif-rotated', 'tiny', 'empty', 'text', 'corrupt-jpeg', 'heic-named'] as Kind[]) {
    results[kind] = await attach(page, kind);
  }
  console.log(JSON.stringify(results, null, 1));

  const ok = (k: Kind) => {
    const r = results[k]!;
    expect(r.error, `${k} should be saved`).toBeNull();
    expect(['image/jpeg', 'image/png', 'image/webp']).toContain(r.saved!.type);
    expect(r.saved!.size).toBeGreaterThan(0);
    expect(r.saved!.size).toBeLessThanOrEqual(450 * 1024);
    expect(Math.max(r.saved!.width, r.saved!.height)).toBeLessThanOrEqual(1600);
    expect(r.ms, `${k} took too long`).toBeLessThan(15_000);
  };
  for (const k of ['jpeg-12mp-noise', 'jpeg-48mp', 'png-alpha', 'webp', 'gif', 'bmp', 'exif-rotated', 'tiny'] as Kind[]) ok(k);
  // Big photos are scaled to a 1600 px long edge; the EXIF-rotated one comes out upright (portrait).
  expect(results['jpeg-48mp']!.saved!.width).toBe(1600);
  expect(results['exif-rotated']!.saved!.height).toBeGreaterThan(results['exif-rotated']!.saved!.width);
  expect(results['tiny']!.saved!.width).toBe(64); // never enlarged
  // Refused, each with a message the surveyor can act on.
  expect(results['empty']!.error).toMatch(/empty/);
  expect(results['text']!.error).toMatch(/not a photo/);
  expect(results['corrupt-jpeg']!.error).toMatch(/couldn't/);
  expect(results['heic-named']!.error).toMatch(/HEIC/);
});
