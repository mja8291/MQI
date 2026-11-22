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
  /** W51: the app session that wrote it and its running count there (see saveDraft). */
  writer?: string;
  seq?: number;
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

/**
 * A photo as stored in `photos`. W90: a photo taken since W90 keeps its bytes in `photoBytes`
 * (plain data, written once, never rewritten) and has no `blob` here. Safari on iPhone lost or
 * refused to rewrite photos kept as Blobs (W86–W88), so this row must never carry new bytes again.
 */
export interface PhotoRow {
  id: string;
  surveyId: string;
  /** Only photos saved before W90 (or a test's legacy row). */
  blob?: Blob;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedChunks: number[];
  uploaded: boolean;
  url?: string;
  /** Uploaded full-size bytes may be evicted under the cache budget; never before upload. */
  evicted?: boolean;
}

/** A photo with its bytes, as the rest of the App reads it (`getPhoto`, `loadPhoto`). */
export interface PhotoBlob extends PhotoRow {
  blob: Blob;
}

/** W90: a photo's bytes, put once when the photo is taken and only ever deleted. */
export interface PhotoBytes {
  id: string;
  data: ArrayBuffer;
}

/**
 * v2 (W54): what stays on the phone of a survey the server has confirmed — answers and every photo.
 * The survey and its photos are deleted (they load from the server under My assessments); this
 * marker keeps the survey from being queued again or coming back as a draft.
 */
export interface SentSurvey {
  id: string;
  syncedAt: string;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export class MqiDb extends Dexie {
  drafts!: Table<SurveyDraft, string>;
  surveys!: Table<OutboxSurvey, string>;
  outbox!: Table<OutboxEntry, number>;
  photos!: Table<PhotoRow, string>;
  photoBytes!: Table<PhotoBytes, string>;
  meta!: Table<MetaRow, string>;
  sent!: Table<SentSurvey, string>;

  constructor(name = 'mqi-v2') {
    super(name);
    this.version(1).stores({
      drafts: 'surveyId, savedAt',
      surveys: 'id, status, createdAt',
      outbox: '++seq, kind, surveyId, attachmentId',
      photos: 'id, surveyId, createdAt, uploaded',
      meta: 'key',
    });
    // W54: confirmed surveys leave only a marker here.
    this.version(2).stores({ sent: 'id, syncedAt' });
    // W90: photo bytes apart from their row, as plain data (see PhotoRow).
    this.version(3).stores({ photoBytes: 'id' });
  }
}

export const db = new MqiDb();

/**
 * v2 (W53): Safari on iPhone can drop the app's connection to its storage after the app has been
 * in the background (e.g. while the camera is open) — WebKit's "Connection to Indexed Database
 * server lost". Every later read or write then fails until the app restarts, so answers and
 * photos would live only in memory and go when the app is closed. Such a failure reopens the
 * database and tries the operation once more.
 */
const CONNECTION_LOST = /Connection to Indexed Database server lost|DatabaseClosed|InvalidState|UnknownError|database connection is closing|The database connection is closing/i;

export function isConnectionLost(e: unknown): boolean {
  const err = e as { name?: string; message?: string; inner?: { name?: string; message?: string } } | null;
  const text = [err?.name, err?.message, err?.inner?.name, err?.inner?.message].filter(Boolean).join(' ');
  return CONNECTION_LOST.test(text);
}

export async function withReconnect<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (e) {
    if (!isConnectionLost(e)) throw e;
    await reconnectDb();
    return op();
  }
}

/** Closes and reopens the phone's storage (W53; W88 also after Safari "can't find" a saved photo). */
export async function reconnectDb(): Promise<void> {
  try {
    db.close({ disableAutoOpen: false });
  } catch {
    // already closed
  }
  await db.open();
}

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

/**
 * Writes the draft unless the survey is already queued, checked in the same transaction as the
 * write: queueSurvey also writes surveys + drafts, so the two can't interleave, and an autosave
 * that started before Submit can never land after it and bring the survey back as a draft.
 */
