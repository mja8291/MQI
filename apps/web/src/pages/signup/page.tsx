
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";
import { ScreenShell } from "@/components/ui/ScreenShell";
import { Field, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { rawCall } from "@/lib/api";

export default function SignUpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;
  const ready = name.trim().length >= 2 && email.trim() && password.length >= 8 && password === confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    try {
      const res = await rawCall("auth.signup", { name, email, password });
      if (!res.ok) {
        setError(res.error.message || "Couldn't create the account. Try again.");
        setBusy(false);
        return;
      }
      setCreated(true);
    } catch {
      setError("No connection. You need to be online to create an account.");
      setBusy(false);
    }
  }

  if (created) {
    return (
      <ScreenShell>
        <div className="flex-[0.3]" />
        <div className="h-16 w-16 rounded-full bg-brand-tint text-brand flex items-center justify-center mx-auto mb-5">
          <Check size={30} />
        </div>
        <h1 className="text-[26px] text-center text-brand-deep mb-1.5">Account created</h1>
        <p className="text-sm text-ink-soft text-center leading-relaxed mb-7">
          An administrator needs to approve your account before you can sign in. Once they have, come back and sign in
          with the email and password you just chose.
        </p>
        <Link
          href="/signin"
          className="w-full min-h-11 rounded-xl px-5 py-3 text-sm font-semibold text-center bg-brand text-white"
        >
          Go to sign in
        </Link>
        <div className="flex-1" />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <div className="flex-[0.15]" />
      <div className="h-16 w-16 rounded-2xl bg-white border border-border flex items-center justify-center p-2 mb-5">
        <Image src="/tcf-logo.png" alt="The Citizens Foundation logo" width={48} height={48} style={{ objectFit: "contain" }} priority />
      </div>
      <h1 className="text-[26px] mb-1.5 text-brand-deep">Create an account</h1>
      <p className="text-sm text-ink-soft leading-relaxed mb-6">
        New accounts are approved by an administrator before they can be used.
      </p>

      <form onSubmit={submit}>
        <Field label="Full name">
          <TextInput autoComplete="name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email">
          <TextInput
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password (at least 8 characters)">
          <TextInput
            type="password"
            autoComplete="new-password"
            placeholder="Choose a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirm password">
          <TextInput
            type="password"
            autoComplete="new-password"
            placeholder="Type it again"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>

        {mismatch ? <p className="text-[12.5px] text-band-poor -mt-2 mb-3">The passwords don&apos;t match.</p> : null}
        {error ? (
          <p role="alert" className="text-[12.5px] text-band-poor leading-snug mb-3">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={busy || !ready}>
          {busy ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="text-center text-[13px] text-ink-soft mt-5 mb-6">
        Already have an account?{" "}
        <Link href="/signin" className="font-semibold text-brand-deep underline">
          Sign in
        </Link>
      </p>
      <div className="flex-1" />
    </ScreenShell>
  );
}
