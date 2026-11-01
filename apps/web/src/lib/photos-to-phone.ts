import type { SurveyState } from './survey-context';
import type { PhotoAsset } from './types';
import { db, getPhoto } from './offline/db';

/**
 * v2 (W50): a copy of survey photos in the phone's Downloads folder, which gallery apps (Google
 * Photos: "Download") show. A web app can't make a gallery album; this is the closest it can do,
 * and it works with no signal. Each file is named so it can be found and matched later:
 *   MQI <Campus> <YYYY-MM-DD> - <Location> - <Item> (<n>).jpg
 */

export interface PhoneCopy {
  /** The attachment id: its bytes in IndexedDB. */
  id: string;
  campus: string;
  /** YYYY-MM-DD. */
  date: string;
  /** '' for photos asked on the Review page. */
  location: string;
  item: string;
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Characters Android or Windows refuse in file names, and runs of spaces, go. */
function clean(part: string): string {
  return part.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/** The file name for one photo; `n` counts photos of the same item at the same location. */
export function phoneFileName(c: PhoneCopy, n: number, mimeType: string): string {
  const parts = [`MQI ${clean(c.campus)} ${c.date}`, clean(c.location), clean(c.item)].filter(Boolean);
  return `${parts.join(' - ')}${n > 1 ? ` (${n})` : ''}.${EXT[mimeType] ?? 'jpg'}`;
}

const day = (iso: string | null | undefined) => (iso ?? new Date().toISOString()).slice(0, 10);

/** Every photo of a survey in progress (saved locations, the open one, and Review-page photos). */
export function draftPhotoCopies(state: SurveyState & { reviewPhotos?: Record<string, PhotoAsset[]> }): PhoneCopy[] {
  const campus = state.school?.name ?? 'Survey';
  const date = day(state.startTime);
  const out: PhoneCopy[] = [];
  const add = (photos: Record<string, PhotoAsset[]>, location: string) => {
    for (const [item, list] of Object.entries(photos)) for (const p of list) out.push({ id: p.id, campus, date, location, item });
  };
  for (const loc of state.scoring.locations) add(loc.photos, loc.name);
  if (state.scoring.current) add(state.scoring.current.photos, state.scoring.current.name);
  add(state.reviewPhotos ?? {}, '');
  return out;
}

/** The photos of a submitted survey that are still on this phone. */
export async function queuedPhotoCopies(surveyId: string): Promise<PhoneCopy[]> {
  const s = await db.surveys.get(surveyId);
  if (!s) return [];
  return s.attachments.map((a) => ({
    id: a.id,
    campus: s.survey.school.name,
    date: day(s.survey.startTime),
    location: a.locationName,
    item: a.itemName,
  }));
}

function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked later, not at once: Chrome on Android may still be reading the file after click().
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Gap between files: Chrome handles one download start at a time more reliably. */
const GAP_MS = 400;

/**
 * Saves each photo whose bytes are still on the phone. Photos already uploaded and cleared to
 * save space (evicted) are on the server instead and are skipped, like missing ones.
 */
export async function savePhotosToPhone(copies: readonly PhoneCopy[]): Promise<{ saved: number; skipped: number }> {
  const seen = new Map<string, number>();
  let saved = 0;
  let skipped = 0;
  for (const c of copies) {
    const p = await getPhoto(c.id);
    if (!p || p.evicted || !p.blob.size) {
      skipped++;
      continue;
    }
    const key = `${c.location}\u0000${c.item}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (saved > 0) await new Promise((r) => setTimeout(r, GAP_MS));
    download(p.blob, phoneFileName(c, n, p.mimeType));
    saved++;
  }
  return { saved, skipped };
}
