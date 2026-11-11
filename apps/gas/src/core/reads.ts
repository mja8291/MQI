import { PLAN_TAB, RM_PLAN_TAB, campusBreakup, markRmPlanned, parsePlan, rmPlanIds, RESPONSES_TAB, SHARED_LOCATION_TYPES, cellCondition, isUnsafe, migrateLocationType, rubricGroupsForLocation, siblingExternalPayload, buildDashboard, DASHBOARD_COLUMNS, exportRowsPayload, foundSurveyFromRows, parseSchools, surveyGetPayload } from '@mqi/shared';
import type { Condition, DashboardData, ExportRowsResult, FoundSurvey, LocationType, SchoolsResult, SharedLocation, SiblingExternalResult } from '@mqi/shared';
import type { Ctx } from './context';
import { fail } from './errors';
import { Table } from './system';
import type { Env } from './ports';
import { columnRows, findRows, rowsAt, toRow } from './responses';

/** CacheService holds at most 100 KB per value: big JSON is split into ≤ 90 KB shards. */
const SHARD = 90_000;

export function putSharded(env: Env, key: string, value: string, ttl: number): void {
  const n = Math.max(1, Math.ceil(value.length / SHARD));
  const parts: Record<string, string> = { [key]: String(n) };
  for (let i = 0; i < n; i++) parts[`${key}:${i}`] = value.slice(i * SHARD, (i + 1) * SHARD);
  env.cache.putAll(parts, ttl);
}

export function getSharded(env: Env, key: string): string | null {
  const n = Number(env.cache.get(key));
  if (!n) return null;
  const keys = Array.from({ length: n }, (_, i) => `${key}:${i}`);
  const parts = env.cache.getAll(keys);
  if (keys.some((k) => parts[k] === undefined)) return null;
  return keys.map((k) => parts[k]).join('');
}

function cached<T>(env: Env, key: string, ttl: number, build: () => T): T {
  const hit = getSharded(env, key);
  if (hit) return JSON.parse(hit) as T;
  const value = build();
  putSharded(env, key, JSON.stringify(value), ttl);
  return value;
}

const SCHOOLS_TTL = 30 * 60;
/** FR-DASH-3: the dashboard is cached on the server for 5 minutes. */
const DASHBOARD_TTL = 5 * 60;

/** W56: a newly written survey shows on the dashboard at once (the cached copy is dropped). */
export function forgetDashboard(env: Env): void {
  env.cache.remove('dashboard');
}

/** v2 (W64): School IDs in the R&M Plan 2026-27 tab (none while the tab is missing). */
function rmPlannedIds(ctx: Ctx): Set<string> {
  const header = ctx.env.responses.header(RM_PLAN_TAB);
  const last = ctx.env.responses.lastRow(RM_PLAN_TAB);
  if (!header || last < 2) return new Set();
  return rmPlanIds(ctx.env.responses.readRows(RM_PLAN_TAB, 2, last - 1).map((cells) => toRow(header, cells)));
}

export function schools(ctx: Ctx): SchoolsResult {
  // 'schools.v3' (W64): the list now marks R&M Plan 2026-27 campuses; 'schools.v4' (W68): each campus
  // carries its units' School IDs. The key change drops lists cached before.
  return cached(ctx.env, 'schools.v4', SCHOOLS_TTL, () => ({
    schools: markRmPlanned(parseSchools(ctx.env.schools.grid(), ctx.env.schools.eCompoundGrid()), rmPlannedIds(ctx)),
  }));
}

/** v2 (W63): the campus breakup, from the Campus Survey Plan tab (none while the tab is missing or empty). */
function withBreakup(ctx: Ctx, d: DashboardData): DashboardData {
  const header = ctx.env.responses.header(PLAN_TAB);
  const last = ctx.env.responses.lastRow(PLAN_TAB);
  if (!header || last < 2) return d;
  const rows = ctx.env.responses.readRows(PLAN_TAB, 2, last - 1).map((cells) => toRow(header, cells));
  const plan = parsePlan(rows);
  return plan.length ? { ...d, breakup: campusBreakup(plan, d.schools, schools(ctx).schools) } : d;
}

export function dashboard(ctx: Ctx): DashboardData {
  return cached(ctx.env, 'dashboard', DASHBOARD_TTL, () =>
    withBreakup(ctx, { ...buildDashboard(schools(ctx).schools.length, columnRows(ctx.env, RESPONSES_TAB, DASHBOARD_COLUMNS)), generatedAt: ctx.nowIso }),
  );
}

