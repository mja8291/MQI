import { z } from 'zod';
import { API_VERSION, MIN_CLIENT_API_VERSION, PUBLIC_ACTIONS, RUBRIC_VERSION, can, clientLogPayload, requestEnvelope } from '@mqi/shared';
import type { ActionName, ApiResponse, Permission } from '@mqi/shared';
import * as auth from './auth';
import { Ctx } from './context';
import { AppError, fail } from './errors';
import * as files from './files';
import type { Env } from './ports';
import * as reads from './reads';
import * as sync from './sync';
import { Table } from './system';

type Handler = (ctx: Ctx, payload: unknown) => unknown;

interface Route {
  handler: Handler;
  /** Permission checked against the user's role, if any. */
  permission?: Permission;
  /** auth.changePassword and whoami must work while a password change is pending. */
  allowMustChange?: boolean;
}

const ROUTES: Record<ActionName, Route> = {
  'auth.signup': { handler: auth.signup },
  'auth.login': { handler: auth.login },
  'auth.whoami': { handler: (c) => auth.whoamiAction(c), allowMustChange: true },
  'auth.changePassword': { handler: auth.changePassword, allowMustChange: true },
  'auth.logoutAll': { handler: (c) => auth.logoutAll(c), allowMustChange: true },
  'sync.push': { handler: sync.push, permission: 'survey' },
  'sync.pull': { handler: (c) => sync.pull(c) },
  'files.upload': { handler: files.upload, permission: 'survey' },
  'files.get': { handler: files.get, permission: 'surveyDownload' },
  'dashboard.get': { handler: (c) => reads.dashboard(c), permission: 'dashboard' },
  'schools.list': { handler: (c) => reads.schools(c) },
  'schools.siblingExternal': { handler: reads.siblingExternal, permission: 'survey' },
  'surveys.get': { handler: reads.surveyGet, permission: 'surveyDownload' },
  'export.rows': { handler: reads.exportRows, permission: 'exportAll' },
  'admin.users.list': { handler: (c) => auth.listUsers(c), permission: 'users' },
  'admin.users.approve': { handler: auth.approveUser, permission: 'users' },
  'admin.users.revoke': { handler: auth.revokeUser, permission: 'users' },
  'admin.issuePassword': { handler: auth.issuePassword, permission: 'users' },
  'client.log': { handler: clientLog },
};

/** Sanitised client error (no tokens, no personal data), throttled so it cannot flood the sheet. */
function clientLog(ctx: Ctx, raw: unknown): { ok: true } {
  const p = clientLogPayload.parse(raw);
  const key = `rl:clientlog:${Math.floor(ctx.nowMs / 60_000)}`;
  const n = Number(ctx.env.cache.get(key) ?? 0) + 1;
  ctx.env.cache.put(key, String(n), 120);
  if (n > 30) return { ok: true };
  Table.log(ctx.env, 'ERRORLOG', {
    at: ctx.nowIso,
    source: 'client',
    requestId: ctx.requestId,
    userId: ctx.user?.id ?? '',
    code: p.level,
    message: scrub(p.message),
    stack: scrub(p.stack ?? ''),
    route: p.route ?? '',
    appVersion: p.appVersion ?? '',
  });
  return { ok: true };
}

/** Strips anything that looks like a token or an email before it is stored. */
export function scrub(s: string): string {
  return s
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[token]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .slice(0, 4000);
}

function newRequestId(env: Env): string {
  return Array.from(env.crypto.randomBytes(8), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function handleRequest(env: Env, body: string): ApiResponse<unknown> {
  let requestId = newRequestId(env);
  let action = '';
  let ctx: Ctx | null = null;
  const envelope = (r: { ok: true; data: unknown } | { ok: false; error: { code: AppError['code']; message: string; details?: unknown } }) =>
    ({ ...r, serverTime: new Date(env.now()).toISOString(), rubricVersion: RUBRIC_VERSION, requestId }) as ApiResponse<unknown>;
  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return envelope({ ok: false, error: { code: 'VALIDATION', message: 'Request is not JSON.' } });
    }
    const req = requestEnvelope.parse(parsed);
    if (req.requestId) requestId = req.requestId.replace(/[^A-Za-z0-9-]/g, '').slice(0, 64) || requestId;
    action = req.action;
    ctx = new Ctx(env, requestId, action);
    // apiVersion handshake: an old client is told to update rather than retry.
    if (req.apiVersion < MIN_CLIENT_API_VERSION) fail('UPGRADE_REQUIRED', 'A new version of the app is available. It will update now.');
    if (req.apiVersion > API_VERSION) fail('INTERNAL', 'The server is being updated. Try again shortly.');
    const route = (ROUTES as Record<string, Route | undefined>)[action];
    if (!route) return fail('NOT_FOUND', `Unknown action ${action}.`);
    if (!PUBLIC_ACTIONS.includes(action as ActionName)) {
      const user = auth.authenticate(ctx, req.auth?.session, !!route.allowMustChange);
      if (route.permission && !can(user.role, route.permission)) fail('FORBIDDEN', 'You do not have access to this.');
    } else if (req.auth?.session && action === 'client.log') {
      try {
        auth.authenticate(ctx, req.auth.session, true);
      } catch {
        // Logging must work signed out too.
      }
    }
    return envelope({ ok: true, data: route.handler(ctx, req.payload) });
  } catch (e) {
    const err =
      e instanceof AppError
        ? { code: e.code, message: e.message, details: e.details }
        : e instanceof z.ZodError
          ? { code: 'VALIDATION' as const, message: e.issues[0]?.message ?? 'Invalid request.', details: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }
          : { code: 'INTERNAL' as const, message: 'Something went wrong on the server. It will be retried.' };
    if (err.code === 'INTERNAL') {
      const message = e instanceof Error ? e.message : String(e);
      env.log(`[${requestId}] ${action}: ${message}`);
      try {
        Table.log(env, 'ERRORLOG', {
          at: new Date(env.now()).toISOString(),
          source: 'server',
          requestId,
          action,
          userId: ctx?.user?.id ?? '',
          code: 'INTERNAL',
          message: scrub(message),
          stack: scrub(e instanceof Error ? (e.stack ?? '') : ''),
        });
      } catch {
        // The error log itself failing must not hide the original error.
      }
    }
    return envelope({ ok: false, error: err });
  }
}
