import Dexie, { type Table } from 'dexie';
import type { AttachmentMeta, OwnSurveySummary, School, SubmittedSurvey } from '@mqi/shared';
import type { SurveyState } from '@/lib/survey-context';

/**
 * The phone's local source of truth (Dexie 4 / IndexedDB). Names and shapes follow v1's
 * offline/db.ts where the screens read them (SurveyDraft, QueuedSubmission) so the ported
 * screens stay as they were.
 *
 * Record lifecycle: draft (drafts, never leaves the phone) → pending (surveys + outbox,
 * written in one transaction at submit) → synced, or failed (Queue: Retry / Discard).
 */

export type SyncFailureKind = 'offline' | 'auth' | 'server';
export type SurveyStatus = 'pending' | 'uploading' | 'synced' | 'failed';

export interface SurveyDraft {
  surveyId: string;
  savedAt: string;
  schoolName: string;
  state: SurveyState;
}

/** A finished survey waiting for (or past) the server. */
export interface OutboxSurvey {
  id: string;
  status: SurveyStatus;
  createdAt: string;
  survey: SubmittedSurvey;
  attachments: AttachmentMeta[];
  attempts: number;
  nextAttemptAt: number;
  lastAttemptAt?: string;
  lastError?: { kind: SyncFailureKind; message: string; code?: string };
  syncedAt?: string;
}

/** Ordered work for the sync engine. Photos are queued only once the server holds their survey. */
export interface OutboxEntry {
  seq?: number;
  kind: 'survey' | 'photo';
  surveyId: string;
  attachmentId?: string;
  createdAt: string;
}

/** A photo's bytes. `uploadedChunks` makes a resumed upload skip what Drive already has. */
export interface PhotoBlob {
  id: string;
  surveyId: string;
  blob: Blob;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedChunks: number[];
  uploaded: boolean;
  url?: string;
  /** Uploaded full-size bytes may be evicted under the cache budget; never before upload. */
  evicted?: boolean;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export class MqiDb extends Dexie {
  drafts!: Table<SurveyDraft, string>;
  surveys!: Table<OutboxSurvey, string>;
  outbox!: Table<OutboxEntry, number>;
  photos!: Table<PhotoBlob, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'mqi-v2') {
    super(name);
    this.version(1).stores({
      drafts: 'surveyId, savedAt',
      surveys: 'id, status, createdAt',
      outbox: '++seq, kind, surveyId, attachmentId',
      photos: 'id, surveyId, createdAt, uploaded',
      meta: 'key',
    });
  }
}

export const db = new MqiDb();

// ---- meta ----

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}
export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
export async function deleteMeta(key: string): Promise<void> {
  await db.meta.delete(key);
}

// ---- schools (FR-SVY-1: works offline from a cached copy) ----

export async function cacheSchools(schools: School[]): Promise<void> {
  await setMeta('schools', schools);
}
export async function getCachedSchools(): Promise<School[] | null> {
  return (await getMeta<School[]>('schools')) ?? null;
}

// ---- drafts ----

export async function saveDraft(draft: SurveyDraft): Promise<void> {
  await db.drafts.put(draft);
}
export async function getDrafts(): Promise<SurveyDraft[]> {
  return db.drafts.orderBy('savedAt').reverse().toArray();
}
export async function getDraft(surveyId: string): Promise<SurveyDraft | null> {
  return (await db.drafts.get(surveyId)) ?? null;
}
/** Discarding a draft also drops its photos (none of them can have been uploaded). */
export async function deleteDraft(surveyId: string): Promise<void> {
  await db.transaction('rw', db.drafts, db.photos, db.surveys, async () => {
    await db.drafts.delete(surveyId);
    if (!(await db.surveys.get(surveyId))) await db.photos.where('surveyId').equals(surveyId).delete();
  });
}

// ---- photos ----

export async function putPhoto(p: Omit<PhotoBlob, 'uploadedChunks' | 'uploaded' | 'createdAt'>): Promise<void> {
  await db.photos.put({ ...p, createdAt: new Date().toISOString(), uploadedChunks: [], uploaded: false });
}
export async function getPhoto(id: string): Promise<PhotoBlob | undefined> {
  return db.photos.get(id);
}
export async function removePhoto(id: string): Promise<void> {
  const p = await db.photos.get(id);
  if (p && !p.uploaded) await db.photos.delete(id);
}

