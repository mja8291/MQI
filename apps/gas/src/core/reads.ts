import { RESPONSES_TAB, buildDashboard, exportRowsPayload, foundSurveyFromRows, parseSchools, surveyGetPayload } from '@mqi/shared';
import type { DashboardData, ExportRowsResult, FoundSurvey, SchoolsResult } from '@mqi/shared';
import type { Ctx } from './context';
import { fail } from './errors';
import type { Env } from './ports';
import { allRows, findRows, rowsAt } from './responses';

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

export function schools(ctx: Ctx): SchoolsResult {
  // 'schools.v2': the list now carries campus details; the key change drops lists cached before.
  return cached(ctx.env, 'schools.v2', SCHOOLS_TTL, () => ({ schools: parseSchools(ctx.env.schools.grid(), ctx.env.schools.eCompoundGrid()) }));
}

export function dashboard(ctx: Ctx): DashboardData {
  return cached(ctx.env, 'dashboard', DASHBOARD_TTL, () =>
    buildDashboard(schools(ctx).schools.length, allRows(ctx.env, RESPONSES_TAB)),
  );
}

export function surveyGet(ctx: Ctx, raw: unknown): FoundSurvey {
  const { surveyId } = surveyGetPayload.parse(raw);
  const ids = new Set([surveyId]);
  const rows = rowsAt(ctx.env, RESPONSES_TAB, findRows(ctx.env, RESPONSES_TAB, 'Survey ID', ids));
  const found = foundSurveyFromRows(surveyId, rows);
  if (!found) return fail('NOT_FOUND', 'Survey not found.');
  return found;
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
