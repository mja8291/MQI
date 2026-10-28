
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/ui/ScreenShell";
import { TopBar } from "@/components/ui/TopBar";
import { Field, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { BottomBar } from "@/components/ui/BottomBar";
import { useSurvey } from "@/lib/survey-context";

/**
 * Respondent details, then into the survey (scoring location by location).
 */
export default function SurveyDetailsPage() {
  const router = useRouter();
  const { state, hydrated, setRespondent, startSurvey } = useSurvey();
  const [apm, setApm] = useState(state.apm);
  const [asm, setAsm] = useState(state.asm);
  const [principal, setPrincipal] = useState(state.principal);

  useEffect(() => {
    // See survey/locations/page.tsx's matching effect for why this waits.
    if (!hydrated) return;
    if (!state.school) router.replace("/survey/find-school");
  }, [hydrated, state.school, router]);

  const respondentComplete = Boolean(apm.trim() && asm.trim() && principal.trim());

  function start() {
    if (!respondentComplete) return;
    setRespondent(asm, apm, principal);
    startSurvey();
    router.push("/survey/locations");
  }

  if (!state.school) return null;

  return (
    <ScreenShell>
      <TopBar
        title="Survey details"
        subtitle={`${state.school.name} · ${state.school.region}`}
        onBack={() => router.push("/survey/find-school")}
      />

      <Field label="Accompanying APM *">
        <TextInput placeholder="Assistant project manager" value={apm} onChange={(e) => setApm(e.target.value)} />
      </Field>
      <Field label="Responding ASM *">
        <TextInput placeholder="Admin and support manager" value={asm} onChange={(e) => setAsm(e.target.value)} />
      </Field>
      <Field label="School Principal *">
        <TextInput
          placeholder="School principal's name"
          value={principal}
          onChange={(e) => setPrincipal(e.target.value)}
        />
      </Field>

      {!respondentComplete ? (
        <p className="text-[11.5px] text-ink-faint -mt-2 mb-3">All three names are required to continue.</p>
      ) : null}

      <p className="text-[12.5px] text-ink-soft leading-snug">
        You&apos;ll score the campus location by location — pick a floor, then the type of location, then score each
        item group that applies there.
      </p>

      <BottomBar>
        <Button onClick={start} disabled={!respondentComplete}>
          Start survey
        </Button>
      </BottomBar>
    </ScreenShell>
  );
}
