
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/ui/ScreenShell";
import { TopBar } from "@/components/ui/TopBar";
import { Field, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { BottomBar } from "@/components/ui/BottomBar";
import { useSurvey } from "@/lib/survey-context";

/**
 * Respondent details, then straight into Method 2. This used to be the
 * Method 1 / Method 2 choice; Method 1 can no longer be started (Method 2 —
 * scoring location by location — is the only method). The route keeps its
 * old name so every link and the find-school redirect guards still point at
 * it. A Method 1 survey already in progress on someone's phone can still be
 * resumed and finished (see survey/resume and the m1 pages), it just can't
 * be begun here.
 */
export default function MethodChoicePage() {
  const router = useRouter();
  const { state, hydrated, setRespondent, setMethod } = useSurvey();
  const [apm, setApm] = useState(state.apm);
  const [asm, setAsm] = useState(state.asm);
  const [principal, setPrincipal] = useState(state.principal);

  useEffect(() => {
    // See survey/m1/campus-visit/page.tsx's matching effect for why this waits.
    if (!hydrated) return;
    if (!state.school) router.replace("/survey/find-school");
  }, [hydrated, state.school, router]);

  const respondentComplete = Boolean(apm.trim() && asm.trim() && principal.trim());

  function start() {
    if (!respondentComplete) return;
    setRespondent(asm, apm, principal);
    setMethod(2);
    router.push("/survey/m2");
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