export async function saveDraft(draft: SurveyDraft): Promise<void> {
  await withReconnect(() => saveDraftOnce(draft));
}
async function saveDraftOnce(draft: SurveyDraft): Promise<void> {
  await db.transaction('rw', [db.drafts, db.surveys, db.sent], async () => {
    if ((await db.surveys.get(draft.surveyId)) || (await db.sent.get(draft.surveyId))) return;
    // W51: never overwrite a later copy written by this same app session. A save started a moment
    // before the app closed could otherwise land after the close-time save and bring back an older
    // survey (the robustness suite lost a just-saved location this way). A copy from an earlier
    // session is always older, so it is replaced; no clock is involved.
    const stored = await db.drafts.get(draft.surveyId);
    if (stored && draft.writer && stored.writer === draft.writer && (stored.seq ?? 0) > (draft.seq ?? 0)) return;
    await db.drafts.put(draft);
  });
}

/**
 * A draft whose survey is already queued is left over from a save that raced Submit (the
 * close-time save can't check first). The queued survey is the finished one: drop the draft.
 */
async function withoutQueued(drafts: SurveyDraft[]): Promise<SurveyDraft[]> {
  if (!drafts.length) return drafts;
  const ids = drafts.map((d) => d.surveyId);
  const queued = new Set([
    ...(await db.surveys.bulkGet(ids)).filter(Boolean).map((s) => s!.id),
    ...(await db.sent.bulkGet(ids)).filter(Boolean).map((s) => s!.id), // W54: already on the server
  ]);
  if (!queued.size) return drafts;
  await db.drafts.bulkDelete([...queued]);
  return drafts.filter((d) => !queued.has(d.surveyId));
}

export async function getDrafts(): Promise<SurveyDraft[]> {
  return withoutQueued(await db.drafts.orderBy('savedAt').reverse().toArray());
}
export async function getDraft(surveyId: string): Promise<SurveyDraft | null> {
  const d = await db.drafts.get(surveyId);
  return d ? ((await withoutQueued([d]))[0] ?? null) : null;
}
/**
 * Removes the saved draft record only. The survey's photos stay on the phone: this runs when a
 * draft is resumed (it becomes live app state again) or once the survey is queued, and both still
 * need the photo bytes. Deleting them here made a resumed survey lose every photo (W46).
 */
export async function deleteDraft(surveyId: string): Promise<void> {
  await db.drafts.delete(surveyId);
}

/** The user discards a draft: the draft and its photos go (none of them can have been uploaded). */
export async function discardDraft(surveyId: string): Promise<void> {
  await db.transaction('rw', [db.drafts, db.photos, db.photoBytes, db.surveys], async () => {
    await db.drafts.delete(surveyId);
    if (!(await db.surveys.get(surveyId))) await deletePhotos(await db.photos.where('surveyId').equals(surveyId).primaryKeys());
  });
}

/** Ids among these whose photo bytes are no longer on the phone. */
export async function missingPhotoIds(ids: readonly string[]): Promise<string[]> {
  if (!ids.length) return [];
  const found = await db.photos.bulkGet([...ids]);
  return ids.filter((_, i) => !found[i]);
}

// ---- photos ----

/** W90: a photo's row and bytes leave together (call inside a transaction over both tables, or alone). */
export async function deletePhotos(ids: readonly string[]): Promise<void> {
  if (!ids.length) return;
  await db.photos.bulkDelete([...ids]);
  await db.photoBytes.bulkDelete([...ids]);
}

/** W90: the bytes are read before the write, then row and bytes are stored together. */
export async function putPhoto(p: Omit<PhotoBlob, 'uploadedChunks' | 'uploaded' | 'createdAt'>): Promise<void> {
  const { blob, ...row } = p;
  const data = await blob.arrayBuffer();
  await withReconnect(() =>
    db.transaction('rw', db.photos, db.photoBytes, async () => {
      await db.photoBytes.put({ id: p.id, data });
      await db.photos.put({ ...row, createdAt: new Date().toISOString(), uploadedChunks: [], uploaded: false });
    }),
  );
}

