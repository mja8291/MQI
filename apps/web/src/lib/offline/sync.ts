import { PUSH_BATCH_MAX, TRANSIENT_ERRORS, UPLOAD_CHUNK_BYTES, base64Encode, bytesToHex, sha256 } from '@mqi/shared';
import type { PullResult, PushResult, UploadResult } from '@mqi/shared';
import { ApiCallError, api, isAuthError } from '@/lib/api';
import { notifyAuthRequired } from '@/lib/auth/events';
import { db, enforcePhotoBudget, forgetSentSurvey, getMeta, saveOwnSurveys } from './db';
import type { OutboxSurvey, PhotoBlob, SyncFailureKind } from './db';

/**
 * The sync engine. Single-flight (a Web Lock, so only one tab syncs), safe to call from any
 * trigger. Push: surveys in outbox order, one per call (W29); a permanent rejection
 * marks that survey failed and the queue moves on. Photos: queued once the server holds the
 * survey; chunked, resumable per chunk, checksummed. Survey data always goes before any photo, and a
 * stuck photo holds back only its own survey's photos (W15). Only LOCK_TIMEOUT, RATE_LIMITED and INTERNAL (and no
 * connection, W83: or a slow answer) retry, with backoff min(2^n × 5 s, 10 min) ± 20 %.
 */

export const SYNC_CHANGED_EVENT = 'mqi-sync-changed';

/**
 * v2 (W29): one survey per request ("packets, not combined") — a small request is far more likely
 * to get through a weak connection, and one survey's trouble never holds back another's. The
 * server still accepts up to PUSH_BATCH_MAX.
 */
const SURVEYS_PER_CALL = Math.min(1, PUSH_BATCH_MAX);
export const LAST_SYNC_KEY = 'mqi-last-sync';

function notifyChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SYNC_CHANGED_EVENT));
}

let flushing = false;
export function isSyncing(): boolean {
  return flushing;
}

/** W83: waits grow 5 s, 10 s, 20 s … up to 10 minutes (was 30), so a busy spell never parks a survey for long. */
export const MAX_BACKOFF_MS = 10 * 60_000;

export function backoffMs(attempts: number, random: () => number = Math.random): number {
  const base = Math.min(2 ** attempts * 5_000, MAX_BACKOFF_MS);
  return Math.round(base * (0.8 + 0.4 * random()));
}

function kindOf(e: unknown): SyncFailureKind {
  if (isAuthError(e)) return 'auth';
  if (e instanceof ApiCallError && e.code === 'NETWORK') return 'offline';
  return 'server';
}

function isTransient(e: unknown): boolean {
  return !(e instanceof ApiCallError) || e.code === 'NETWORK' || e.code === 'TIMEOUT' || (TRANSIENT_ERRORS as readonly string[]).includes(e.code);
}

async function noteTransient(ids: string[], e: unknown): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.surveys, async () => {
    for (const id of ids) {
      const s = await db.surveys.get(id);
      if (!s) continue;
      const attempts = s.attempts + 1;
      const message =
        kindOf(e) === 'auth'
          ? 'Sign in to sync'
          : kindOf(e) === 'offline'
            ? 'Waiting for a connection'
            : e instanceof ApiCallError && e.code === 'TIMEOUT'
              ? 'Slow connection or busy server — will retry shortly'
              : 'Server error — will retry';
      // No backoff when there is nothing to wait out: signed out (it goes the moment the user
      // signs in, FR-AUTH-9) or the phone knows it is offline (the online event sends it).
      const knownOffline = kindOf(e) === 'offline' && typeof navigator !== 'undefined' && navigator.onLine === false;
      await db.surveys.update(id, {
        attempts: knownOffline ? s.attempts : attempts,
        nextAttemptAt: kindOf(e) === 'auth' || knownOffline ? 0 : now + backoffMs(attempts),
        lastAttemptAt: new Date(now).toISOString(),
        lastError: { kind: kindOf(e), message, code: e instanceof ApiCallError ? e.code : undefined },
      });
    }
  });
}

