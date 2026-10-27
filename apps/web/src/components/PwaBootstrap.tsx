import { useEffect, useRef, useState } from "react";
import { Workbox } from "workbox-window";
import { UPGRADE_EVENT } from "@/lib/api";
import { startSyncTriggers } from "@/lib/offline/sync";

/**
 * Registers the service worker and starts the sync triggers (app start, foreground, online,
 * Background Sync, every 5 min while visible). As in v1, it asks for a new worker on every open,
 * reconnection and return to the foreground rather than waiting for the browser's own throttled
 * check. A waiting worker is applied at once when the server says this app is too old
 * (UPGRADE_REQUIRED); otherwise the banner offers it.
 */
export function PwaBootstrap() {
  const [wb, setWb] = useState<Workbox | null>(null);
  const [waiting, setWaiting] = useState(false);
  const reloadOnControlRef = useRef(false);

  useEffect(() => startSyncTriggers(), []);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;
    const workbox = new Workbox("/sw.js");
    workbox.addEventListener("waiting", () => setWaiting(true));
    // Reload only after this page asked the waiting worker to take over (Update tapped, or
    // UPGRADE_REQUIRED). A worker claiming the page on its own — the first install finishing
    // its precache a few seconds in — must never reload mid-survey.
    workbox.addEventListener("controlling", () => {
      if (reloadOnControlRef.current) window.location.reload();
    });
    void workbox.register().catch(() => {
      // Offline support just won't be available this session — not fatal.
    });
    queueMicrotask(() => setWb(workbox));
    const check = () => void workbox.update().catch(() => {});
    const onVisible = () => document.visibilityState === "visible" && check();
    // The server refused this version: take the new worker now instead of retrying.
    const onUpgrade = () => {
      reloadOnControlRef.current = true;
      workbox.messageSkipWaiting();
      check();
    };
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(UPGRADE_EVENT, onUpgrade);
    return () => {
      window.removeEventListener("online", check);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(UPGRADE_EVENT, onUpgrade);
    };
  }, []);

  if (!waiting || !wb) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="rounded-xl bg-brand-deep text-white px-4 py-3 flex items-center justify-between gap-3 shadow-lg">
        <span className="text-[13px]">A new version of the app is ready.</span>
        <button type="button" onClick={() => {
            reloadOnControlRef.current = true;
            wb.messageSkipWaiting();
          }} className="shrink-0 text-[13px] font-semibold underline">
          Update
        </button>
      </div>
    </div>
  );
}
