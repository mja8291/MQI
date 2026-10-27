
import { useCallback, useEffect, useState } from "react";
import { getDrafts, getPendingSubmissions, type QueuedSubmission, type SurveyDraft } from "@/lib/offline/db";
import { DRAFTS_CHANGED_EVENT } from "@/lib/draft";
import { isSyncing, SYNC_CHANGED_EVENT } from "@/lib/offline/sync";

/**
 * Everything the Queue tab shows, read straight from IndexedDB: surveys still
 * being filled in (drafts) and finished ones waiting to reach the server
 * (queued submissions). Refreshes whenever either list may have changed, and
 * when connectivity or visibility does (a phone coming back online is exactly
 * when queued surveys start moving).
 */
export function useQueue() {
  const [drafts, setDrafts] = useState<SurveyDraft[]>([]);
  const [pending, setPending] = useState<QueuedSubmission[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const [d, p] = await Promise.all([getDrafts().catch(() => []), getPendingSubmissions().catch(() => [])]);
    setDrafts(d);
    // Oldest first — the order they're sent in.
    setPending([...p].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    setSyncing(isSyncing());
    setLoaded(true);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refresh());
    const onChange = () => void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener(DRAFTS_CHANGED_EVENT, onChange);
    window.addEventListener(SYNC_CHANGED_EVENT, onChange);
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(DRAFTS_CHANGED_EVENT, onChange);
      window.removeEventListener(SYNC_CHANGED_EVENT, onChange);
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return { drafts, pending, syncing, loaded, refresh };
}
