
import { useEffect, useState } from "react";
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
  const { state, hydrated, setRespondent, startSurvey } = useSurvey();
  const [staff, setStaff] = useState<string[]>(() => {
    const saved = splitStaff(state.apm);
    return saved.length ? saved : [user?.name ?? ""];
  });
  const [asm, setAsm] = useState(state.asm);
  const [principal, setPrincipal] = useState(state.principal);

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
    startSurvey();
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
        <button
          type="button"
          onClick={() => setStaff((list) => [...list, ""])}
          className="mt-2 text-[13px] font-semibold text-brand-deep underline"
        >
          + Add accompanying staff
        </button>
      </Field>
      <Field label="ASM (if present)">
        <TextInput placeholder="Admin and support manager" value={asm} onChange={(e) => setAsm(e.target.value)} />
      </Field>
      <Field label="Principal (if present)">
        <TextInput placeholder="School principal's name" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
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
