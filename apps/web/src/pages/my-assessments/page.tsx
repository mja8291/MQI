import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { FileGetResult, FoundSurvey, RubricItem } from "@mqi/shared";
import { SLAB_ASSESSMENT_QUESTION, itemLabel } from "@mqi/shared";
import { ScreenShell } from "@/components/ui/ScreenShell";
import { TopBar } from "@/components/ui/TopBar";
import { api } from "@/lib/api";
import { BAND_COLOR } from "@/lib/scoring";
import type { LocationType } from "@/lib/types";

/**
 * v2 (W54): one submitted assessment, read only, loaded from the server each time it opens
 * (nothing of it is kept on the phone). Photos load one at a time, when tapped.
 */

type Photo = NonNullable<FoundSurvey["photos"]>[number];

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-border last:border-0 text-[12.5px]">
      <span className="text-ink-soft">{label}</span>
      <span className="text-ink text-right font-medium">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3.5 py-2.5 mb-3">
      <div className="text-[12px] font-semibold text-brand-deep uppercase tracking-wide mb-1">{title}</div>
      {children}
    </div>
  );
}

/** The condition as the surveyor picked it (OK/Unsafe for two-state items). */
function shown(item: RubricItem | undefined, condition: string): string {
  return item?.conditionOverride?.find((o) => o.condition === condition)?.label ?? condition;
}

function PhotoButton({ photo }: { photo: Photo }) {
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  async function load() {
    setState("loading");
    try {
      const f = await api<FileGetResult>("files.get", { attachmentId: photo.attachmentId });
      setSrc(`data:${f.mimeType};base64,${f.data}`);
      setState("idle");
    } catch {
      setState("error");
    }
  }
  if (src) return <img src={src} alt={photo.itemName} className="mt-1.5 w-full rounded-lg border border-border" />;
  return (
    <button type="button" onClick={() => void load()} disabled={state === "loading"} className="text-[11.5px] font-semibold text-brand-deep underline">
      {state === "loading" ? "Loading photo…" : state === "error" ? "Couldn't load — tap to try again" : `Show photo: ${photo.itemName}`}
    </button>
  );
}

