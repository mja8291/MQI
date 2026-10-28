
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/lib/auth/client";
import { can } from "@mqi/shared";
import { QueueTab } from "./QueueTab";
import { useQueue } from "./useQueue";

type Tab = "start" | "queue";

/**
 * Home is two tabs. "Start" is the front door (new survey, dashboard);
 * "Queue" holds everything that used to crowd the front door — surveys still
 * being filled in (resume them) and finished ones waiting to sync (check
 * their status) — with a count on the tab so it's noticeable without
 * taking over the screen.
 */
export function HomeTabs() {
  const queue = useQueue();
  const { status, user, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("start");
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  // "/?tab=queue" (the Done screen's "View queue") opens straight on the queue.
  useEffect(() => {
    queueMicrotask(() => {
      if (new URLSearchParams(window.location.search).get("tab") === "queue") setTab("queue");
    });
  }, []);

  const count = queue.drafts.length + queue.pending.length;
  const needsAttention = queue.pending.some((p) => p.status === "failed" || p.lastError?.kind === "auth" || p.lastError?.kind === "server");

  const tabClass = (active: boolean) =>
    `flex-1 min-h-11 rounded-lg px-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
      active ? "bg-white text-brand-deep shadow-sm" : "text-ink-soft"
    }`;

  return (
    <>
      {status === "signedIn" && user ? (
        <div className="flex items-center justify-between gap-3 mb-3 text-[12px] text-ink-soft">
          <span className="truncate">
            Signed in as <span className="font-semibold text-ink">{user.name}</span>
          </span>
          <button type="button" onClick={() => setConfirmSignOut(true)} className="shrink-0 font-semibold text-brand-deep underline">
            Sign out
          </button>
        </div>
      ) : null}

      <div role="tablist" aria-label="Home" className="flex gap-1 rounded-xl bg-border/60 p-1 mb-5">
        <button type="button" role="tab" aria-selected={tab === "start"} onClick={() => setTab("start")} className={tabClass(tab === "start")}>
          Start
        </button>
        <button type="button" role="tab" aria-selected={tab === "queue"} onClick={() => setTab("queue")} className={tabClass(tab === "queue")}>
          Queue
          {count > 0 ? (
            <span
              aria-label={`${count} in the queue`}
              className={`min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center text-white ${
                needsAttention ? "bg-band-poor" : "bg-brand"
              }`}
            >
              {count}
            </span>
          ) : null}
        </button>
      </div>

      {tab === "start" ? (
        <div className="flex-1 flex flex-col">
          <div className="flex-[0.4]" />
          <div className="h-16 w-16 rounded-2xl bg-white border border-border flex items-center justify-center p-2 mb-5">
            <Image
              src="/tcf-logo.png"
              alt="The Citizens Foundation logo"
              width={48}
              height={48}
              style={{ objectFit: "contain" }}
              priority
            />
          </div>
          <h1 className="text-[26px] mb-1.5 text-brand-deep">MQI survey</h1>
          <p className="text-sm text-ink-soft leading-relaxed mb-7">
            TCF Repair &amp; Maintenance Programme — score a campus against the Maintenance Quality Index, on site, in
            one session.
          </p>
          {/* v2: hidden for roles that cannot submit (permission matrix); the server refuses them anyway. */}
          {!user || can(user.role, "survey") ? (
            <Link
              href="/survey/find-school"
              className="w-full min-h-11 rounded-xl px-5 py-3 text-sm font-semibold text-center bg-brand text-white"
            >
              Start new survey
            </Link>
          ) : null}
          <Link
            href="/dashboard"
            className="w-full min-h-11 rounded-xl px-5 py-3 text-sm font-semibold text-center bg-transparent text-brand-deep border border-border mt-2.5"
          >
            View dashboard
          </Link>
          {user?.role === "ADMIN" ? (
            <Link
              href="/admin"
              className="w-full min-h-11 rounded-xl px-5 py-3 text-sm font-semibold text-center bg-transparent text-brand-deep border border-border mt-2.5"
            >
              Manage users
            </Link>
          ) : null}
          {count > 0 ? (
            <button
              type="button"
              onClick={() => setTab("queue")}
              className="mt-4 text-[12.5px] text-ink-soft underline self-center"
            >
              {queue.drafts.length > 0 ? `${queue.drafts.length} in progress` : ""}
              {queue.drafts.length > 0 && queue.pending.length > 0 ? " · " : ""}
              {queue.pending.length > 0 ? `${queue.pending.length} waiting to sync` : ""} — open queue
            </button>
          ) : null}
          <div className="flex-1" />
        </div>
      ) : (
        <div className="pb-8">
          <QueueTab {...queue} />
        </div>
      )}

      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out?"
        message={
          count > 0
            ? `You have ${count} survey${count === 1 ? "" : "s"} in the queue. Drafts stay on this phone, and finished surveys will sync after you sign in again — nothing is lost.`
            : "You'll need to sign in again, online, before using the app on this phone."
        }
        confirmLabel="Sign out"
        onConfirm={() => {
          setConfirmSignOut(false);
          void signOut();
        }}
        onCancel={() => setConfirmSignOut(false)}
      />
    </>
  );
}