async function due(status: OutboxSurvey['status'], force: boolean): Promise<OutboxSurvey[]> {
  const now = Date.now();
  return (await db.surveys.where('status').equals(status).toArray()).filter((s) => force || s.nextAttemptAt <= now);
}

/** Push every due survey. Returns false when the run should stop (offline, signed out, busy). */
async function pushSurveys(force: boolean): Promise<boolean> {
  const entries = await db.outbox.orderBy('seq').filter((e) => e.kind === 'survey').toArray();
  const dueIds = new Set((await due('pending', force)).map((s) => s.id));
  const queue = entries.filter((e) => dueIds.has(e.surveyId));
  for (let i = 0; i < queue.length; i += SURVEYS_PER_CALL) {
    const batch = queue.slice(i, i + SURVEYS_PER_CALL);
    const surveys = (await db.surveys.bulkGet(batch.map((b) => b.surveyId))).filter((s): s is OutboxSurvey => !!s);
    let results: PushResult[];
    try {
      results = (await api<{ results: PushResult[] }>('sync.push', { items: surveys.map((s) => ({ outboxId: s.id, survey: s.survey, attachments: s.attachments })) })).results;
    } catch (e) {
      await noteTransient(surveys.map((s) => s.id), e);
      if (isAuthError(e)) notifyAuthRequired();
      // W83: a slow answer holds back only this survey; the others (and photos) still go.
      if (e instanceof ApiCallError && e.code === 'TIMEOUT') continue;
      if (isTransient(e) || isAuthError(e) || (e instanceof ApiCallError && e.code === 'UPGRADE_REQUIRED')) return false;
      // A whole-call permanent error (e.g. FORBIDDEN): mark these failed, keep going.
      await db.surveys.bulkUpdate(surveys.map((s) => ({ key: s.id, changes: { status: 'failed' as const } })));
      notifyChanged();
      continue;
    }
    const now = new Date().toISOString();
    const done: string[] = [];
    await db.transaction('rw', db.surveys, db.outbox, async () => {
      for (const r of results) {
        const id = String(r.outboxId);
        const s = await db.surveys.get(id);
        if (!s) continue;
        if (r.status === 'ok') {
          await db.outbox.where('surveyId').equals(id).filter((e) => e.kind === 'survey').delete();
          // The server holds the parent now, so its photos may follow.
          for (const a of s.attachments) await db.outbox.add({ kind: 'photo', surveyId: id, attachmentId: a.id, createdAt: now });
          await db.surveys.update(id, { status: s.attachments.length ? 'uploading' : 'synced', syncedAt: s.attachments.length ? undefined : now, attempts: 0, nextAttemptAt: 0, lastError: undefined, lastAttemptAt: now });
          if (!s.attachments.length) done.push(id);
        } else {
          // The outbox entry stays: Retry puts the survey back to pending, Discard removes both.
          await db.surveys.update(id, { status: 'failed', lastAttemptAt: now, lastError: { kind: 'server', message: r.error?.message ?? 'Rejected by the server', code: r.error?.code } });
        }
      }
    });
    // W54: a survey with no photos is complete on the server now: free the phone.
    for (const id of done) await forgetSentSurvey(id, now);
    if (results.some((r) => r.status === 'ok')) setLastSync(now);
    notifyChanged();
  }
  return true;
}

/** W86: the photo's saved file could not be read on this phone (its bytes are still listed). */
export class PhotoReadError extends Error {
  constructor(readonly reason: unknown) {
    super(`This phone could not read a saved photo (${reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason)})`);
    this.name = 'PhotoReadError';
  }
}

/**
 * W86: one chunk of a saved photo. iPhones (WebKit) sometimes refuse Blob.arrayBuffer() on a photo
 * kept in IndexedDB after the app was closed; FileReader and Response read the same file another way.
 */
async function readPart(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  const part = blob.slice(start, end);
  const attempts: (() => Promise<ArrayBuffer>)[] = [
    () => part.arrayBuffer(),
    () =>
      new Promise<ArrayBuffer>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as ArrayBuffer);
        r.onerror = () => reject(r.error ?? new Error('FileReader failed'));
        r.readAsArrayBuffer(part);
      }),
    () => new Response(part).arrayBuffer(),
  ];
  let first: unknown;
  for (const read of attempts) {
    try {
      return new Uint8Array(await read());
    } catch (e) {
      first ??= e;
    }
  }
  throw new PhotoReadError(first);
}