function AssessmentContent() {
  const router = useRouter();
  const id = useSearchParams().get("id") ?? "";
  const [survey, setSurvey] = useState<FoundSurvey | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api<FoundSurvey>("surveys.get", { surveyId: id })
      .then(setSurvey)
      .catch(() =>
        setError(navigator.onLine === false ? "No connection. Assessments load from the server — open this one when you are online." : "Couldn't load this assessment. Try again shortly."),
      );
  }, [id]);

  const back = () => router.push("/?tab=mine");
  if (error || !id)
    return (
      <ScreenShell>
        <TopBar title="My assessment" onBack={back} />
        <p className="text-sm text-band-poor py-6">{error ?? "No assessment chosen."}</p>
      </ScreenShell>
    );
  if (!survey)
    return (
      <ScreenShell>
        <TopBar title="My assessment" onBack={back} />
        <p className="text-sm text-ink-faint py-6 text-center">Loading from the server…</p>
      </ScreenShell>
    );

  const items = new Map(survey.items.map((i) => [i.name, i]));
  const photos = survey.photos ?? [];
  const photosAt = (location: string) => photos.filter((p) => p.locationName === location);
  const d = survey.drillingCheck;
  const site = survey.siteChecks;
  const band = survey.ratingBandLabel as keyof typeof BAND_COLOR;

  return (
    <ScreenShell>
      <TopBar title={survey.campusName} subtitle="Submitted · read only" onBack={back} />
      <div className="pb-8">
        <Section title="Result">
          <div className="text-[22px] font-display font-semibold" style={{ color: BAND_COLOR[band] ?? "inherit" }}>
            {survey.overall !== null ? `${Math.round(survey.overall)}% · ${survey.ratingBandLabel}` : "—"}
          </div>
          <Row label="Functionality" value={survey.functionality !== null ? `${Math.round(survey.functionality)}%` : null} />
          <Row label="Safety" value={survey.safety !== null ? `${Math.round(survey.safety)}%` : null} />
          <Row label="Aesthetics" value={survey.aesthetics !== null ? `${Math.round(survey.aesthetics)}%` : null} />
          <Row label="Items covered" value={survey.itemsCoveredPercent !== null ? `${survey.itemsCoveredPercent}%` : null} />
        </Section>
        <Section title="Campus and people">
          <Row label="Region · Area" value={`${survey.region} · ${survey.area}`} />
          <Row label="Submitted" value={new Date(survey.submittedAt).toLocaleString()} />
          <Row label="Accompanying engineering staff" value={survey.apm} />
          <Row label="ASM" value={survey.asm} />
          <Row label="School principal" value={survey.principal} />
          <Row label="Purpose" value={survey.purpose || "Actual assessment"} />
        </Section>
        <Section title="Building and site">
          <Row label="Power supply" value={survey.powerSupply} />
          <Row label="Structural concern observed" value={survey.structuralConcern} />
          <Row label="Suggested structural type" value={survey.buildingStructure} />
          <Row label="Centre beam in classrooms" value={survey.centerBeam} />
          <Row label="Roof access" value={site.roofAccessType} />
          <Row label="Overflow disposal" value={site.overflowDisposal} />
          <Row label="Roof clean of dirt and vegetation" value={site.roofClean} />
          <Row label="Rain spouts clear" value={site.rainSpoutsClear} />
          <Row label="Risk factors" value={[...site.riskFactors, site.riskFactorOther].filter(Boolean).join(", ")} />
        </Section>
        {d.done ? (
          <Section title="Drilling & observation">
            <Row label="Drilling check done" value={d.done} />
            <Row label="Drilling point marked" value={d.pointMarked} />
            <Row label="Total depth" value={d.totalDepthMm ? `${d.totalDepthMm} mm` : ""} />
            <Row label="Slab thickness" value={d.slabThicknessMm ? `${d.slabThicknessMm} mm` : ""} />
            <Row label={SLAB_ASSESSMENT_QUESTION} value={d.slabAssessment} />
            <Row label="Roof screeding thickness" value={d.screedThicknessMm ? `${d.screedThicknessMm} mm` : ""} />
            <Row label="Hole repaired" value={d.holeRepaired} />
            <Row label="Additional drill holes" value={survey.additionalDrillHoles} />
          </Section>
        ) : null}
        {(survey.locations ?? []).map((loc, i) => (
          <Section key={`${loc.name}-${i}`} title={`${loc.floorLevel} · ${loc.name}`}>
            {Object.entries(loc.scores).map(([name, condition]) => (
              <Row key={name} label={itemLabel(items.get(name) ?? { name }, loc.type as LocationType)} value={shown(items.get(name), condition)} />
            ))}
            <Row label="Column crack > 3 mm" value={loc.columnCrackOver3mm} />
            <Row label="Schmidt Hammer available" value={loc.schmidtAvailable} />
            <Row label="Schmidt Hammer reading" value={loc.schmidtReading ? `${loc.schmidtReading} N/mm²` : ""} />
            {photosAt(loc.name).length ? (
              <div className="pt-2 space-y-1.5">
                {photosAt(loc.name).map((p) => (
                  <PhotoButton key={p.attachmentId} photo={p} />
                ))}
              </div>
            ) : null}
          </Section>
        ))}
        {photosAt("").length ? (
          <Section title="Site photos">
            <div className="space-y-1.5">
              {photosAt("").map((p) => (
                <PhotoButton key={p.attachmentId} photo={p} />
              ))}
            </div>
          </Section>
        ) : null}
        {survey.complaints ? (
          <Section title="Major complaints or remarks">
            <p className="text-[12.5px] text-ink whitespace-pre-wrap py-1">{survey.complaints}</p>
          </Section>
        ) : null}
      </div>
    </ScreenShell>
  );
}

export default function MyAssessmentPage() {
  return (
    <Suspense fallback={null}>
      <AssessmentContent />
    </Suspense>
  );
}
