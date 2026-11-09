
import { useEffect, useState } from "react";
import { SURVEY_PURPOSE_OPTIONS, SURVEY_PURPOSE_QUESTION } from "@mqi/shared";
import type { SurveyPurpose } from "@mqi/shared";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/ui/ScreenShell";
import { TopBar } from "@/components/ui/TopBar";
import { Field, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { BottomBar } from "@/components/ui/BottomBar";
import { useAuth } from "@/lib/auth/client";
import { useSurvey } from "@/lib/survey-context";
import { joinStaff, splitStaff } from "@mqi/shared";

/**
 * Survey details, then into the survey (scoring location by location).
 *
 * v2 (W11): the person filling the survey is the first of the accompanying engineering staff,
 * filled in from their account; more people can be added. ASM and Principal are recorded only
 * when present.
 */
export default function SurveyDetailsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { state, hydrated, setRespondent, setPurpose, startSurvey } = useSurvey();
  const [staff, setStaff] = useState<string[]>(() => {
    const saved = splitStaff(state.apm);
    return saved.length ? saved : [user?.name ?? ""];
  });
  const [asm, setAsm] = useState(state.asm);
  const [principal, setPrincipal] = useState(state.principal);
  // W62: an actual assessment unless the surveyor says it is for checking or training.
  const [purpose, setLocalPurpose] = useState<SurveyPurpose>(state.purpose ?? "Assessment");

  useEffect(() => {
    // See survey/locations/page.tsx's matching effect for why this waits.
    if (!hydrated) return;
    if (!state.school) router.replace("/survey/find-school");
  }, [hydrated, state.school, router]);

  const detailsComplete = staff.some((s) => s.trim());

  function setStaffAt(i: number, value: string) {
    setStaff((list) => list.map((s, j) => (j === i ? value : s)));
  }

  function start() {
    if (!detailsComplete) return;
    setRespondent(asm.trim(), joinStaff(staff), principal.trim());
    setPurpose(purpose);
    startSurvey();
    // W49: the survey's answers and photos are about to live only on this phone — ask the browser
    // to keep this app's storage through low-space clean-ups (a tap, as browsers prefer).
    void navigator.storage?.persist?.().catch(() => false);
    router.push("/survey/levels");
  }

  if (!state.school) return null;

  return (
    <ScreenShell>
      <TopBar
        title="Survey details"
        subtitle={`${state.school.name} · ${state.school.region}`}
        onBack={() => router.push("/survey/find-school")}
      />

      <Field label="Accompanying Engineering Staff *">
        <div className="space-y-2">
          {staff.map((name, i) => (
            <div key={i} className="flex gap-2">
              <TextInput
                placeholder={i === 0 ? "Your name" : "Name of accompanying staff"}
                maxLength={80}
                value={name}
                onChange={(e) => setStaffAt(i, e.target.value)}
              />
              {i > 0 ? (
                <button
                  type="button"
                  aria-label={`Remove ${name || "this person"}`}
                  onClick={() => setStaff((list) => list.filter((_, j) => j !== i))}
                  className="shrink-0 min-w-11 rounded-[10px] border border-border text-ink-soft text-lg"
                >
                  ×
                </button>
              ) : null}
            </div>
          ))}
        </div>
        {/* W51: six names of up to 80 characters fit the server's 600-character limit. */}
        {staff.length < 6 ? (
          <button
            type="button"
            onClick={() => setStaff((list) => [...list, ""])}
            className="mt-2 text-[13px] font-semibold text-brand-deep underline"
          >
            + Add accompanying staff
          </button>
        ) : null}
      </Field>
      <Field label="ASM (if present)">
        <TextInput placeholder="Admin and support manager" maxLength={120} value={asm} onChange={(e) => setAsm(e.target.value)} />
      </Field>
      <Field label="Principal (if present)">
        <TextInput placeholder="School principal's name" maxLength={120} value={principal} onChange={(e) => setPrincipal(e.target.value)} />
      </Field>

      <Field label={SURVEY_PURPOSE_QUESTION}>
        <div role="radiogroup" aria-label={SURVEY_PURPOSE_QUESTION} className="space-y-2">
          {SURVEY_PURPOSE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={purpose === o.value}
              onClick={() => setLocalPurpose(o.value)}
              className={`w-full rounded-xl border px-3.5 py-2.5 text-left ${purpose === o.value ? "border-brand bg-brand-tint/50" : "border-border bg-card"}`}
            >
              <div className="text-[13.5px] font-semibold text-ink">{o.label}</div>
              <div className="text-[11.5px] text-ink-soft">{o.hint}</div>
            </button>
          ))}
        </div>
      </Field>

      {!detailsComplete ? (
        <p className="text-[11.5px] text-ink-faint -mt-2 mb-3">Enter at least one engineering staff name to continue.</p>
      ) : null}

      <p className="text-[12.5px] text-ink-soft leading-snug">
        You&apos;ll score the campus location by location — pick a floor, then the type of location, then score each
        item group that applies there.
      </p>

      <BottomBar>
        <Button onClick={start} disabled={!detailsComplete}>
          Start survey
        </Button>
      </BottomBar>
    </ScreenShell>
  );
}