/**
 * W87: saves upload progress on a photo row. Safari on iPhone writes the whole row again, photo
 * included, and for a photo saved days earlier it can fail ("Error preparing Blob/File data to be
 * stored in object store"), so the photo was never marked sent and its survey stuck for good. Then
 * the photo is read (that still works) and stored again as a fresh copy, with the progress.
 */
export async function savePhotoProgress(id: string, changes: Partial<Pick<PhotoBlob, 'uploadedChunks' | 'uploaded' | 'url'>>): Promise<void> {
  try {
    await db.photos.update(id, changes);
    return;
  } catch (e) {
    const p = await db.photos.get(id);
    if (!p || p.evicted) throw e;
    const bytes = await readPart(p.blob, 0, p.blob.size);
    if (bytes.byteLength !== p.blob.size) throw e;
    await db.photos.put({ ...p, ...changes, blob: new Blob([bytes as BlobPart], { type: p.blob.type || p.mimeType }) });
  }
}

/**
 * Sends one photo; 'missing' when its bytes are no longer on the phone (W48). Full-size bytes are
 * only ever evicted after the server confirmed the photo, so an evicted photo is already done.
 */
async function uploadPhoto(attachmentId: string): Promise<UploadResult | 'missing'> {
  const p = await db.photos.get(attachmentId);
  if (!p) return 'missing';
  if (p.uploaded || p.evicted) return { received: [], done: true, url: p.url ?? '' };
  const count = Math.max(1, Math.ceil(p.size / UPLOAD_CHUNK_BYTES));
  let last: UploadResult | null = null;
  let conflicts = 0;
  for (let i = 0; i < count; i++) {
    const fresh = await db.photos.get(attachmentId);
    if (!fresh) return 'missing';
    // W48: the last chunk is always sent when nothing else was this run. A run cut off after the
    // server stored every chunk otherwise sends nothing and never learns the photo is done; the
    // server answers a repeated chunk from its ledger.
    if (fresh.uploadedChunks.includes(i) && !(i === count - 1 && last === null)) continue;
    const part = await readPart(fresh.blob, i * UPLOAD_CHUNK_BYTES, (i + 1) * UPLOAD_CHUNK_BYTES);
    try {
      last = await api<UploadResult>('files.upload', { attachmentId, chunkIndex: i, chunkCount: count, totalSize: p.size, data: base64Encode(part), sha256: bytesToHex(sha256(part)) });
    } catch (e) {
      // The server already has more (or fewer) chunks than we thought: adopt its list, retry from there.
      if (e instanceof ApiCallError && e.code === 'CONFLICT' && ++conflicts <= 3) {
        const received = (e.details as { received?: number[] } | undefined)?.received ?? [];
        await savePhotoProgress(attachmentId, { uploadedChunks: received });
        i = -1;
        continue;
      }
      throw e;
    }
    // Progress is saved per chunk, so nothing is uploaded twice after an interruption.
    await savePhotoProgress(attachmentId, { uploadedChunks: last.received });
    if (last.done) break;
  }
  if (!last) throw new Error('No chunk of the photo was sent'); // unreachable: the last chunk always goes
  return last;
}

/** v2 (W33): photos go up three at a time (each photo's chunks stay in order). */
const PHOTO_UPLOADS_AT_ONCE = 3;

/**
 * One push at a time, shared: the photo workers ask for "any survey answers waiting?" before
 * every photo, and must not push the same survey twice.
 */
let pushing: Promise<boolean> | null = null;
function pushSurveysOnce(force: boolean): Promise<boolean> {
  pushing ??= pushSurveys(force).finally(() => {
    pushing = null;
  });
  return pushing;
}

