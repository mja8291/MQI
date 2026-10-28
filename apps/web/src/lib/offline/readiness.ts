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
}

async function check(): Promise<OfflineReadiness> {
  const app = typeof navigator !== "undefined" && "serviceWorker" in navigator
    ? Boolean((await navigator.serviceWorker.getRegistration())?.active)
    : false;
  return { app, schools: (await getCachedSchools())?.length ?? 0 };
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
