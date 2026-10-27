
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/ui/ScreenShell";
import { TopBar } from "@/components/ui/TopBar";
import { Gauge } from "@/components/ui/Gauge";
import { CategoryBar } from "@/components/ui/CategoryBar";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { BottomBar } from "@/components/ui/BottomBar";
import { useSurvey } from "@/lib/survey-context";
import { CATEGORIES, CRITICAL_ITEMS, ratingBand, scoreMethod1, scoreMethod2 } from "@/lib/scoring";
import { isMethod2LocationComplete } from "@/lib/data/method2-items";
import {
  BUILDING_STRUCTURE_OPTIONS,
  BUILDING_STRUCTURE_QUESTION,
  CENTER_BEAM_OPTIONS,
  CENTER_BEAM_QUESTION,
  DRILLING_DONE_QUESTION,
  DRILLING_POINT_OPTIONS,
  DRILLING_POINT_QUESTION,
  DRILLING_REPAIR_QUESTION,
  OATH_TEXT,
  OVERFLOW_OPTIONS,
  OVERFLOW_QUESTION,
  POWER_SUPPLY_OPTIONS,
  RISK_FACTOR_OPTIONS,
  RISK_FACTOR_OTHER,
  RISK_FACTOR_QUESTION,
  ROOF_ACCESS_TYPE_OPTIONS,
  ROOF_ACCESS_TYPE_QUESTION,
  SCREED_THICKNESS_LABEL,
  SLAB_ASSESSMENT_QUESTION,
  SLAB_THICKNESS_LABEL,
  STRUCTURAL_CONCERN_OPTIONS,
  STRUCTURAL_CONCERN_QUESTION,
  TYPE_OF_STRUCTURE_OPTIONS,
  TYPE_OF_STRUCTURE_QUESTION,
  YES_NO_OPTIONS,
} from "@/lib/data/content";
import {
  SITE_PHOTO_DRILLING_POINT,
  SITE_PHOTO_RAIN_SPOUTS,
  SITE_PHOTO_ROOF_CLEAN,
  SITE_PHOTO_SLAB_THICKNESS,
  emptyDrillingCheck,
  emptySiteChecks,
  isDrillingCheckComplete,
  isSiteChecksComplete,
} from "@/lib/types";
import type {
  BuildingStructure,
  CenterBeam,
  DrillingCheck,
  PhotoAsset,
  PowerSupply,
  SiteChecks,
  StructuralConcern,
  TypeOfStructure,
} from "@/lib/types";
import { ReviewPhotoField } from "@/components/survey/ReviewPhotoField";
import { buildSubmission, checkSubmission, countUnresolvedPhotos } from "@/lib/submit";
import { queueSurvey } from "@/lib/offline/db";
import { scheduleSync } from "@/lib/offline/sync";
import { discardSubmittedDraft } from "@/lib/draft";
import { formatDuration } from "@/lib/format-duration";
import { buildDraftExcelBlob, buildDraftPdfBlob, downloadBlob, draftExportFilenameBase } from "@/lib/export/draft-export";
import { FileSpreadsheet, FileText } from "lucide-react";

