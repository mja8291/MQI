import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { ROLES, ROLE_LABEL } from "@mqi/shared";
import type { AdminUser, IssuePasswordResult, Role } from "@mqi/shared";
import { ScreenShell } from "@/components/ui/ScreenShell";
import { TopBar } from "@/components/ui/TopBar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/client";

type Pending = { kind: "revoke"; user: AdminUser } | { kind: "password"; user: AdminUser } | null;

const STATUS_CLASS: Record<AdminUser["status"], string> = {
  PENDING: "bg-band-average-tint text-band-average",
  ACTIVE: "bg-brand-tint text-brand-deep",
  REVOKED: "bg-band-poor-tint text-band-poor",
};

/**
 * v2 admin screen: approve, change role, revoke, and issue a temporary password (the user must
 * change it at next sign-in). Replaces editing the Approved column in the sheet (v1 FR-AUTH-2).
 * Every action is checked again on the server; this page only hides what a non-admin can't do.
 */
export default function AdminPage() {
  const router = useRouter();
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roleFor, setRoleFor] = useState<Record<string, Role>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Pending>(null);
  const [issued, setIssued] = useState<{ user: AdminUser; password: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers((await api<{ users: AdminUser[] }>("admin.users.list")).users);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load users. You need a connection.");
    }
  }, []);

  useEffect(() => {
    if (me && me.role !== "ADMIN") router.replace("/");
    else queueMicrotask(() => void load());
  }, [me, router, load]);

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const approve = (u: AdminUser) => run(u.id, () => api("admin.users.approve", { userId: u.id, role: roleFor[u.id] ?? u.role }));

  async function confirmAction() {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    if (c.kind === "revoke") return run(c.user.id, () => api("admin.users.revoke", { userId: c.user.id }));
    await run(c.user.id, async () => {
      const r = await api<IssuePasswordResult>("admin.issuePassword", { userId: c.user.id });
      setIssued({ user: c.user, password: r.temporaryPassword });
    });
  }

  const groups: [string, AdminUser[]][] = users
    ? [
        ["Waiting for approval", users.filter((u) => u.status === "PENDING")],
        ["Active", users.filter((u) => u.status === "ACTIVE")],
        ["Access removed", users.filter((u) => u.status === "REVOKED")],
      ]
    : [];

  return (
    <ScreenShell>
      <TopBar title="Manage users" onBack={() => router.push("/")} />
      {error ? <p className="text-[12.5px] text-band-poor mb-3">{error}</p> : null}
      {issued ? (
        <div className="rounded-xl border border-brand bg-brand-tint px-3.5 py-3 mb-4">
          <div className="text-[12.5px] text-brand-deep mb-1.5">
            Temporary password for <span className="font-semibold">{issued.user.name}</span>. Give it to them in person or by phone; it is shown only
            once. They must choose a new one when they sign in.
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-[15px] font-semibold text-ink bg-white rounded-lg px-3 py-2 select-all">{issued.password}</code>
            <button
              type="button"
              aria-label="Copy temporary password"
              onClick={() => void navigator.clipboard?.writeText(issued.password)}
              className="h-10 w-10 rounded-lg border border-border bg-white flex items-center justify-center text-ink-soft"
            >
              <Copy size={15} />
            </button>
          </div>
          <button type="button" onClick={() => setIssued(null)} className="mt-2 text-[12px] text-brand-deep underline">
            Done
          </button>
        </div>
      ) : null}
      {!users && !error ? <p className="text-[13px] text-ink-faint text-center py-10">Loading…</p> : null}
      {groups.map(([title, list]) =>
        list.length ? (
          <section key={title} className="mb-5">
            <h2 className="text-xs font-semibold text-brand-deep uppercase tracking-wide mb-2">
              {title} ({list.length})
            </h2>
            <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
              {list.map((u) => (
                <div key={u.id} className="px-3.5 py-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-ink truncate">{u.name}</div>
                      <div className="text-[11px] text-ink-faint truncate">{u.email}</div>
                    </div>
                    <span className={`shrink-0 text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CLASS[u.status]}`}>
                      {u.status === "ACTIVE" ? ROLE_LABEL[u.role] : u.status === "PENDING" ? "Pending" : "Revoked"}
                    </span>
                  </div>
                  {u.id !== me?.id ? (
                    <div className="flex flex-wrap items-center gap-2 mt-2.5">
                      <select
                        aria-label={`Role for ${u.name}`}
                        value={roleFor[u.id] ?? u.role}
                        onChange={(e) => setRoleFor((r) => ({ ...r, [u.id]: e.target.value as Role }))}
                        className="h-9 rounded-lg border border-border bg-white px-2 text-xs"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                      {u.status !== "ACTIVE" || (roleFor[u.id] && roleFor[u.id] !== u.role) ? (
                        <button
                          type="button"
                          disabled={busy === u.id}
                          onClick={() => void approve(u)}
                          className="h-9 px-3 rounded-lg bg-brand text-white text-xs font-semibold flex items-center gap-1.5"
                        >
                          <ShieldCheck size={13} /> {u.status === "ACTIVE" ? "Save role" : "Approve"}
                        </button>
                      ) : null}
                      {u.status !== "REVOKED" ? (
                        <button
                          type="button"
                          disabled={busy === u.id}
                          onClick={() => setConfirm({ kind: "revoke", user: u })}
                          className="h-9 px-3 rounded-lg border border-border text-band-poor text-xs font-semibold flex items-center gap-1.5"
                        >
                          <ShieldOff size={13} /> Revoke
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy === u.id}
                        onClick={() => setConfirm({ kind: "password", user: u })}
                        className="h-9 px-3 rounded-lg border border-border text-brand-deep text-xs font-semibold flex items-center gap-1.5"
                      >
                        <KeyRound size={13} /> Temporary password
                      </button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-ink-faint mt-1.5">This is you.</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null,
      )}
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === "revoke" ? "Remove access?" : "Issue a temporary password?"}
        message={
          confirm?.kind === "revoke"
            ? `${confirm.user.name} will be signed out within a minute and can't sync until approved again. Surveys already on their phone stay there.`
            : `${confirm?.user.name ?? "This user"}'s current password stops working and every phone they use is signed out.`
        }
        confirmLabel={confirm?.kind === "revoke" ? "Remove access" : "Issue password"}
        onConfirm={() => void confirmAction()}
        onCancel={() => setConfirm(null)}
      />
    </ScreenShell>
  );
}
