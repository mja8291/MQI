import { API_VERSION } from '@mqi/shared';
import type { ApiResponse, ErrorCode } from '@mqi/shared';

/** The same Apps Script server as the survey app; every call is POST text/plain with { action, apiVersion, auth, payload }. */
export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8787/api';
export const ENV_NAME: string = import.meta.env.VITE_ENV_NAME ?? 'dev';

const SESSION_KEY = 'mqi-budget-session';

export class ApiCallError extends Error {
  constructor(
    readonly code: ErrorCode | 'NETWORK',
    message: string,
  ) {
    super(message);
    this.name = 'ApiCallError';
  }
}

export function getSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function setSession(token: string | null): void {
  try {
    if (token) localStorage.setItem(SESSION_KEY, token);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Private window: the session lasts for this tab only.
  }
}

export const AUTH_LOST = 'mqi-budget-auth-lost';

export async function api<T>(action: string, payload: unknown = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, apiVersion: API_VERSION, auth: getSession() ? { session: getSession() } : undefined, payload }),
      cache: 'no-store',
      redirect: 'follow',
    });
  } catch {
    throw new ApiCallError('NETWORK', 'No connection. Check the internet and try again.');
  }
  if (!res.ok) throw new ApiCallError('NETWORK', `The server answered HTTP ${res.status}.`);
  const r = (await res.json()) as ApiResponse<T>;
  if (r.ok) return r.data;
  if (r.error.code === 'UNAUTHENTICATED' || r.error.code === 'ACCESS_REVOKED') window.dispatchEvent(new Event(AUTH_LOST));
  throw new ApiCallError(r.error.code, r.error.message);
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
