import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/ui/ScreenShell";
import { TopBar } from "@/components/ui/TopBar";
import { Field, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/client";
import { PASSWORD_MIN } from "@mqi/shared";

/** v2: forced after a temporary password (admin reset or first sign-in); also open to any signed-in user. */
export default function ChangePasswordPage() {
  const router = useRouter();
  const { status, changePassword, signOut } = useAuth();
  const forced = status === "mustChange";
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirm.length > 0 && next !== confirm;
  const ready = current.length > 0 && next.length >= PASSWORD_MIN && next === confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    const failure = await changePassword(current, next);
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    router.replace("/");
  }

  return (
    <ScreenShell>
      <TopBar title="Change password" showBack={!forced} onBack={() => router.push("/")} />
      <p className="text-sm text-ink-soft leading-relaxed mb-6">
        {forced
          ? "You signed in with a temporary password. Choose your own password to continue."
          : "Changing your password signs you out on every other phone."}
      </p>
      <form onSubmit={submit}>
        <Field label={forced ? "Temporary password" : "Current password"}>
          <TextInput type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label={`New password (at least ${PASSWORD_MIN} characters)`}>
          <TextInput type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirm new password">
          <TextInput type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {mismatch ? <p className="text-[12.5px] text-band-poor mb-3">The passwords don&apos;t match.</p> : null}
        {error ? (
          <p role="alert" className="text-[12.5px] text-band-poor leading-snug mb-3">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy || !ready}>
          {busy ? "Saving…" : "Save new password"}
        </Button>
      </form>
      {forced ? (
        <button type="button" onClick={() => void signOut()} className="mt-5 self-center text-[13px] text-ink-soft underline">
          Sign out
        </button>
      ) : null}
      <div className="flex-1" />
    </ScreenShell>
  );
}