export default function ReviewPage() {
  const router = useRouter();
  const {
    state,
    hydrated,
    setPowerSupply,
    setStructuralConcern,
    setBuildingStructure,
    setTypeOfStructure,
    setCenterBeam,
    setDrillingCheck,
    setSiteChecks,
    setComplaints,
  } = useSurvey();
  const [powerSupply, setLocalPowerSupply] = useState<PowerSupply | "">(state.powerSupply);
  const [structuralConcern, setLocalStructuralConcern] = useState<StructuralConcern | "">(state.structuralConcern);
  const [buildingStructure, setLocalBuildingStructure] = useState<BuildingStructure | "">(state.buildingStructure);
  const [typeOfStructure, setLocalTypeOfStructure] = useState<TypeOfStructure | "">(state.typeOfStructure);
  const [centerBeam, setLocalCenterBeam] = useState<CenterBeam | "">(state.centerBeam);
  // Spread over the empty shapes so a draft saved before a field existed
  // (e.g. slabAssessment) opens with it blank rather than undefined.
  const [drilling, setDrilling] = useState<DrillingCheck>({ ...emptyDrillingCheck(), ...state.drillingCheck });
  const [site, setSite] = useState<SiteChecks>({ ...emptySiteChecks(), ...state.siteChecks });
  const [complaints, setLocalComplaints] = useState(state.complaints);
  const [oath, setOath] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);

  useEffect(() => {
    // See survey/m1/campus-visit/page.tsx's matching effect for why this waits.
    if (!hydrated) return;
    if (!state.school || !state.method) {
      router.replace("/survey/find-school");
      return;
    }
    // Defense in depth — the Floor Level page already blocks navigating here
    // with an incomplete location, but don't trust only client-side button
    // state to guarantee that (e.g. a direct URL visit).
    if (state.method === 2) {
      const incomplete = state.m2.locations.length === 0 || state.m2.locations.some((l) => !isMethod2LocationComplete(l));
      if (incomplete) router.replace("/survey/m2");
    }
  }, [hydrated, state.school, state.method, state.m2.locations, router]);

  const result = useMemo(
    () => (state.method === 1 ? scoreMethod1(state.m1.scores) : scoreMethod2(state.m2.locations)),
    [state.method, state.m1.scores, state.m2.locations]
  );

  // A snapshot, not a live tick — Date.now() can't be called during render
  // (react-hooks/purity), and setState can't be called synchronously in an
  // effect body (react-hooks/set-state-in-effect), so the read+set is
  // deferred a microtask out via queueMicrotask. This recap row doesn't need
  // to update every second the way the persistent timer bar does.
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);
  useEffect(() => {
    if (!state.startTime) {
      queueMicrotask(() => setElapsedSeconds(null));
      return;
    }
    const startTime = state.startTime;
    const pausedAt = state.pausedAt;
    const pausedSeconds = state.pausedSeconds;
    queueMicrotask(() => {
      const pausedTotal = pausedSeconds + (pausedAt ? (Date.now() - new Date(pausedAt).getTime()) / 1000 : 0);
      setElapsedSeconds(Math.max(0, Math.round((Date.now() - new Date(startTime).getTime()) / 1000 - pausedTotal)));
    });
  }, [state.startTime, state.pausedAt, state.pausedSeconds]);

  if (!state.school || !state.method) return null;

  const band = ratingBand(result.overall);
  // Round 3 Task 8: photos upload individually as soon as they're attached
  // (see use-photo-upload-handlers.ts), not bundled into this submit — but
  // that means a photo can still be mid-upload, or stuck in "error", by the
  // time the surveyor reaches Review. "uploading" still blocks Submit (it'd
  // otherwise race that upload's own state update) — but "error" no longer
  // does: with no connectivity at all for the whole visit, *every* photo
  // attach fails immediately, and forcing that surveyor to strip every
  // photo just to submit would defeat the entire point of the offline
  // queue. A failed photo now travels with the submission as a
  // PendingPhotoUpload instead (see submit.ts/offline/sync.ts) and finishes
  // uploading whenever the queue next gets a connection — going back to
  // retry or remove it here is still offered, just no longer required.
  // Last-page photos only count while the answer that asked for them still
  // stands — switch "Roof clean" back to Yes, or the drilling check to NO,
  // and a photo taken for the other answer is left behind, not submitted.
  const reviewPhotos: Record<string, PhotoAsset[]> = {};
  const keepPhotos = (key: string, applies: boolean) => {
    if (applies && state.reviewPhotos[key]?.length) reviewPhotos[key] = state.reviewPhotos[key];
  };
  keepPhotos(SITE_PHOTO_ROOF_CLEAN, site.roofClean === "No");
  keepPhotos(SITE_PHOTO_RAIN_SPOUTS, site.rainSpoutsClear === "No");
  keepPhotos(SITE_PHOTO_DRILLING_POINT, drilling.done === "YES");
  keepPhotos(SITE_PHOTO_SLAB_THICKNESS, drilling.done === "YES");

  const { uploading: photosUploading } = countUnresolvedPhotos([
    ...(state.method === 1 ? [state.m1.photos] : state.m2.locations.map((l) => l.photos)),
    reviewPhotos,
  ]);
  const canSubmit =
    oath &&
    Boolean(powerSupply) &&
    Boolean(structuralConcern) &&
    Boolean(buildingStructure) &&
    Boolean(typeOfStructure) &&
    Boolean(centerBeam) &&
    isDrillingCheckComplete(drilling) &&
    isSiteChecksComplete(site, reviewPhotos) &&
    !submitting &&
    photosUploading === 0;

  // Once Submit is tapped and actually accepted — synced immediately, or
  // queued for later — the assessment is done, not still a draft: nothing
  // deleted the autosaved draft record before this (autosave keeps writing
  // it right up through this page, submission included), so without this
  // an already-submitted survey kept showing on Home as if it were still
  // waiting to be finished, alongside its own real "queued, waiting to
  // sync" state if it went offline — confusing and easy to mistake for
  // duplicate, unfinished work. Not called on a real failure (res.ok false
  // below) — that one genuinely needs the draft kept so nothing's lost.
  async function clearDraft() {
    if (!state.surveyId) return;
    await discardSubmittedDraft(state.surveyId);
  }

  async function submit() {
    if (
      !canSubmit ||
      !powerSupply ||
      !structuralConcern ||
      !buildingStructure ||
      !typeOfStructure ||
      !centerBeam ||
      !state.school ||
      !state.method
    )
      return;
    setSubmitting(true);
    setError(null);
    setPowerSupply(powerSupply);
    setStructuralConcern(structuralConcern);
    setBuildingStructure(buildingStructure);
    setTypeOfStructure(typeOfStructure);
    setCenterBeam(centerBeam);
    // Switching the answer back to "NO" after filling the details in must not
    // send them along — a check that wasn't done has no thickness to report.
    const drillingCheck: DrillingCheck =
      drilling.done === "YES"
        ? { ...drilling, slabThicknessMm: drilling.slabThicknessMm.trim(), screedThicknessMm: drilling.screedThicknessMm.trim() }
        : { ...emptyDrillingCheck(), done: "NO" };
    setDrillingCheck(drillingCheck);
    // The "Any other" text only travels with "Any other" ticked.
    const siteChecks: SiteChecks = {
      ...site,
      riskFactorOther: site.riskFactors.includes(RISK_FACTOR_OTHER) ? site.riskFactorOther.trim() : "",
    };
    setSiteChecks(siteChecks);
    setComplaints(complaints);

    // v2: the survey and its outbox entry are committed on the phone in one transaction and the
    // screen moves on at once; the sync engine sends it (now if online, later if not).
    const submission = await buildSubmission(
      {
        ...state,
        school: state.school,
        method: state.method,
        powerSupply,
        structuralConcern,
        buildingStructure,
        typeOfStructure,
        centerBeam,
        drillingCheck,
        siteChecks,
        reviewPhotos,
        complaints,
      },
      result
    );
    const issues = checkSubmission(submission);
    if (issues.length) {
      setError(issues[0]!.message);
      setSubmitting(false);
      return;
    }
    try {
      await queueSurvey(submission.survey, submission.attachments);
    } catch {
      setError("Couldn't save the survey on this phone. Free some storage and try again — nothing has been lost.");
      setSubmitting(false);
      return;
    }
    await clearDraft();
    scheduleSync(0);
    router.push(`/survey/done?queued=1&id=${encodeURIComponent(submission.survey.id)}`);
  }

  // Round 3 Task 9 — a fallback for when Submit itself is failing: an
  // offline-capable, no-server-round-trip download of everything scored so
  // far, so the surveyor's work isn't trapped in the app. Available
  // whenever, not gated on the oath/power-supply Submit requires.
  async function exportAs(kind: "excel" | "pdf") {
    if (!state.school || !state.method || exporting) return;
    setExporting(kind);
    try {
      const filename = `${draftExportFilenameBase(state)}.${kind === "excel" ? "xlsx" : "pdf"}`;
      const params = {
        state,
        result,
        powerSupply: powerSupply || "",
        structuralConcern: structuralConcern || "",
        buildingStructure: buildingStructure || "",
        typeOfStructure: typeOfStructure || "",
        centerBeam: centerBeam || "",
        drillingCheck: drilling,
        siteChecks: site,
        complaints,
      };
      const blob = kind === "excel" ? await buildDraftExcelBlob(params) : await buildDraftPdfBlob(params);
      downloadBlob(blob, filename);
    } finally {
      setExporting(null);
    }
  }

  return (
    <ScreenShell>
      <TopBar
        title="Review and submit"
        onBack={() => router.push(state.method === 1 ? "/survey/m1" : "/survey/m2")}
      />

      <div className="space-y-0.5 mb-4">
        <RecapRow k="School" v={state.school.name} />
        <RecapRow k="Accompanying APM" v={state.apm || "—"} />
        <RecapRow k="Responding ASM" v={state.asm || "—"} />
        <RecapRow k="School Principal" v={state.principal || "—"} />
        {state.method === 2 ? <RecapRow k="Locations recorded" v={String(state.m2.locations.length)} /> : null}
        {elapsedSeconds !== null ? <RecapRow k="Time on assessment" v={formatDuration(elapsedSeconds)} /> : null}
      </div>

      <div className="rounded-2xl bg-brand-deep text-white p-4.5 text-center mb-4">
        <div className="text-xs opacity-75 mb-1">Overall MQI score</div>
        <div className="font-display text-[32px] font-semibold">
          {result.overall === null ? "—" : `${Math.round(result.overall)}%`}
          {band ? <span className="text-base font-normal opacity-80 ml-2">{band}</span> : null}
        </div>
      </div>

      <div className="flex items-center gap-3.5 mb-4">
        <Gauge score={result.overall} size={64} />
        <div className="flex-1">
          {CATEGORIES.map((cat) => (
            <CategoryBar key={cat} category={cat} score={result.categories[cat].score} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[11px] text-ink-faint mb-0.5">Major score (Engineering)</div>
          <div className="font-display text-lg font-semibold text-brand-deep">
            {result.major === null ? "—" : `${Math.round(result.major)}%`}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[11px] text-ink-faint mb-0.5">Minor score (School staff)</div>
          <div className="font-display text-lg font-semibold text-brand-deep">
            {result.minor === null ? "—" : `${Math.round(result.minor)}%`}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="text-xs font-semibold text-brand-deep uppercase tracking-wide mb-2">Critical items</div>
        <div className="rounded-2xl border border-border bg-card divide-y divide-border">
          {CRITICAL_ITEMS.map((name) => {
            const score = result.criticalItems[name];
            return (
              <div key={name} className="flex justify-between items-center px-3.5 py-2.5 text-[13px]">
                <span className="text-ink-soft">{name.replace(" *", "")}</span>
                <span className="font-semibold text-ink">{score === null || score === undefined ? "—" : `${Math.round(score)}%`}</span>
              </div>
            );
          })}
        </div>
      </div>

      <Field label="Power supply">
        <select
          value={powerSupply}
          onChange={(e) => setLocalPowerSupply(e.target.value as PowerSupply)}
          className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
        >
          <option value="">Select power supply</option>
          {POWER_SUPPLY_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>

      <Field label={STRUCTURAL_CONCERN_QUESTION}>
        <select
          value={structuralConcern}
          onChange={(e) => setLocalStructuralConcern(e.target.value as StructuralConcern)}
          className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
        >
          <option value="">Select an answer</option>
          {STRUCTURAL_CONCERN_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </Field>

      <Field label={BUILDING_STRUCTURE_QUESTION}>
        <select
          value={buildingStructure}
          onChange={(e) => setLocalBuildingStructure(e.target.value as BuildingStructure)}
          className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
        >
          <option value="">Select structural type</option>
          {BUILDING_STRUCTURE_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </Field>

      <SectionLabel>Visual inspection</SectionLabel>

      <Field label={TYPE_OF_STRUCTURE_QUESTION}>
        <select
          value={typeOfStructure}
          onChange={(e) => setLocalTypeOfStructure(e.target.value as TypeOfStructure)}
          className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
        >
          <option value="">Select type of structure</option>
          {TYPE_OF_STRUCTURE_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </Field>

      <Field label={CENTER_BEAM_QUESTION}>
        <select
          value={centerBeam}
          onChange={(e) => setLocalCenterBeam(e.target.value as CenterBeam)}
          className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
        >
          <option value="">Select an answer</option>
          {CENTER_BEAM_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </Field>

      <Field label={ROOF_ACCESS_TYPE_QUESTION}>
        <select
          value={site.roofAccessType}
          onChange={(e) => setSite({ ...site, roofAccessType: e.target.value as SiteChecks["roofAccessType"] })}
          className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
        >
          <option value="">Select an answer</option>
          {ROOF_ACCESS_TYPE_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </Field>

      <SectionLabel>Roof &amp; drainage</SectionLabel>

      <Field label={OVERFLOW_QUESTION}>
        <select
          value={site.overflowDisposal}
          onChange={(e) => setSite({ ...site, overflowDisposal: e.target.value as SiteChecks["overflowDisposal"] })}
          className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
        >
          <option value="">Select an answer</option>
          {OVERFLOW_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </Field>

      <Field label={SITE_PHOTO_ROOF_CLEAN}>
        <select
          value={site.roofClean}
          onChange={(e) => setSite({ ...site, roofClean: e.target.value as SiteChecks["roofClean"] })}
          className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
        >
          <option value="">Select an answer</option>
          {YES_NO_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o === "No" ? "No — take picture" : o}
            </option>
          ))}
        </select>
      </Field>
      {site.roofClean === "No" ? <ReviewPhotoField itemName={SITE_PHOTO_ROOF_CLEAN} required /> : null}

      <Field label={SITE_PHOTO_RAIN_SPOUTS}>
        <select
          value={site.rainSpoutsClear}
          onChange={(e) => setSite({ ...site, rainSpoutsClear: e.target.value as SiteChecks["rainSpoutsClear"] })}
          className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
        >
          <option value="">Select an answer</option>
          {YES_NO_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o === "No" ? "No — take picture" : o}
            </option>
          ))}
        </select>
      </Field>
      {site.rainSpoutsClear === "No" ? <ReviewPhotoField itemName={SITE_PHOTO_RAIN_SPOUTS} required /> : null}

      <SectionLabel>Drilling &amp; observation</SectionLabel>

      <Field label={DRILLING_DONE_QUESTION}>
        <select
          value={drilling.done}
          onChange={(e) => setDrilling({ ...drilling, done: e.target.value as DrillingCheck["done"] })}
          className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
        >
          <option value="">Select an answer</option>
          <option value="YES">YES</option>
          <option value="NO">NO</option>
        </select>
      </Field>

      {drilling.done === "YES" ? (
        <div className="rounded-xl border border-border bg-card px-3 pt-3 mb-4">
          <Field label={DRILLING_POINT_QUESTION}>
            <select
              value={drilling.pointMarked}
              onChange={(e) => setDrilling({ ...drilling, pointMarked: e.target.value as DrillingCheck["pointMarked"] })}
              className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
            >
              <option value="">Select an answer</option>
              {DRILLING_POINT_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Field>
          <ReviewPhotoField itemName={SITE_PHOTO_DRILLING_POINT} />

          <Field label={SLAB_THICKNESS_LABEL}>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              placeholder="mm"
              value={drilling.slabThicknessMm}
              onChange={(e) => setDrilling({ ...drilling, slabThicknessMm: e.target.value })}
              className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
            />
          </Field>

          <Field label={SLAB_ASSESSMENT_QUESTION}>
            <select
              value={drilling.slabAssessment ?? ""}
              onChange={(e) => setDrilling({ ...drilling, slabAssessment: e.target.value as DrillingCheck["slabAssessment"] })}
              className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
            >
              <option value="">Select an answer</option>
              {DRILLING_POINT_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Field>
          <ReviewPhotoField itemName={SITE_PHOTO_SLAB_THICKNESS} />

          <Field label={SCREED_THICKNESS_LABEL}>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              placeholder="mm"
              value={drilling.screedThicknessMm}
              onChange={(e) => setDrilling({ ...drilling, screedThicknessMm: e.target.value })}
              className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
            />
          </Field>

          <Field label={DRILLING_REPAIR_QUESTION}>
            <select
              value={drilling.holeRepaired}
              onChange={(e) => setDrilling({ ...drilling, holeRepaired: e.target.value as DrillingCheck["holeRepaired"] })}
              className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
            >
              <option value="">Select an answer</option>
              <option value="YES">YES</option>
              <option value="NO">NO</option>
            </select>
          </Field>
        </div>
      ) : null}

      <SectionLabel>Building proximity</SectionLabel>

      <Field label={RISK_FACTOR_QUESTION}>
        <div className="space-y-2">
          {RISK_FACTOR_OPTIONS.map((factor) => {
            const checked = site.riskFactors.includes(factor);
            return (
              <label key={factor} className="flex items-center gap-2.5 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setSite({
                      ...site,
                      riskFactors: checked ? site.riskFactors.filter((f) => f !== factor) : [...site.riskFactors, factor],
                    })
                  }
                  className="h-5 w-5 shrink-0 accent-[var(--brand)]"
                />
                {factor}
              </label>
            );
          })}
          {site.riskFactors.includes(RISK_FACTOR_OTHER) ? (
            <input
              type="text"
              placeholder="Please specify"
              value={site.riskFactorOther}
              onChange={(e) => setSite({ ...site, riskFactorOther: e.target.value })}
              className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
            />
          ) : null}
        </div>
      </Field>

      <Field label="Major complaints or additional remarks">
        <textarea
          rows={3}
          placeholder="Anything not captured item-by-item"
          value={complaints}
          onChange={(e) => setLocalComplaints(e.target.value)}
          className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
        />
      </Field>

      <label className="flex items-start gap-2.5 text-xs text-ink-soft leading-relaxed mt-2">
        <input
          type="checkbox"
          checked={oath}
          onChange={(e) => setOath(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]"
        />
        {OATH_TEXT}
      </label>

      {photosUploading > 0 ? (
        <p className="text-xs text-ink-faint mt-3">
          {photosUploading === 1 ? "1 photo is" : `${photosUploading} photos are`} still uploading — this finishes on its
          own, no need to wait on this screen.
        </p>
      ) : null}
      {error ? <p className="text-xs text-band-poor mt-3">{error}</p> : null}

      <BottomBar>
        <p className="text-[11px] text-ink-faint mb-1.5">
          Submission failing? Download a copy of everything scored so far — no connection needed.
        </p>
        <div className="flex gap-2.5 mb-2.5">
          <Button variant="ghost" className="flex-1" disabled={exporting !== null} onClick={() => exportAs("excel")}>
            <span className="inline-flex items-center justify-center gap-1.5">
              <FileSpreadsheet size={15} />
              {exporting === "excel" ? "Exporting…" : "Excel"}
            </span>
          </Button>
          <Button variant="ghost" className="flex-1" disabled={exporting !== null} onClick={() => exportAs("pdf")}>
            <span className="inline-flex items-center justify-center gap-1.5">
              <FileText size={15} />
              {exporting === "pdf" ? "Exporting…" : "PDF"}
            </span>
          </Button>
        </div>
        <Button disabled={!canSubmit} onClick={submit}>
          {submitting ? "Submitting…" : "Submit survey"}
        </Button>
      </BottomBar>
    </ScreenShell>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold text-brand-deep uppercase tracking-wide mt-5 mb-2">{children}</div>;
}

function RecapRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between text-[13px] py-2 border-b border-border">
      <span className="text-ink-faint">{k}</span>
      <span>{v}</span>
    </div>
  );
}