/** A photo with its bytes: from `photoBytes` (W90), or the Blob a photo saved before W90 still has. */
export async function loadPhoto(id: string): Promise<PhotoBlob | undefined> {
  const row = await db.photos.get(id);
  if (!row) return undefined;
  const bytes = await db.photoBytes.get(id);
  const blob = bytes ? new Blob([bytes.data], { type: row.mimeType }) : (row.blob ?? new Blob([], { type: row.mimeType }));
  return { ...row, blob };
}

export async function getPhoto(id: string): Promise<PhotoBlob | undefined> {
  return withReconnect(() => loadPhoto(id));
}
export async function removePhoto(id: string): Promise<void> {
  const p = await db.photos.get(id);
  if (p && !p.uploaded) await db.transaction('rw', db.photos, db.photoBytes, () => deletePhotos([id]));
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
    // W90: the row is written again without its old Blob (Safari may refuse to rewrite one).
    const { blob: _old, ...row } = p;
    await db.transaction('rw', db.photos, db.photoBytes, async () => {
      await db.photoBytes.delete(p.id);
      await db.photos.put({ ...row, evicted: true });
    });
    total -= p.size;
    evicted++;
  }
  return evicted;
}

// ---- submit: record + outbox entry + draft removal in ONE transaction ----

export async function queueSurvey(survey: SubmittedSurvey, attachments: AttachmentMeta[]): Promise<void> {
  await withReconnect(() => queueSurveyOnce(survey, attachments));
}
async function queueSurveyOnce(survey: SubmittedSurvey, attachments: AttachmentMeta[]): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', [db.surveys, db.outbox, db.drafts, db.photos, db.photoBytes, db.sent], async () => {
    // A double tap must not queue twice, nor a survey the server already has (W54).
    if ((await db.surveys.get(survey.id)) || (await db.sent.get(survey.id))) return;
    await db.surveys.put({ id: survey.id, status: 'pending', createdAt: now, survey, attachments, attempts: 0, nextAttemptAt: 0 });
    await db.outbox.add({ kind: 'survey', surveyId: survey.id, createdAt: now });
    await db.drafts.delete(survey.id);
    // W49: photos removed from the form were kept until now; the ones the submission doesn't use go.
    const used = new Set(attachments.map((a) => a.id));
    await deletePhotos((await db.photos.where('surveyId').equals(survey.id).toArray()).filter((p) => !used.has(p.id)).map((p) => p.id));
  });
}

/**
 * W54: the server has confirmed the survey's answers and every photo. Its record, queue entries and
 * photo bytes leave the phone in one step; only the SentSurvey marker stays.
 */
export async function forgetSentSurvey(id: string, syncedAt = new Date().toISOString()): Promise<void> {
  await db.transaction('rw', [db.surveys, db.outbox, db.photos, db.photoBytes, db.sent, db.drafts], async () => {
    await db.sent.put({ id, syncedAt });
    await db.outbox.where('surveyId').equals(id).delete();
    await deletePhotos(await db.photos.where('surveyId').equals(id).primaryKeys());
    await db.drafts.delete(id);
    await db.surveys.delete(id);
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
  await db.transaction('rw', [db.surveys, db.outbox, db.photos, db.photoBytes], async () => {
    await db.outbox.where('surveyId').equals(id).delete();
    await deletePhotos(await db.photos.where('surveyId').equals(id).primaryKeys());
    await db.surveys.delete(id);
  });
}

export async function saveOwnSurveys(list: OwnSurveySummary[]): Promise<void> {
  await setMeta('ownSurveys', list);
}
export async function getOwnSurveys(): Promise<OwnSurveySummary[]> {
  return (await getMeta<OwnSurveySummary[]>('ownSurveys')) ?? [];
}
