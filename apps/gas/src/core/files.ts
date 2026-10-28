import { ATTACHMENTS_HEADER, ATTACHMENTS_TAB, UPLOAD_CHUNK_BYTES, base64Decode, base64Encode, bytesToHex, can, fileGetPayload, photoLocation, photoRow, uploadPayload } from '@mqi/shared';
import type { AttachmentMeta, FileGetResult, UploadResult } from '@mqi/shared';
import type { Ctx } from './context';
import { fail } from './errors';
import { withLock } from './lock';
import { appendByHeader, findRows } from './responses';
import { Table } from './system';
import type { Row } from './system';

/**
 * files.upload: a photo's bytes, after the server holds its survey (the Files row is created by
 * sync.push). Chunks are idempotent: the ledger records which chunks Drive has, a repeated
 * chunk is answered from the ledger, and an out-of-order chunk gets CONFLICT with the list so
 * the phone resends from the right place. One chunk is a direct Drive file; several use a
 * Drive resumable session.
 *
 * The attachments-tab row (v1's 5 columns, Photo URL = Drive link) is appended once the file
 * exists; a retry of a file left "uploaded" checks the tab for its link first.
 */

/** A chunk claimed by another request is treated as in progress for this long. */
const CLAIM_MS = 90_000;

function received(row: Row): number[] {
  return (row.received ?? '').split(',').filter(Boolean).map(Number);
}

function writeAttachmentRow(ctx: Ctx, f: Row): void {
  const url = f.url ?? '';
  const already = findRows(ctx.env, ATTACHMENTS_TAB, 'Photo URL', new Set([url])).length > 0;
  if (!already) {
    const meta = { surveyId: f.surveyId ?? '', itemName: f.itemName ?? '', locationName: f.locationName ?? '' } as AttachmentMeta;
    appendByHeader(ctx.env, ATTACHMENTS_TAB, ATTACHMENTS_HEADER, [photoRow(meta, url)]);
  }
  withLock(ctx, () => Table.of(ctx.env, 'FILES', 'attachmentId').update(f.attachmentId!, { state: 'done', updatedAt: ctx.nowIso }));
}

function result(f: Row, chunkCount: number): UploadResult {
  if (f.state === 'done') return { received: Array.from({ length: chunkCount }, (_, i) => i), done: true, url: f.url ?? '' };
  return { received: received(f), done: false };
}

