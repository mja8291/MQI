import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Copy, KeyRound, ShieldCheck, ShieldOff, Trash2, UserPlus } from "lucide-react";
import { ROLES, ROLE_LABEL } from "@mqi/shared";
import type { AdminUser, CreateUserResult, IssuePasswordResult, Role } from "@mqi/shared";
import { ScreenShell } from "@/components/ui/ScreenShell";
import { TopBar } from "@/components/ui/TopBar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StalledUploads } from "@/components/admin/StalledUploads";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/client";

type Pending = { kind: "revoke" | "password" | "delete"; user: AdminUser } | null;
type SectionKey = "PENDING" | "ACTIVE" | "REVOKED";

const STATUS_CLASS: Record<AdminUser["status"], string> = {
  PENDING: "bg-band-average-tint text-band-average",
  ACTIVE: "bg-brand-tint text-brand-deep",
  REVOKED: "bg-band-poor-tint text-band-poor",
};
const SECTIONS: { key: SectionKey; title: string; empty: string }[] = [
  { key: "PENDING", title: "New account requests", empty: "No requests waiting." },
  { key: "ACTIVE", title: "Active users", empty: "No active users." },
  { key: "REVOKED", title: "Access removed", empty: "Nobody has had access removed." },
];
const INPUT = "w-full rounded-lg border border-border bg-white px-3 py-2.5 text-[14px] text-ink";

