import { useEffect } from 'react';
import { reportError } from '@/lib/observability';

/**
 * v2 (W61): hand-over from the start screen (public/boot.js) to the app, and recovery when a newer
 * version has replaced a file this page still needs.
 */
declare global {
  interface Window {
    __mqiStarted?: boolean;
  }
}

const BOOT_FAILED_KEY = 'mqi-boot-failed';
const RELOADED_KEY = 'mqi-chunk-reloaded';

/** Rendered with the first screen: the start screen goes, and a stuck start from before is reported. */
export function BootDone(): null {
  useEffect(() => {
    window.__mqiStarted = true;
    document.getElementById('boot')?.remove();
    let failed: string | null = null;
    try {
      failed = localStorage.getItem(BOOT_FAILED_KEY);
      localStorage.removeItem(BOOT_FAILED_KEY);
    } catch {
      // storage blocked
    }
    if (failed) void reportError(`Start was stuck before this open: ${failed}`, 'warn');
  }, []);
  return null;
}

/** True for the errors a browser gives when a page's code file is gone or not code (a newer version replaced it). */
export function isStaleCodeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to load module script|Unable to preload CSS/i.test(message);
}

/**
 * Reloads the page once (per minute) to pick up the current version. Returns false when it already
 * did so recently, so the caller shows its error screen instead of reloading in a loop.
 */
export function reloadForNewVersion(now: number = Date.now()): boolean {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RELOADED_KEY)) || 0;
  } catch {
    return false;
  }
  if (now - last < 60_000) return false;
  try {
    sessionStorage.setItem(RELOADED_KEY, String(now));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** Vite reports a failed load of a page's code here before the import throws. */
export function installStaleCodeRecovery(): void {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForNewVersion()) event.preventDefault();
  });
}