async function uploadPhotos(force: boolean): Promise<boolean> {
  const dueIds = new Set((await due('uploading', force)).map((s) => s.id));
  const entries = await db.outbox.orderBy('seq').filter((e) => e.kind === 'photo' && dueIds.has(e.surveyId)).toArray();
  const blocked = new Set<string>();
  const unreadable = new Map<string, number>();
  const reported = new Set<string>();
  let next = 0;
  let stopped = false;

  /** W86: one line in the server's ErrorLog per stuck survey per run: what failed, on which photo. */
  function reportStuck(entry: (typeof entries)[number], e: unknown) {
    if (reported.has(entry.surveyId)) return;
    reported.add(entry.surveyId);
    const what = e instanceof ApiCallError ? `${e.code}: ${e.message}` : e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent.replace(/\s+/g, ' ').slice(0, 160) : '';
    void import('@/lib/observability')
      .then(({ reportError }) => reportError(new Error(`Photo upload stuck — survey ${entry.surveyId.slice(0, 8)}, photo ${String(entry.attachmentId).slice(0, 8)}: ${what} · ${ua}`), 'warn'))
      .catch(() => undefined);
  }

  async function worker(): Promise<void> {
    while (!stopped) {
      // W33: survey answers always go first — a survey submitted while photos are uploading
      // does not wait for them to finish.
      if (!(await pushSurveysOnce(force))) {
        stopped = true;
        return;
      }
      const entry = entries[next++];
      if (!entry) return;
      if (blocked.has(entry.surveyId)) continue;
      try {
        const r = await uploadPhoto(entry.attachmentId!);
        const now = new Date().toISOString();
        if (r === 'missing') {
          // W48: the photo's bytes are gone from this phone. Its entry can never succeed; the survey
          // is shown as failed with the reason instead of being counted as synced without it. The
          // server keeps the photo listed as expected (Files state "pending").
          await db.transaction('rw', db.outbox, db.surveys, async () => {
            await db.outbox.delete(entry.seq!);
            await db.surveys.update(entry.surveyId, {
              status: 'failed',
              lastAttemptAt: now,
              lastError: { kind: 'server', message: 'A photo is no longer on this phone, so it could not be sent. The survey answers were sent; tell the QA/QC team which photo is missing.' },
            });
          });
          notifyChanged();
          continue;
        }
        if (!r.done) throw new Error('The photo upload did not finish'); // retried with backoff
        // W87: marked sent first, on its own (it may need a fresh copy of the photo, see savePhotoProgress).
        await savePhotoProgress(entry.attachmentId!, { uploaded: true, url: r.url });
        let complete = false;
        await db.transaction('rw', db.photos, db.outbox, db.surveys, async () => {
          await db.outbox.delete(entry.seq!);
          const left = await db.outbox.where('surveyId').equals(entry.surveyId).count();
          if (left === 0) {
            await db.surveys.update(entry.surveyId, { status: 'synced', syncedAt: now, lastError: undefined, attempts: 0 });
            complete = true;
          }
        });
        // W54: answers and every photo are confirmed on the server: free the phone.
        if (complete) await forgetSentSurvey(entry.surveyId, now);
        setLastSync(now);
        notifyChanged();
      } catch (e) {
        await noteTransient([entry.surveyId], e);
        if (isAuthError(e)) notifyAuthRequired();
        // No connection or signed out: nothing else can go either, so stop the run.
        if (kindOf(e) === 'offline' || isAuthError(e)) {
          stopped = true;
          return;
        }
        // W86: say what went wrong (once per survey per run), so a stuck queue can be diagnosed.
        reportStuck(entry, e);
        if (e instanceof PhotoReadError) {
          // W86: this photo can't be read on this phone; the survey's other photos still go.
          unreadable.set(entry.surveyId, (unreadable.get(entry.surveyId) ?? 0) + 1);
          await db.surveys.update(entry.surveyId, {
            lastError: {
              kind: 'server',
              message: `${unreadable.get(entry.surveyId)} photo(s) could not be read on this phone; the others keep uploading. Keep the App installed and tell the QA/QC team`,
            },
          });
          notifyChanged();
          continue;
        }
        // v2 (W15): any other photo trouble stays with its own survey — it waits out its backoff
        // (transient) or shows Retry (permanent) — and every other survey's photos carry on.
        blocked.add(entry.surveyId);
        if (!isTransient(e)) {
          const reason = e instanceof Error ? e.message : 'Photo rejected';
          await db.surveys.update(entry.surveyId, {
            status: 'failed',
            lastError: { kind: 'server', message: `Survey data saved; a photo could not upload (${reason}). Tap Retry.` },
          });
        }
        notifyChanged();
      }
    }
  }

  await Promise.all(Array.from({ length: PHOTO_UPLOADS_AT_ONCE }, worker));
  return !stopped;
}