/**
 * v2 admin screen: approve, change role, revoke, and issue a temporary password (the user must
 * change it at next sign-in). Replaces editing the Approved column in the sheet (v1 FR-AUTH-2).
 * W75 (2026-11-16): create an account (active at once, one-time password), delete an account for
 * good, search, and sections that fold (requests open; a user's actions show when tapped).
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
  const [issued, setIssued] = useState<{ name: string; password: string; created?: boolean } | null>(null);
  const [query, setQuery] = useState("");
  const [folded, setFolded] = useState<Record<SectionKey, boolean>>({ PENDING: false, ACTIVE: false, REVOKED: true });
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<{ name: string; email: string; role: Role }>({ name: "", email: "", role: "SURVEYOR" });

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
    if (c.kind === "delete") return run(c.user.id, () => api("admin.users.delete", { userId: c.user.id }));
    await run(c.user.id, async () => {
      const r = await api<IssuePasswordResult>("admin.issuePassword", { userId: c.user.id });
      setIssued({ name: c.user.name, password: r.temporaryPassword });
    });
  }

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    await run("create", async () => {
      const r = await api<CreateUserResult>("admin.users.create", { name: form.name, email: form.email, role: form.role });
      setIssued({ name: r.user.name, password: r.temporaryPassword, created: true });
      setForm({ name: "", email: "", role: "SURVEYOR" });
      setCreating(false);
    });
  }

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (u: AdminUser) => !words.length || words.every((w) => `${u.name} ${u.email} ${ROLE_LABEL[u.role]}`.toLowerCase().includes(w));
  const byName = (a: AdminUser, b: AdminUser) => a.name.localeCompare(b.name);

  return (
    <ScreenShell>
      <TopBar title="Manage users" onBack={() => router.push("/")} />
      {error ? (
        <p role="alert" className="text-[12.5px] text-band-poor mb-3">
          {error}
        </p>
      ) : null}
      {issued ? (
        <div className="rounded-xl border border-brand bg-brand-tint px-3.5 py-3 mb-4">
          <div className="text-[12.5px] text-brand-deep mb-1.5">
            {issued.created ? "Account created. " : ""}Temporary password for <span className="font-semibold">{issued.name}</span>. Give it to them in person or by phone; it is
            shown only once. They must choose a new one when they sign in.
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

      {/* W90: surveys whose photos have waited more than a day. */}
      <StalledUploads />

      {/* W75: create an account. */}
      <div className="rounded-xl border border-border bg-card mb-3 overflow-hidden">
        <button
          type="button"
          aria-expanded={creating}
          onClick={() => setCreating((v) => !v)}
          className="w-full flex items-center gap-2 px-3.5 py-3 text-[13px] font-semibold text-brand-deep"
        >
          <UserPlus size={15} /> Create an account
          <ChevronDown size={15} className={`ml-auto ${creating ? "rotate-180" : ""}`} />
        </button>
        {creating ? (
          <form onSubmit={(e) => void createAccount(e)} className="px-3.5 pb-3.5 space-y-2.5 border-t border-border pt-3">
            <input aria-label="Full name" placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={INPUT} required minLength={2} />
            <input aria-label="Email" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={INPUT} required />
            <select aria-label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className={INPUT}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <p className="text-[11.5px] text-ink-soft leading-snug">The account is active at once. You get a one-time password to pass on; they choose their own at first sign-in.</p>
            <button type="submit" disabled={busy === "create"} className="w-full min-h-11 rounded-lg bg-brand text-white text-[13px] font-semibold disabled:opacity-60">
              {busy === "create" ? "Creating…" : "Create account"}
            </button>
          </form>
        ) : null}
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, email or role"
        aria-label="Search users"
        className={`${INPUT} mb-3`}
      />

      {!users && !error ? <p className="text-[13px] text-ink-faint text-center py-10">Loading…</p> : null}
      {users
        ? SECTIONS.map(({ key, title, empty }) => {
            const all = users.filter((u) => u.status === key);
            const list = all.filter(matches).sort(byName);
            // A search opens every section that has a match.
            const open = words.length ? list.length > 0 : !folded[key];
            return (
              <section key={key} className="mb-3 rounded-xl border border-border bg-card overflow-hidden" aria-label={title}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setFolded((f) => ({ ...f, [key]: !f[key] }))}
                  className="w-full flex items-center gap-2 px-3.5 py-3 text-left"
                >
                  <span className="text-xs font-semibold text-brand-deep uppercase tracking-wide">{title}</span>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${key === "PENDING" && all.length ? "bg-band-poor text-white" : "bg-surface text-ink-soft"}`}
                  >
                    {words.length ? `${list.length} of ${all.length}` : all.length}
                  </span>
                  <ChevronDown size={15} className={`ml-auto text-ink-soft ${open ? "rotate-180" : ""}`} />
                </button>
                {open ? (
                  list.length ? (
                    <div className="divide-y divide-border border-t border-border">
                      {list.map((u) => {
                        const expanded = u.status === "PENDING" || openUser === u.id;
                        return (
                          <div key={u.id} className="px-3.5 py-3" data-user={u.email}>
                            <button
                              type="button"
                              aria-expanded={expanded}
                              onClick={() => setOpenUser((id) => (id === u.id ? null : u.id))}
                              className="w-full flex items-start gap-2 text-left"
                            >
                              <span className="flex-1 min-w-0">
                                <span className="block text-[13px] font-medium text-ink truncate">{u.name}</span>
                                <span className="block text-[11px] text-ink-faint truncate">{u.email}</span>
                              </span>
                              <span className={`shrink-0 text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CLASS[u.status]}`}>
                                {u.status === "ACTIVE" ? ROLE_LABEL[u.role] : u.status === "PENDING" ? "Pending" : "Revoked"}
                              </span>
                            </button>
                            {!expanded ? null : u.id !== me?.id ? (
                              <>
                                <div className="text-[11px] text-ink-faint mt-1.5">
                                  {u.createdAt ? `Created ${new Date(u.createdAt).toLocaleDateString([], { dateStyle: "medium" })}` : ""}
                                  {u.lastLoginAt ? ` · last sign-in ${new Date(u.lastLoginAt).toLocaleDateString([], { dateStyle: "medium" })}` : u.status === "ACTIVE" ? " · never signed in" : ""}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 mt-2">
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
                                      <ShieldCheck size={13} /> {u.status === "ACTIVE" ? "Save role" : u.status === "REVOKED" ? "Restore access" : "Approve"}
                                    </button>
                                  ) : null}
                                  {u.status !== "REVOKED" ? (
                                    <button
                                      type="button"
                                      disabled={busy === u.id}
                                      onClick={() => setConfirm({ kind: "revoke", user: u })}
                                      className="h-9 px-3 rounded-lg border border-border text-band-poor text-xs font-semibold flex items-center gap-1.5"
                                    >
                                      <ShieldOff size={13} /> {u.status === "PENDING" ? "Reject" : "Revoke"}
                                    </button>
                                  ) : null}
                                  {u.status !== "PENDING" ? (
                                    <button
                                      type="button"
                                      disabled={busy === u.id}
                                      onClick={() => setConfirm({ kind: "password", user: u })}
                                      className="h-9 px-3 rounded-lg border border-border text-brand-deep text-xs font-semibold flex items-center gap-1.5"
                                    >
                                      <KeyRound size={13} /> Temporary password
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    disabled={busy === u.id}
                                    onClick={() => setConfirm({ kind: "delete", user: u })}
                                    aria-label={`Delete ${u.name}'s account`}
                                    className="h-9 px-3 rounded-lg border border-band-poor text-band-poor text-xs font-semibold flex items-center gap-1.5"
                                  >
                                    <Trash2 size={13} /> Delete
                                  </button>
                                </div>
                              </>
                            ) : (
                              <div className="text-[11px] text-ink-faint mt-1.5">This is you.</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="px-3.5 pb-3 text-[12px] text-ink-faint">{words.length ? "No match." : empty}</p>
                  )
                ) : null}
              </section>
            );
          })
        : null}
      <div className="h-6" />
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === "revoke" ? "Remove access?" : confirm?.kind === "delete" ? "Delete this account for good?" : "Issue a temporary password?"}
        message={
          confirm?.kind === "revoke"
            ? `${confirm.user.name} will be signed out within a minute and can't sync until approved again. Surveys already on their phone stay there.`
            : confirm?.kind === "delete"
              ? `${confirm.user.name} (${confirm.user.email}) is removed completely and can't sign in. This cannot be undone. Surveys they already submitted stay; anything still waiting to send on their phone will not sync. To block someone for now, use Revoke instead.`
              : `${confirm?.user.name ?? "This user"}'s current password stops working and every phone they use is signed out.`
        }
        confirmLabel={confirm?.kind === "revoke" ? "Remove access" : confirm?.kind === "delete" ? "Delete account" : "Issue password"}
        onConfirm={() => void confirmAction()}
        onCancel={() => setConfirm(null)}
      />
    </ScreenShell>
  );
}
