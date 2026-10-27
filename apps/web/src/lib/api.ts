import { API_VERSION } from '@mqi/shared';
import type { ApiError, ApiResponse, ErrorCode } from '@mqi/shared';
import { getMeta } from './offline/db';

/**
 * The one Apps Script URL. Every call is POST text/plain (no CORS preflight) with
 * { action, apiVersion, auth, payload }; every answer is HTTP 200 with an ok flag.
 */
export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8787/api';

export const SESSION_KEY = 'session';
export const UPGRADE_EVENT = 'mqi-upgrade-required';

/** A failed call: either a server error code, or NETWORK when no answer came back. */
export class ApiCallError extends Error {
  constructor(
    readonly code: ErrorCode | 'NETWORK',
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiCallError';
  }
}

/** One bar of signal can "connect" and then never answer: a slow answer counts as none. */
const TIMEOUT_MS = 45_000;

export async function rawCall<T>(action: string, payload: unknown, session?: string | null): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, apiVersion: API_VERSION, auth: session ? { session } : undefined, payload }),
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'follow',
    });
    if (!res.ok) throw new ApiCallError('NETWORK', `HTTP ${res.status}`);
    return (await res.json()) as ApiResponse<T>;
  } catch (e) {
    if (e instanceof ApiCallError) throw e;
    throw new ApiCallError('NETWORK', 'No connection');
  } finally {
    clearTimeout(timer);
  }
}

/** Calls an action with the stored session; throws ApiCallError on any failure. */
export async function api<T>(action: string, payload: unknown = {}): Promise<T> {
  const session = await getMeta<string>(SESSION_KEY);
  const r = await rawCall<T>(action, payload, session);
  if (r.ok) return r.data;
  const e: ApiError = r.error;
  if (e.code === 'UPGRADE_REQUIRED') window.dispatchEvent(new Event(UPGRADE_EVENT));
  throw new ApiCallError(e.code, e.message, e.details);
}

export function isAuthError(e: unknown): boolean {
  return e instanceof ApiCallError && (e.code === 'UNAUTHENTICATED' || e.code === 'ACCESS_REVOKED' || e.code === 'PASSWORD_CHANGE_REQUIRED');
}
