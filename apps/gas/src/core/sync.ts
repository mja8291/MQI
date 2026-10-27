import {
  ATTACHMENTS_HEADER,
  ATTACHMENTS_TAB,
  KNOWN_RUBRIC_VERSIONS,
  METHOD2_HEADER,
  METHOD2_TAB,
  canWrite,
  method2Rows,
  noteRows,
  pushPayload,
  ratingBand,
  scoreMethod2For,
  submissionIssues,
} from '@mqi/shared';
import type { ApiError, PullResult, PushItem, PushResult, SubmittedSurvey, SurveyScores } from '@mqi/shared';
import type { Ctx } from './context';
import { AppError, fail } from './errors';
import { withLock } from './lock';
import { appendByHeader, findRows } from './responses';
import { Table } from './system';

/**
 * sync.push: each item is one finished survey with its attachment records. The survey ID
 * (UUID v7) is the idempotency key: a survey the server already holds returns ok and writes
 * nothing, including when the first response was lost after the write.
 *
 * Exactly-once across crashes: the ledger row ("Surveys", state writing → written) is created
 * first; each response-tab append is a single atomic call, and a retry of a survey left in
 * "writing" checks the tab for its Survey ID before appending again.
 */

const SCORE_TOLERANCE = 1e-6;

function sameScore(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
  return Math.abs(a - b) <= SCORE_TOLERANCE;
}

/** The phone's scores must equal the server's recomputation with the same rubric version. */
function checkScores(s: SubmittedSurvey): void {
  const r = scoreMethod2For(s.locations, s.rubricVersion);
  const server: SurveyScores = {
    overall: r.overall,
    functionality: r.categories.Functionality.score,
    safety: r.categories.Safety.score,
    aesthetics: r.categories.Aesthetics.score,
    major: r.major,
    minor: r.minor,
    criticalItems: r.criticalItems,
  };
  const keys = ['overall', 'functionality', 'safety', 'aesthetics', 'major', 'minor'] as const;
  const bad = keys.filter((k) => !sameScore(server[k], s.scores[k]));
  for (const [k, v] of Object.entries(server.criticalItems)) if (!sameScore(v, s.scores.criticalItems[k])) bad.push(k as never);
  if (bad.length) fail('VALIDATION', 'The scores do not match the rubric. Update the app and submit again.', { fields: bad });
}

function validate(ctx: Ctx, item: PushItem): void {
  const s = item.survey;
  if (!s.rubricVersion || !(KNOWN_RUBRIC_VERSIONS as readonly string[]).includes(s.rubricVersion)) {
    fail('VALIDATION', `Unknown rubric version "${s.rubricVersion}". Update the app.`);
  }
  const ids = new Set<string>();
  for (const a of item.attachments) {
    if (a.surveyId !== s.id) fail('VALIDATION', 'An attachment belongs to a different survey.');
    if (ids.has(a.id)) fail('VALIDATION', 'Duplicate attachment id.');
    ids.add(a.id);
  }
  const issues = submissionIssues(s, ids);
  if (issues.length) fail('VALIDATION', issues[0]!.message, issues);
  checkScores(s);
  void ctx;
}

function registerFiles(ctx: Ctx, item: PushItem, ownerId: string): void {
  const files = Table.of(ctx.env, 'FILES', 'attachmentId');
  for (const a of item.attachments) {
    if (files.get(a.id)) continue;
    files.insert({
      attachmentId: a.id,
      surveyId: a.surveyId,
      ownerId,
      itemName: a.itemName,
      locationName: a.locationName,
      floorLevel: a.location?.floorLevel ?? '',
      locationType: a.location?.type ?? '',
      locationLabel: a.location?.name ?? '',
      mimeType: a.mimeType,
      size: String(a.size),
      state: 'pending',
      received: '',
      createdAt: ctx.nowIso,
      updatedAt: ctx.nowIso,
    });
  }
}

