
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/ui/ScreenShell";
import { Field, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/client";

/** Only same-app paths — `next` comes from the URL, so it mustn't be able to send someone to another site after signing in. */
function safeNext(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/sign") ? next : "/";
}

export default function SignInPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email.trim() || !password) return;
    setBusy(true);
    setError(null);
    const failure = await signIn(email.trim(), password);
    if (failure) {
      setError(failure);
      setBusy(false);
      return;
    }
    router.replace(safeNext());
  }

  return (
    <ScreenShell>
      <div className="flex-[0.25]" />
      <div className="h-16 w-16 rounded-2xl bg-white border border-border flex items-center justify-center p-2 mb-5">
        <Image src="/tcf-logo.png" alt="The Citizens Foundation logo" width={48} height={48} style={{ objectFit: "contain" }} priority />
      </div>
      <h1 className="text-[26px] mb-1.5 text-brand-deep">Sign in</h1>
      <p className="text-sm text-ink-soft leading-relaxed mb-6">Sign in to start or continue a campus survey.</p>

      <form onSubmit={submit}>
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
        <Field label="Password">
          <TextInput
            type="password"
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {error ? (
          <p role="alert" className="text-[12.5px] text-band-poor leading-snug mb-3">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={busy || !email.trim() || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="text-center text-[13px] text-ink-soft mt-5">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-brand-deep underline">
          Create an account
        </Link>
      </p>
      <div className="flex-1" />
    </ScreenShell>
  );
}