export function upload(ctx: Ctx, raw: unknown): UploadResult {
  const p = uploadPayload.parse(raw);
  const me = ctx.requireUser();

  // Claim the chunk under the lock; the Drive call happens outside it.
  const claim = withLock(ctx, () => {
    const files = Table.of(ctx.env, 'FILES', 'attachmentId');
    const f = files.get(p.attachmentId);
    if (!f) return fail('NOT_FOUND', 'The survey for this photo has not reached the server yet.');
    if (f.ownerId !== me.id && me.role !== 'ADMIN') fail('FORBIDDEN', 'This photo belongs to another user.');
    if (Number(f.size) !== p.totalSize) fail('VALIDATION', 'Photo size does not match its record.');
    if (p.chunkCount !== Math.max(1, Math.ceil(p.totalSize / UPLOAD_CHUNK_BYTES))) fail('VALIDATION', 'Wrong number of chunks.');
    if (f.state === 'done' || f.state === 'uploaded') return { f, skip: true };
    const have = received(f);
    if (have.includes(p.chunkIndex)) return { f, skip: true };
    if (p.chunkIndex !== have.length) fail('CONFLICT', 'Chunks must be sent in order.', { received: have });
    const [claimIdx, claimAt] = (f.state ?? '').startsWith('claim:') ? f.state!.slice(6).split('@') : [];
    if (claimIdx === String(p.chunkIndex) && ctx.nowMs - Number(claimAt) < CLAIM_MS) fail('LOCK_TIMEOUT', 'This photo is already uploading.');
    return { f: files.update(p.attachmentId, { state: `claim:${p.chunkIndex}@${ctx.nowMs}`, updatedAt: ctx.nowIso }), skip: false };
  });

  if (claim.skip) {
    if (claim.f.state === 'uploaded') writeAttachmentRow(ctx, claim.f);
    const fresh = Table.of(ctx.env, 'FILES', 'attachmentId').get(p.attachmentId)!;
    return result(fresh, p.chunkCount);
  }

  const f = claim.f;
  const bytes = base64Decode(p.data);
  const isLast = p.chunkIndex === p.chunkCount - 1;
  const expected = isLast ? p.totalSize - p.chunkIndex * UPLOAD_CHUNK_BYTES : UPLOAD_CHUNK_BYTES;
  // A short or damaged chunk is a transport fault: release the claim and answer with a
  // retryable error, so the phone sends it again (v2, W14). Nothing reaches Drive.
  const damaged =
    bytes.length !== expected
      ? `has ${bytes.length} bytes, expected ${expected}`
      : p.sha256 && bytesToHex(ctx.env.crypto.sha256(bytes)) !== p.sha256
        ? 'does not match its checksum'
        : '';
  if (damaged) {
    withLock(ctx, () => Table.of(ctx.env, 'FILES', 'attachmentId').update(p.attachmentId, { state: 'pending', updatedAt: ctx.nowIso }));
    fail('INTERNAL', `Photo chunk ${p.chunkIndex} ${damaged}; it will be sent again.`);
  }
  // v2 (W32): the bytes must really be the image type on record — nothing else reaches Drive.
  if (p.chunkIndex === 0 && !looksLike(bytes, claim.f.mimeType ?? 'image/jpeg')) {
    withLock(ctx, () => Table.of(ctx.env, 'FILES', 'attachmentId').update(p.attachmentId, { state: 'pending', updatedAt: ctx.nowIso }));
    fail('VALIDATION', 'This photo is not a JPEG, PNG or WebP image.');
  }

  const survey = Table.of(ctx.env, 'SURVEYS', 'surveyId').get(f.surveyId ?? '');
  const where = photoLocation({
    region: survey?.region ?? '',
    campusName: survey?.campusName ?? '',
    surveyId: f.surveyId ?? '',
    date: survey?.submittedAt ?? ctx.nowIso,
    itemName: f.itemName ?? '',
    mimeType: f.mimeType ?? 'image/jpeg',
    location: f.floorLevel ? { floorLevel: f.floorLevel, type: f.locationType ?? '', name: f.locationLabel ?? '' } : undefined,
  });

  let session = f.session ?? '';
  let fileId = '';
  try {
    if (p.chunkCount === 1) {
      fileId = ctx.env.drive.createFile(ctx.env.drive.ensureFolder(where.folders), where.fileName, f.mimeType ?? 'image/jpeg', bytes);
    } else {
      if (p.chunkIndex === 0 || !session) session = ctx.env.drive.startResumable(ctx.env.drive.ensureFolder(where.folders), where.fileName, f.mimeType ?? 'image/jpeg', p.totalSize);
      const r = ctx.env.drive.putChunk(session, bytes, p.chunkIndex * UPLOAD_CHUNK_BYTES, p.totalSize);
      if (r.done) fileId = r.fileId ?? '';
    }
  } catch (e) {
    withLock(ctx, () => Table.of(ctx.env, 'FILES', 'attachmentId').update(p.attachmentId, { state: 'pending', updatedAt: ctx.nowIso }));
    throw e;
  }

  const updated = withLock(ctx, () =>
    Table.of(ctx.env, 'FILES', 'attachmentId').update(p.attachmentId, {
      received: [...received(f), p.chunkIndex].join(','),
      session,
      state: fileId ? 'uploaded' : 'pending',
      driveFileId: fileId,
      url: fileId ? ctx.env.drive.viewUrl(fileId) : '',
      updatedAt: ctx.nowIso,
    }),
  );
  if (fileId) {
    writeAttachmentRow(ctx, updated);
    return { received: Array.from({ length: p.chunkCount }, (_, i) => i), done: true, url: updated.url ?? '' };
  }
  return { received: received(updated), done: false };
}

/** files.get: every read goes through here after a scope check; Drive files are never shared. */
export function get(ctx: Ctx, raw: unknown): FileGetResult {
  const p = fileGetPayload.parse(raw);
  const me = ctx.requireUser();
  const f = Table.of(ctx.env, 'FILES', 'attachmentId').get(p.attachmentId);
  if (!f || !f.driveFileId) return fail('NOT_FOUND', 'Photo not found.');
  if (f.ownerId !== me.id && !can(me.role, 'surveyDownload')) fail('FORBIDDEN', 'You cannot open this photo.');
  const file = ctx.env.drive.read(f.driveFileId);
  return { mimeType: file.mime, data: base64Encode(file.bytes) };
}

/** File signatures of the photo types the app saves (JPEG, PNG, WebP). */
function looksLike(b: Uint8Array, mime: string): boolean {
  if (mime === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === "image/png") return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (mime === "image/webp") return String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP";
  return false;
}