/** Uploaded full-size photos are evicted oldest-first past this budget; unsent photos never are. */
export const PHOTO_CACHE_BUDGET_BYTES = 200 * 1024 * 1024;

export async function enforcePhotoBudget(budget = PHOTO_CACHE_BUDGET_BYTES): Promise<number> {
  const all = await db.photos.orderBy('createdAt').toArray();
  let total = all.filter((p) => !p.evicted).reduce((s, p) => s + p.size, 0);
  let evicted = 0;
  for (const p of all) {
    if (total <= budget) break;
    if (!p.uploaded || p.evicted) continue;
    await db.photos.update(p.id, { blob: new Blob([]), evicted: true });
    total -= p.size;
    evicted++;
  }
  return evicted;
}

// ---- submit: record + outbox entry + draft removal in ONE transaction ----

export async function queueSurvey(survey: SubmittedSurvey, attachments: AttachmentMeta[]): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', db.surveys, db.outbox, db.drafts, async () => {
    if (await db.surveys.get(survey.id)) return; // a double tap must not queue twice
    await db.surveys.put({ id: survey.id, status: 'pending', createdAt: now, survey, attachments, attempts: 0, nextAttemptAt: 0 });
    await db.outbox.add({ kind: 'survey', surveyId: survey.id, createdAt: now });
    await db.drafts.delete(survey.id);
  });
}

// ---- the Queue tab's view (v1 QueuedSubmission shape) ----

export interface QueuedSubmission {
  id: string;
  createdAt: string;
  status: SurveyStatus;
  attempts?: number;
  lastAttemptAt?: string;
  lastError?: { kind: SyncFailureKind; message: string };
  payload: { surveyId: string; school: School; locations?: unknown[] };
  /** Photos not yet on the server. */
  pendingPhotos: unknown[];
}

export async function getPendingSubmissions(): Promise<QueuedSubmission[]> {
  const open = await db.surveys.where('status').anyOf('pending', 'uploading', 'failed').toArray();
  const out: QueuedSubmission[] = [];
  for (const s of open) {
    const unsent = await db.photos.where('surveyId').equals(s.id).filter((p) => !p.uploaded).count();
    out.push({
      id: s.id,
      createdAt: s.createdAt,
      status: s.status,
      attempts: s.attempts,
      lastAttemptAt: s.lastAttemptAt,
      lastError: s.lastError,
      payload: { surveyId: s.id, school: s.survey.school, locations: s.survey.locations },
      pendingPhotos: Array.from({ length: unsent }),
    });
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function countOpenWork(): Promise<number> {
  const [d, s] = await Promise.all([db.drafts.count(), db.surveys.where('status').anyOf('pending', 'uploading', 'failed').count()]);
  return d + s;
}

/** Queue: Retry a failed survey (back to pending, attempted on the next sync). */
export async function retrySurvey(id: string): Promise<void> {
  await db.transaction('rw', db.surveys, db.outbox, async () => {
    const s = await db.surveys.get(id);
    if (!s) return;
    const hasPush = (await db.outbox.where('surveyId').equals(id).filter((e) => e.kind === 'survey').count()) > 0;
    const unsentPhotos = await db.outbox.where('surveyId').equals(id).filter((e) => e.kind === 'photo').count();
    await db.surveys.update(id, { status: hasPush ? 'pending' : unsentPhotos ? 'uploading' : 'synced', attempts: 0, nextAttemptAt: 0, lastError: undefined });
  });
}

/** Queue: Discard a failed survey and everything queued for it. */
export async function discardSurvey(id: string): Promise<void> {
  await db.transaction('rw', db.surveys, db.outbox, db.photos, async () => {
    await db.outbox.where('surveyId').equals(id).delete();
    await db.photos.where('surveyId').equals(id).delete();
    await db.surveys.delete(id);
  });
}

export async function saveOwnSurveys(list: OwnSurveySummary[]): Promise<void> {
  await setMeta('ownSurveys', list);
}
export async function getOwnSurveys(): Promise<OwnSurveySummary[]> {
  return (await getMeta<OwnSurveySummary[]>('ownSurveys')) ?? [];
}