export function surveyGet(ctx: Ctx, raw: unknown): FoundSurvey {
  const { surveyId } = surveyGetPayload.parse(raw);
  const ids = new Set([surveyId]);
  const rows = rowsAt(ctx.env, RESPONSES_TAB, findRows(ctx.env, RESPONSES_TAB, 'Survey ID', ids));
  const found = foundSurveyFromRows(surveyId, rows);
  if (!found) return fail('NOT_FOUND', 'Survey not found.');
  // W54: the photos on Drive, so My assessments can show them (each read through files.get).
  const photos = Table.of(ctx.env, 'FILES', 'attachmentId')
    .all()
    .filter((f) => f.surveyId === surveyId && f.driveFileId)
    .map((f) => ({ attachmentId: f.attachmentId ?? '', itemName: f.itemName ?? '', locationName: f.locationName ?? '' }));
  return { ...found, photos };
}

export function exportRows(ctx: Ctx, raw: unknown): ExportRowsResult {
  const p = exportRowsPayload.parse(raw);
  const header = ctx.env.responses.header(RESPONSES_TAB) ?? [];
  const last = ctx.env.responses.lastRow(RESPONSES_TAB);
  const available = Math.max(0, last - 1 - p.offset);
  const n = Math.min(p.limit, available);
  const rows = n > 0 ? ctx.env.responses.readRows(RESPONSES_TAB, 2 + p.offset, n) : [];
  return { header, rows, hasMore: p.offset + n < last - 1 };
}

/** v2 (W30): the latest External Development location recorded for a sibling campus (same e-compound). */
export function siblingExternal(ctx: Ctx, raw: unknown): SiblingExternalResult {
  const { schoolId } = siblingExternalPayload.parse(raw);
  const list = schools(ctx).schools;
  const me = list.find((s) => s.schoolId === schoolId);
  if (!me?.eCompoundNo) return { found: null };
  const siblings = new Set(list.filter((s) => s.eCompoundNo === me.eCompoundNo && s.schoolId !== schoolId).map((s) => s.schoolId));
  if (!siblings.size) return { found: null };
  const all = rowsAt(ctx.env, RESPONSES_TAB, findRows(ctx.env, RESPONSES_TAB, 'School ID', siblings)).sort((a, b) =>
    (b['Timestamp'] ?? '').localeCompare(a['Timestamp'] ?? ''),
  );
  const shared = sharedLocations(all);
  const latest = all.find((row) => row['Location Type'] === 'External Development');
  if (!latest) return { found: null, shared };
  const groups = rubricGroupsForLocation('External Development').map((g) => g.name);
  const scores: Record<string, string> = {};
  for (const name of groups) {
    const value = cellCondition(latest[name] ?? '');
    if (value) scores[name] = value;
  }
  return {
    found: {
      campusName: latest['Campus Name'] ?? '',
      schoolId: latest['School ID'] ?? '',
      surveyId: latest['Survey ID'] ?? '',
      date: latest['Timestamp'] ?? '',
      scores,
    },
    shared,
  };
}

/**
 * v2 (W60): the latest sibling Guardroom / Canteen / UGWT, one per type and name (rows newest first).
 * W56's "Canteen & UGWT" rows count as Canteen or UGWT by their name. Unsafe answers are not copied.
 */
function sharedLocations(rows: readonly Record<string, string>[]): SharedLocation[] {
  const out = new Map<string, SharedLocation>();
  for (const row of rows) {
    const rowType = row['Location Type'] as LocationType;
    if (!SHARED_LOCATION_TYPES.includes(rowType)) continue;
    const name = (row['Location Name'] ?? '').trim();
    const raw: Record<string, Condition> = {};
    for (const g of rubricGroupsForLocation(rowType)) {
      const value = cellCondition(row[g.name] ?? '');
      if (value) raw[g.name] = value;
    }
    const { type, scores: all } = migrateLocationType({ type: rowType, name, scores: raw });
    const key = `${type}|${name.toLowerCase()}`;
    if (out.has(key)) continue;
    const groups = rubricGroupsForLocation(type);
    const scores: Record<string, string> = {};
    const unsafeThere: string[] = [];
    for (const [item, value] of Object.entries(all)) {
      const g = groups.find((x) => x.name === item);
      if (!g) continue;
      if (isUnsafe(g, value) || /\bUnsafe\b/.test(row[item] ?? '')) unsafeThere.push(item);
      else scores[item] = value;
    }
    out.set(key, { type, name, campusName: row['Campus Name'] ?? '', date: row['Timestamp'] ?? '', scores, unsafeThere });
  }
  return [...out.values()];
}
