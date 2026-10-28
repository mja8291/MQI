import { PUSH_BATCH_MAX, TRANSIENT_ERRORS, UPLOAD_CHUNK_BYTES, base64Encode, bytesToHex, sha256 } from '@mqi/shared';
import type { PullResult, PushResult, UploadResult } from '@mqi/shared';
import { ApiCallError, api, isAuthError } from '@/lib/api';
import { notifyAuthRequired } from '@/lib/auth/events';
import { db, enforcePhotoBudget, getMeta, saveOwnSurveys } from './db';
import type { OutboxSurvey, SyncFailureKind } from './db';

/**
 * The sync engine. Single-flight (a Web Lock, so only one tab syncs), safe to call from any
 * trigger. Push: surveys in outbox order, up to PUSH_BATCH_MAX a call; a permanent rejection
 * marks that survey failed and the queue moves on. Photos: queued once the server holds the
 * survey; chunked, resumable per chunk, checksummed. Survey data always goes before any photo, and a
 * stuck photo holds back only its own survey's photos (W15). Only LOCK_TIMEOUT, RATE_LIMITED and INTERNAL (and no
 * connection) retry, with backoff min(2^n × 5 s, 30 min) ± 20 %.
 */

export const SYNC_CHANGED_EVENT = 'mqi-sync-changed';
export const LAST_SYNC_KEY = 'mqi-last-sync';

function notifyChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SYNC_CHANGED_EVENT));
}

let flushing = false;
export function isSyncing(): boolean {
  return flushing;
}

export function backoffMs(attempts: number, random: () => number = Math.random): number {
  const base = Math.min(2 ** attempts * 5_000, 30 * 60_000);
  return Math.round(base * (0.8 + 0.4 * random()));
}

function kindOf(e: unknown): SyncFailureKind {
  if (isAuthError(e)) return 'auth';
  if (e instanceof ApiCallError && e.code === 'NETWORK') return 'offline';
  return 'server';
}

function isTransient(e: unknown): boolean {
  return !(e instanceof ApiCallError) || e.code === 'NETWORK' || (TRANSIENT_ERRORS as readonly string[]).includes(e.code);
}

async function noteTransient(ids: string[], e: unknown): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.surveys, async () => {
    for (const id of ids) {
      const s = await db.surveys.get(id);
      if (!s) continue;
      const attempts = s.attempts + 1;
      const message =
        kindOf(e) === 'auth' ? 'Sign in to sync' : kindOf(e) === 'offline' ? 'Waiting for a connection' : 'Server error — will retry';
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
  for (let i = 0; i < queue.length; i += PUSH_BATCH_MAX) {
    const batch = queue.slice(i, i + PUSH_BATCH_MAX);
    const surveys = (await db.surveys.bulkGet(batch.map((b) => b.surveyId))).filter((s): s is OutboxSurvey => !!s);
    let results: PushResult[];
    try {
      results = (await api<{ results: PushResult[] }>('sync.push', { items: surveys.map((s) => ({ outboxId: s.id, survey: s.survey, attachments: s.attachments })) })).results;
    } catch (e) {
      await noteTransient(surveys.map((s) => s.id), e);
      if (isAuthError(e)) notifyAuthRequired();
      if (isTransient(e) || isAuthError(e) || (e instanceof ApiCallError && e.code === 'UPGRADE_REQUIRED')) return false;
      // A whole-call permanent error (e.g. FORBIDDEN): mark these failed, keep going.
      await db.surveys.bulkUpdate(surveys.map((s) => ({ key: s.id, changes: { status: 'failed' as const } })));
      notifyChanged();
      continue;
    }
    const now = new Date().toISOString();
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
        } else {
          // The outbox entry stays: Retry puts the survey back to pending, Discard removes both.
          await db.surveys.update(id, { status: 'failed', lastAttemptAt: now, lastError: { kind: 'server', message: r.error?.message ?? 'Rejected by the server', code: r.error?.code } });
        }
      }
    });
    if (results.some((r) => r.status === 'ok')) setLastSync(now);
    notifyChanged();
  }
  return true;
}

async function uploadPhoto(attachmentId: string): Promise<UploadResult | null> {
  const p = await db.photos.get(attachmentId);
  if (!p || p.evicted) return null;
  const count = Math.max(1, Math.ceil(p.size / UPLOAD_CHUNK_BYTES));
  let last: UploadResult | null = null;
  let conflicts = 0;
  for (let i = 0; i < count; i++) {
    const fresh = (await db.photos.get(attachmentId))!;
    if (fresh.uploadedChunks.includes(i)) continue;
    const part = new Uint8Array(await fresh.blob.slice(i * UPLOAD_CHUNK_BYTES, (i + 1) * UPLOAD_CHUNK_BYTES).arrayBuffer());
    try {
      last = await api<UploadResult>('files.upload', { attachmentId, chunkIndex: i, chunkCount: count, totalSize: p.size, data: base64Encode(part), sha256: bytesToHex(sha256(part)) });
    } catch (e) {
      // The server already has more (or fewer) chunks than we thought: adopt its list, retry from there.
      if (e instanceof ApiCallError && e.code === 'CONFLICT' && ++conflicts <= 3) {
        const received = (e.details as { received?: number[] } | undefined)?.received ?? [];
        await db.photos.update(attachmentId, { uploadedChunks: received });
        i = -1;
        continue;
      }
      throw e;
    }
    // Progress is saved per chunk, so nothing is uploaded twice after an interruption.
    await db.photos.update(attachmentId, { uploadedChunks: last.received });
    if (last.done) break;
  }
  return last;
}

async function uploadPhotos(force: boolean): Promise<boolean> {
  const dueIds = new Set((await due('uploading', force)).map((s) => s.id));
  const entries = await db.outbox.orderBy('seq').filter((e) => e.kind === 'photo' && dueIds.has(e.surveyId)).toArray();
  const blocked = new Set<string>();
  for (const entry of entries) {
    if (blocked.has(entry.surveyId)) continue;
    try {
      const r = await uploadPhoto(entry.attachmentId!);
      const now = new Date().toISOString();
      await db.transaction('rw', db.photos, db.outbox, db.surveys, async () => {
        if (r?.done) await db.photos.update(entry.attachmentId!, { uploaded: true, url: r.url });
        await db.outbox.delete(entry.seq!);
        const left = await db.outbox.where('surveyId').equals(entry.surveyId).count();
        if (left === 0) await db.surveys.update(entry.surveyId, { status: 'synced', syncedAt: now, lastError: undefined, attempts: 0 });
      });
      setLastSync(now);
      notifyChanged();
    } catch (e) {
      await noteTransient([entry.surveyId], e);
      if (isAuthError(e)) notifyAuthRequired();
      // No connection or signed out: nothing else can go either, so stop the run.
      if (kindOf(e) === 'offline' || isAuthError(e)) return false;
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
  return true;
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
  if ((await pushSurveys(force)) && (await uploadPhotos(force))) {
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
  const before = await db.surveys.where('status').equals('synced').count();
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
  const after = await db.surveys.where('status').equals('synced').count();
  return { succeeded: after - before, remaining: await openCount() };
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