function setLastSync(iso: string) {
  try {
    localStorage.setItem(LAST_SYNC_KEY, iso);
  } catch {
    // storage blocked: the Queue just can't show the time
  }
}

async function run(force: boolean): Promise<void> {
  if (!(await getMeta<string>('session'))) return;
  if ((await pushSurveysOnce(force)) && (await uploadPhotos(force))) {
    try {
      await saveOwnSurveys((await api<PullResult>('sync.pull')).surveys);
    } catch {
      // The list of past surveys is a convenience; it refreshes next time.
    }
  }
  await enforcePhotoBudget();
}

/**
 * Runs one sync (v1 name kept for the ported screens). `force` ignores backoff (Sync now).
 * A Web Lock keeps a second tab from syncing at the same time.
 */
export async function flushPendingSubmissions(force = false): Promise<{ succeeded: number; remaining: number }> {
  if (flushing) return { succeeded: 0, remaining: await openCount() };
  const before = await db.sent.count();
  flushing = true;
  notifyChanged();
  try {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      await navigator.locks.request('mqi-sync', { ifAvailable: true }, async (lock) => {
        if (lock) await run(force);
      });
    } else {
      await run(force);
    }
  } finally {
    flushing = false;
    notifyChanged();
  }
  await scheduleNextRetry();
  const after = await db.sent.count();
  return { succeeded: after - before, remaining: await openCount() };
}

let retryTimer: ReturnType<typeof setTimeout> | undefined;
/**
 * v2 (W34): after a failed attempt, try again the moment its backoff ends — not only at the next
 * trigger (Sync now, reopening the app, the online event, the 5-minute timer). Known-offline phones
 * wait for the online event instead.
 */
async function scheduleNextRetry(): Promise<void> {
  clearTimeout(retryTimer);
  if (typeof window === 'undefined' || navigator.onLine === false) return;
  if (!(await getMeta<string>('session'))) return; // signed out: signing in sends them (FR-AUTH-9)
  // Surveys waiting for a sign-in have no backoff to wait out; they go when the user signs in.
  const waiting = (await db.surveys.where('status').anyOf('pending', 'uploading').toArray()).filter((s) => s.lastError?.kind !== 'auth');
  if (!waiting.length) return;
  const at = Math.min(...waiting.map((s) => s.nextAttemptAt || 0));
  retryTimer = setTimeout(() => void flushPendingSubmissions(), Math.max(5_000, at - Date.now()));
}

async function openCount(): Promise<number> {
  return db.surveys.where('status').anyOf('pending', 'uploading').count();
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
/** 2 s after a save. */
export function scheduleSync(delayMs = 2_000): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushPendingSubmissions(), delayMs);
  // Background Sync (Chromium): the service worker wakes the page when connectivity returns.
  void navigator.serviceWorker?.ready
    .then((reg) => (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync?.register('outbox'))
    .catch(() => {});
}

/** App start, return to foreground, the online event, the SW's Background Sync, and every 5 min while visible. */
export function startSyncTriggers(): () => void {
  const kick = () => void flushPendingSubmissions();
  // Connectivity just came back: whatever was waiting on it goes now, whatever the backoff says.
  const onOnline = () => void flushPendingSubmissions(true);
  const onVisible = () => document.visibilityState === 'visible' && kick();
  const onMessage = (e: MessageEvent) => (e.data as { type?: string } | null)?.type === 'SYNC_NOW' && onOnline();
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  navigator.serviceWorker?.addEventListener('message', onMessage);
  const interval = setInterval(() => document.visibilityState === 'visible' && kick(), 5 * 60_000);
  kick();
  return () => {
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    navigator.serviceWorker?.removeEventListener('message', onMessage);
    clearInterval(interval);
  };
}
