import { rawCall } from './api';
import { getMeta } from './offline/db';

/**
 * Client errors go to the server's ErrorLog tab through client.log: message, stack and route
 * only. The server scrubs tokens and emails again; we never send form contents.
 */
const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev';
let sentThisMinute = 0;
let windowStart = 0;

function scrub(s: string): string {
  return s
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[token]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .slice(0, 1000);
}

export async function reportError(error: unknown, level: 'error' | 'warn' = 'error'): Promise<void> {
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    sentThisMinute = 0;
  }
  if (++sentThisMinute > 5) return;
  const message = scrub(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  const stack = error instanceof Error && error.stack ? scrub(error.stack).slice(0, 4000) : undefined;
  try {
    const session = await getMeta<string>('session');
    await rawCall('client.log', { level, message, stack, route: location.pathname, appVersion: APP_VERSION }, session);
  } catch {
    // Offline: the error is not worth queueing.
  }
}

export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (e) => void reportError(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => void reportError(e.reason));
}