function pushOne(ctx: Ctx, item: PushItem): PushResult {
  const me = ctx.requireUser();
  const s = item.survey;
  const surveys = Table.of(ctx.env, 'SURVEYS', 'surveyId');
  const existing = surveys.get(s.id);
  if (existing && existing.ownerId !== me.id) fail('CONFLICT', 'This survey ID belongs to another user.');
  if (!canWrite(me.role, 'survey', me.id, existing?.ownerId)) fail('FORBIDDEN', 'Your role cannot submit surveys.');
  if (existing?.state === 'written') {
    withLock(ctx, () => registerFiles(ctx, item, me.id));
    return { outboxId: item.outboxId, status: 'ok', duplicate: true };
  }
  validate(ctx, item);

  return withLock(ctx, () => {
    const ledger = Table.of(ctx.env, 'SURVEYS', 'surveyId');
    let row = ledger.get(s.id);
    if (row?.state === 'written') {
      registerFiles(ctx, item, me.id);
      return { outboxId: item.outboxId, status: 'ok' as const, duplicate: true };
    }
    const recovering = !!row;
    if (!row) {
      ledger.insert({
        surveyId: s.id,
        ownerId: me.id,
        schoolId: s.school.schoolId,
        campusName: s.school.name,
        region: s.school.region,
        submittedAt: ctx.nowIso,
        locations: String(s.locations.length),
        overall: s.scores.overall === null ? '' : String(Math.round(s.scores.overall)),
        ratingBand: ratingBand(s.scores.overall) ?? '',
        state: 'writing',
        rowsWritten: 'FALSE',
        notesWritten: 'FALSE',
        updatedAt: ctx.nowIso,
      });
      row = ledger.get(s.id)!;
    }
    const idSet = new Set([s.id]);
    if (row.rowsWritten !== 'TRUE') {
      // After a crash the append may have landed even though the ledger never heard back.
      const already = recovering && findRows(ctx.env, METHOD2_TAB, 'Survey ID', idSet).length > 0;
      if (!already) appendByHeader(ctx.env, METHOD2_TAB, METHOD2_HEADER, method2Rows(s, { name: me.name, email: me.email }, ctx.nowIso));
      row = ledger.update(s.id, { rowsWritten: 'TRUE', updatedAt: ctx.nowIso });
    }
    if (row.notesWritten !== 'TRUE') {
      const notes = noteRows(s);
      const already = recovering && notes.length > 0 && findRows(ctx.env, ATTACHMENTS_TAB, 'Survey ID', idSet).length > 0;
      if (!already) appendByHeader(ctx.env, ATTACHMENTS_TAB, ATTACHMENTS_HEADER, notes);
      row = ledger.update(s.id, { notesWritten: 'TRUE', updatedAt: ctx.nowIso });
    }
    registerFiles(ctx, item, me.id);
    ledger.update(s.id, { state: 'written', updatedAt: ctx.nowIso });
    Table.log(ctx.env, 'CHANGELOG', {
      at: ctx.nowIso,
      requestId: ctx.requestId,
      userId: me.id,
      action: 'sync.push',
      entity: 'survey',
      entityId: s.id,
      detail: `${s.locations.length} locations, ${item.attachments.length} photos${recovering ? ', recovered' : ''}`,
    });
    return { outboxId: item.outboxId, status: 'ok' as const };
  });
}

export function push(ctx: Ctx, raw: unknown): { results: PushResult[] } {
  const p = pushPayload.parse(raw);
  const results: PushResult[] = [];
  for (const item of p.items) {
    try {
      results.push(pushOne(ctx, item));
    } catch (e) {
      // A transient failure stops the batch (the rest retry later); a permanent one is reported
      // for that survey only and the batch moves on (no head-of-line blocking).
      if (e instanceof AppError && (e.code === 'LOCK_TIMEOUT' || e.code === 'RATE_LIMITED' || e.code === 'INTERNAL')) throw e;
      if (!(e instanceof AppError)) throw e;
      const error: ApiError = { code: e.code, message: e.message, details: e.details };
      results.push({ outboxId: item.outboxId, status: 'rejected', error });
    }
  }
  return { results };
}

export function pull(ctx: Ctx): PullResult {
  const me = ctx.requireUser();
  const surveys = Table.of(ctx.env, 'SURVEYS', 'surveyId')
    .all()
    .filter((r) => r.ownerId === me.id && r.state === 'written')
    .map((r) => ({
      surveyId: r.surveyId ?? '',
      campusName: r.campusName ?? '',
      schoolId: r.schoolId ?? '',
      submittedAt: r.submittedAt ?? '',
      overall: r.overall ? Number(r.overall) : null,
      ratingBand: r.ratingBand ?? '',
      locations: Number(r.locations) || 0,
    }))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  return { surveys };
}
