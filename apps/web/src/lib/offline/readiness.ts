import { useEffect, useState } from "react";
import type { SchoolsResult } from "@mqi/shared";
import { api } from "@/lib/api";
import { cacheSchools, getCachedSchools } from "./db";

/**
 * v2 (W31): everything a surveyor needs offline is put on the phone as soon as they are signed in
 * and online — not only when they happen to open Start new survey. The app shell is the service
 * worker's precache; the campus list is downloaded here.
 */
export const OFFLINE_READY_EVENT = "mqi-offline-ready-changed";

export async function warmOfflineData(): Promise<void> {
  try {
    const { schools } = await api<SchoolsResult>("schools.list");
    if (schools?.length) {
      await cacheSchools(schools);
      window.dispatchEvent(new Event(OFFLINE_READY_EVENT));
    }
  } catch {
    // Offline or server busy: the saved list (if any) stands; the next online start tries again.
  }
}

export interface OfflineReadiness {
  /** The app's files are cached and this page is controlled by the service worker. */
  app: boolean;
  /** Campuses saved on the phone. */
  schools: number;
  /**
   * W49: whether the browser has made this app's storage persistent (it is then not cleared
   * automatically when the phone runs low on space); null where the browser can't say.
   */
  persisted: boolean | null;
  /** Space the app can still use, in MB; null where the browser can't say. */
  freeMb: number | null;
}

/**
 * v2 (W53): true when MQI runs as an installed app (home-screen icon, Play Store app) rather than
 * a browser tab. They keep separate storage: a survey saved in one is not in the other, so a
 * surveyor who switches between them sees their work "disappear".
 */
export function runningInstalled(): boolean {
  if (typeof window === "undefined") return true;
  const mode = (m: string) => window.matchMedia?.(`(display-mode: ${m})`).matches === true;
  return mode("standalone") || mode("fullscreen") || mode("minimal-ui") || (navigator as { standalone?: boolean }).standalone === true || document.referrer.startsWith("android-app://");
}

/** A phone or tablet (the warning is meaningless on a desktop browser). */
export function onMobile(): boolean {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Below this, photos may fail to save: warn on Home. */
export const LOW_SPACE_MB = 200;

async function check(): Promise<OfflineReadiness> {
  const app = typeof navigator !== "undefined" && "serviceWorker" in navigator
    ? Boolean((await navigator.serviceWorker.getRegistration())?.active)
    : false;
  const storage = typeof navigator !== "undefined" ? navigator.storage : undefined;
  const persisted = storage?.persisted ? await storage.persisted().catch(() => null) : null;
  const estimate = storage?.estimate ? await storage.estimate().catch(() => null) : null;
  const freeMb = estimate?.quota != null ? Math.max(0, Math.floor((estimate.quota - (estimate.usage ?? 0)) / (1024 * 1024))) : null;
  return { app, schools: (await getCachedSchools())?.length ?? 0, persisted, freeMb };
}

export function useOfflineReadiness(): OfflineReadiness | null {
  const [state, setState] = useState<OfflineReadiness | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = () => void check().then((s) => alive && setState(s));
    refresh();
    window.addEventListener(OFFLINE_READY_EVENT, refresh);
    navigator.serviceWorker?.addEventListener("controllerchange", refresh);
    void navigator.serviceWorker?.ready.then(refresh);
    return () => {
      alive = false;
      window.removeEventListener(OFFLINE_READY_EVENT, refresh);
      navigator.serviceWorker?.removeEventListener("controllerchange", refresh);
    };
  }, []);
  return state;
}
