
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CloudOff, FileClock, Loader2, RefreshCw, X, KeyRound } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { deleteDraft, discardSurvey, retrySurvey, type QueuedSubmission, type SurveyDraft } from "@/lib/offline/db";
import { DRAFTS_CHANGED_EVENT } from "@/lib/draft";
import { flushPendingSubmissions, LAST_SYNC_KEY } from "@/lib/offline/sync";
import { METHOD1_ITEMS } from "@/lib/data/method1-items";

/** Coarse "how long ago" — these are lists of a handful of items at most, not worth a date library. */
function relativeTime(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function draftProgress(d: SurveyDraft): string {
  if (d.method === 1) {
    return `Method 1 · ${Object.keys(d.state.m1.scores).length} of ${METHOD1_ITEMS.length} items scored`;
  }
  const done = d.state.m2.locations.length;
  const current = d.state.m2.current ? " + 1 being scored" : "";
  return `${done} location${done === 1 ? "" : "s"} recorded${current}`;
}

type Tone = "info" | "warn" | "muted";

/** v2 adds "failed": a survey the server permanently rejected; it waits for Retry or Discard and never blocks the rest. */
function syncStatus(p: QueuedSubmission, syncingNow: boolean): { label: string; tone: Tone; needsSignIn: boolean; failed?: boolean } {
  if (p.status === "failed") return { label: `Couldn't be sent: ${p.lastError?.message ?? "rejected by the server"}`, tone: "warn", needsSignIn: false, failed: true };
  if (syncingNow) return { label: "Syncing…", tone: "info", needsSignIn: false };
  if (p.lastError?.kind === "auth") return { label: "Sign in to sync", tone: "warn", needsSignIn: true };
  if (p.lastError?.kind === "server") return { label: p.lastError.message, tone: "warn", needsSignIn: false };
  if (p.lastError?.kind === "offline" || (typeof navigator !== "undefined" && !navigator.onLine)) {
    return { label: "Waiting for a connection", tone: "muted", needsSignIn: false };
  }
  if (p.status === "uploading") return { label: "On the server · uploading photos", tone: "muted", needsSignIn: false };
  return { label: "Waiting to sync", tone: "muted", needsSignIn: false };
}

const TONE_CLASS: Record<Tone, string> = {
  info: "text-brand-deep",
  warn: "text-band-poor",
  muted: "text-ink-faint",
};

interface QueueTabProps {
  drafts: SurveyDraft[];
  pending: QueuedSubmission[];
  syncing: boolean;
  loaded: boolean;
  refresh: () => Promise<void>;
}

export function QueueTab({ drafts, pending, syncing, loaded, refresh }: QueueTabProps) {
  const router = useRouter();
  const [discarding, setDiscarding] = useState<SurveyDraft | null>(null);
  const [discardingQueued, setDiscardingQueued] = useState<QueuedSubmission | null>(null);

  let lastSync: string | null = null;
  try {
    lastSync = localStorage.getItem(LAST_SYNC_KEY);
  } catch {
    // storage blocked: no last-sync time to show
  }

  async function syncNow() {
    // Sync now ignores the retry backoff.
    await flushPendingSubmissions(true);
    await refresh();
  }

  async function confirmDiscard() {
    if (!discarding) return;
    await deleteDraft(discarding.surveyId);
    setDiscarding(null);
    window.dispatchEvent(new Event(DRAFTS_CHANGED_EVENT));
  }

  async function retry(p: QueuedSubmission) {
    await retrySurvey(p.id);
    await flushPendingSubmissions(true);
    await refresh();
  }

  async function confirmDiscardQueued() {
    if (!discardingQueued) return;
    await discardSurvey(discardingQueued.id);
    setDiscardingQueued(null);
    await refresh();
  }

  if (!loaded) return <p className="text-[13px] text-ink-faint text-center py-10">Loading…</p>;

  if (drafts.length === 0 && pending.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm font-medium text-ink mb-1">Nothing in the queue</p>
        <p className="text-[12.5px] text-ink-soft leading-relaxed">
          Surveys you&apos;re filling in, and finished ones waiting to sync, show up here.
          {lastSync ? ` Last synced ${relativeTime(lastSync)}.` : ""}
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[12.5px] text-ink-soft mb-4">
        {drafts.length} in progress · {pending.length} waiting to sync
        {lastSync ? ` · last synced ${relativeTime(lastSync)}` : ""}
      </p>

      {pending.length > 0 ? (
        <section className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-brand-deep uppercase tracking-wide">
              Waiting to sync ({pending.length})
            </h2>
            <button
              type="button"
              onClick={syncNow}
              disabled={syncing}
              className="h-8 px-3 rounded-lg bg-white border border-border text-brand-deep text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60"
            >
              <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          </div>
          <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
            {pending.map((p, index) => {
              const status = syncStatus(p, syncing && index === 0);
              const photos = p.pendingPhotos.length;
              const locations = p.payload.locations?.length ?? 0;
              return (
                <div key={p.id} className="flex items-start gap-2.5 px-3.5 py-3">
                  {syncing && index === 0 ? (
                    <Loader2 size={16} className="text-brand animate-spin shrink-0 mt-0.5" />
                  ) : status.needsSignIn ? (
                    <KeyRound size={16} className="text-band-poor shrink-0 mt-0.5" />
                  ) : (
                    <CloudOff size={16} className="text-ink-faint shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-ink truncate">{p.payload.school.name}</div>
                    <div className="text-[11px] text-ink-faint">
                      {p.payload.method === 2 && locations > 0
                        ? `${locations} location${locations === 1 ? "" : "s"} · `
                        : p.payload.method === 1
                          ? "Method 1 · "
                          : ""}
                      submitted {relativeTime(p.createdAt)}
                      {photos > 0 ? ` · ${photos} photo${photos === 1 ? "" : "s"} still to upload` : ""}
                    </div>
                    <div className={`text-[11.5px] font-medium mt-0.5 ${TONE_CLASS[status.tone]}`}>
                      {status.label}
                      {p.lastAttemptAt && !status.needsSignIn && !(syncing && index === 0)
                        ? ` · tried ${relativeTime(p.lastAttemptAt)}`
                        : ""}
                    </div>
                  </div>
                  {status.needsSignIn ? (
                    <Link href="/signin" className="shrink-0 text-xs font-semibold text-brand-deep underline pt-1">
                      Sign in
                    </Link>
                  ) : null}
                  {status.failed ? (
                    <span className="shrink-0 flex flex-col gap-1.5">
                      <button type="button" onClick={() => void retry(p)} className="h-8 px-3 rounded-lg bg-brand text-white text-xs font-semibold">
                        Retry
                      </button>
                      <button type="button" onClick={() => setDiscardingQueued(p)} className="h-8 px-3 rounded-lg border border-border text-band-poor text-xs font-semibold">
                        Discard
                      </button>
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {drafts.length > 0 ? (
        <section>
          <h2 className="text-xs font-semibold text-brand-deep uppercase tracking-wide mb-2">
            In progress ({drafts.length})
          </h2>
          <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
            {drafts.map((d) => (
              <div key={d.surveyId} className="flex items-center gap-2.5 px-3.5 py-3">
                <FileClock size={16} className="text-ink-faint shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-ink truncate">{d.schoolName}</div>
                  <div className="text-[11px] text-ink-faint">
                    {draftProgress(d)} · saved {relativeTime(d.savedAt)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(`/survey/resume?id=${encodeURIComponent(d.surveyId)}`)}
                  className="shrink-0 h-9 px-3 rounded-lg bg-brand text-white text-xs font-semibold"
                >
                  Resume
                </button>
                <button
                  type="button"
                  onClick={() => setDiscarding(d)}
                  aria-label={`Discard draft for ${d.schoolName}`}
                  className="shrink-0 h-8 w-8 flex items-center justify-center text-ink-faint"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <ConfirmDialog
        open={discarding !== null}
        title="Discard this draft?"
        message={`The unfinished survey for ${discarding?.schoolName ?? "this campus"} will be deleted from this phone. This can't be undone.`}
        confirmLabel="Discard"
        cancelLabel="Keep it"
        onConfirm={confirmDiscard}
        onCancel={() => setDiscarding(null)}
      />
      <ConfirmDialog
        open={discardingQueued !== null}
        title="Discard this survey?"
        message={`The survey for ${discardingQueued?.payload.school.name ?? "this campus"} could not be sent and will be deleted from this phone, with its photos. This can't be undone.`}
        confirmLabel="Discard"
        cancelLabel="Keep it"
        onConfirm={confirmDiscardQueued}
        onCancel={() => setDiscardingQueued(null)}
      />
    </div>
  );
}
