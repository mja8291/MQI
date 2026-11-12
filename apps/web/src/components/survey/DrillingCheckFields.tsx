import { useState } from "react";
import {
  DRILLING_DONE_QUESTION,
  DRILLING_POINT_OPTIONS,
  DRILLING_POINT_QUESTION,
  DRILLING_REPAIR_QUESTION,
  SCREED_THICKNESS_LABEL,
  SCREED_UNSAFE_MM,
  SCREED_UNSAFE_NOTE,
  SITE_PHOTO_DRILLING_POINT,
  SITE_PHOTO_SLAB_THICKNESS,
  SLAB_ASSESSMENT_OPTIONS,
  SLAB_ASSESSMENT_QUESTION,
  SLAB_THICKNESS_LABEL,
  TOTAL_DEPTH_GUIDANCE,
  TOTAL_DEPTH_LABEL,
  fromMmText,
  toMmText,
} from "@mqi/shared";
import type { DrillHole, DrillingCheck, LengthUnit } from "@mqi/shared";
import { Field } from "@/components/ui/Field";
import { ReviewPhotoField } from "./ReviewPhotoField";

const INPUT = "w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink";
const SELECT = INPUT;

/**
 * v2 (W55): a depth typed in mm or inches. The survey always stores mm (the sheet's columns are mm);
 * in inches the typed text is kept here so "10." can still be typed, and the mm it saves is shown.
 * Re-mounted (key) when the unit changes.
 */
function LengthInput({
  valueMm,
  unit,
  onChange,
  ariaLabel,
}: {
  valueMm: string;
  unit: LengthUnit;
  onChange: (mm: string) => void;
  ariaLabel?: string;
}) {
  const [typed, setTyped] = useState(() => fromMmText(valueMm, unit));
  // A change from elsewhere (not what was typed here) replaces the typed text.
  const shown = unit === "mm" ? valueMm : toMmText(typed, unit) === valueMm ? typed : fromMmText(valueMm, unit);
  const mmKnown = valueMm.trim() !== "" && Number.isFinite(Number(valueMm));
  return (
    <>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        placeholder={unit}
        aria-label={ariaLabel}
        value={shown}
        onChange={(e) => {
          setTyped(e.target.value);
          onChange(toMmText(e.target.value, unit));
        }}
        className={INPUT}
      />
      {unit === "in" && mmKnown ? <p className="mt-1 text-[11.5px] text-ink-faint">= {valueMm} mm</p> : null}
    </>
  );
}

/** v2 (W55): mm or inches for every depth on the drilling card. */
function UnitChoice({ unit, onChange }: { unit: LengthUnit; onChange: (u: LengthUnit) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <span className="text-xs font-semibold text-ink-soft">Measurements in</span>
      <div role="radiogroup" aria-label="Measurement unit" className="inline-flex rounded-lg border border-border overflow-hidden">
        {(["mm", "in"] as const).map((u) => (
          <button
            key={u}
            type="button"
            role="radio"
            aria-checked={unit === u}
            onClick={() => onChange(u)}
            className={`px-4 py-1.5 text-[13px] font-semibold ${unit === u ? "bg-brand text-white" : "bg-white text-ink"}`}
          >
            {u === "mm" ? "mm" : "inches"}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One depth field: label with the unit, the input, and an optional note under it. */
function DepthField({
  label,
  valueMm,
  unit,
  onChange,
  ariaLabel,
  children,
}: {
  label: string;
  valueMm: string;
  unit: LengthUnit;
  onChange: (mm: string) => void;
  ariaLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <Field label={`${label} (${unit})`}>
      <LengthInput key={unit} valueMm={valueMm} unit={unit} onChange={onChange} ariaLabel={ariaLabel} />
      {children}
    </Field>
  );
}

/** v2 (W45): each hole's first reading, with the standing guidance under it. */
function TotalDepthField({ value, unit, onChange, ariaLabel }: { value: string; unit: LengthUnit; onChange: (v: string) => void; ariaLabel?: string }) {
  return (
    <DepthField label={TOTAL_DEPTH_LABEL} valueMm={value} unit={unit} onChange={onChange} ariaLabel={ariaLabel}>
      <p className="mt-1.5 text-[12px] leading-snug text-ink-soft">{TOTAL_DEPTH_GUIDANCE}</p>
    </DepthField>
  );
}

/** Shown under a screed reading of 110 mm or more (the value is always mm). */
function ScreedNote({ value }: { value: string }) {
  return Number(value) >= SCREED_UNSAFE_MM ? <p className="-mt-2 mb-3 text-[12px] leading-snug text-band-poor">{SCREED_UNSAFE_NOTE}</p> : null;
}

/**
 * The slab / roof-screeding drilling check ("Drilling & observation"). v2 (W27): asked while
 * scoring a Roof location instead of on the Review page; one answer per survey.
 */
export function DrillingCheckFields({ drilling, onChange }: { drilling: DrillingCheck; onChange: (value: DrillingCheck) => void }) {
  const unit: LengthUnit = drilling.unit ?? "mm";
  return (
    <>
      <Field label={DRILLING_DONE_QUESTION}>
        <select value={drilling.done} onChange={(e) => onChange({ ...drilling, done: e.target.value as DrillingCheck["done"] })} className={SELECT}>
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
              onChange={(e) => onChange({ ...drilling, pointMarked: e.target.value as DrillingCheck["pointMarked"] })}
              className={SELECT}
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

          <UnitChoice unit={unit} onChange={(u) => onChange({ ...drilling, unit: u })} />
          <TotalDepthField value={drilling.totalDepthMm ?? ""} unit={unit} onChange={(v) => onChange({ ...drilling, totalDepthMm: v })} />

          <DepthField label={SLAB_THICKNESS_LABEL} valueMm={drilling.slabThicknessMm} unit={unit} onChange={(v) => onChange({ ...drilling, slabThicknessMm: v })} />

          <Field label={SLAB_ASSESSMENT_QUESTION}>
            <select
              value={drilling.slabAssessment ?? ""}
              onChange={(e) => onChange({ ...drilling, slabAssessment: e.target.value as DrillingCheck["slabAssessment"] })}
              className={SELECT}
            >
              <option value="">Select an answer</option>
              {SLAB_ASSESSMENT_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Field>
          {/* W70: the photo of the drilled hole is required. */}
          <ReviewPhotoField itemName={SITE_PHOTO_SLAB_THICKNESS} required />

          <DepthField label={SCREED_THICKNESS_LABEL} valueMm={drilling.screedThicknessMm} unit={unit} onChange={(v) => onChange({ ...drilling, screedThicknessMm: v })} />
          <ScreedNote value={drilling.screedThicknessMm} />

          {/* v2 (W36): further drill holes, each with its own readings. */}
          {(drilling.extraHoles ?? []).map((hole, i) => {
            const setHole = (patch: Partial<DrillHole>) =>
              onChange({ ...drilling, extraHoles: (drilling.extraHoles ?? []).map((h, j) => (j === i ? { ...h, ...patch } : h)) });
            return (
              <div key={i} className="rounded-xl border border-border bg-white px-3 pt-3 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13.5px] font-semibold text-ink">Drill hole {i + 2}</span>
                  <button
                    type="button"
                    onClick={() => onChange({ ...drilling, extraHoles: (drilling.extraHoles ?? []).filter((_, j) => j !== i) })}
                    className="text-[12.5px] font-semibold text-band-poor underline"
                  >
                    Remove
                  </button>
                </div>
                <TotalDepthField
                  value={hole.totalDepthMm ?? ""}
                  unit={unit}
                  onChange={(v) => setHole({ totalDepthMm: v })}
                  ariaLabel={`Drill hole ${i + 2}: total depth (${unit})`}
                />
                <DepthField
                  label={SLAB_THICKNESS_LABEL}
                  valueMm={hole.slabThicknessMm}
                  unit={unit}
                  onChange={(v) => setHole({ slabThicknessMm: v })}
                  ariaLabel={`Drill hole ${i + 2}: slab thickness (${unit})`}
                />
                <Field label={SLAB_ASSESSMENT_QUESTION}>
                  <select
                    aria-label={`Drill hole ${i + 2}: slab thickness assessment`}
                    value={hole.slabAssessment}
                    onChange={(e) => setHole({ slabAssessment: e.target.value as DrillHole["slabAssessment"] })}
                    className={SELECT}
                  >
                    <option value="">Select an answer</option>
                    {SLAB_ASSESSMENT_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </Field>
                <DepthField
                  label={SCREED_THICKNESS_LABEL}
                  valueMm={hole.screedThicknessMm}
                  unit={unit}
                  onChange={(v) => setHole({ screedThicknessMm: v })}
                  ariaLabel={`Drill hole ${i + 2}: roof screeding thickness (${unit})`}
                />
                <ScreedNote value={hole.screedThicknessMm} />
              </div>
            );
          })}
          <button
            type="button"
            onClick={() =>
              onChange({ ...drilling, extraHoles: [...(drilling.extraHoles ?? []), { totalDepthMm: "", slabThicknessMm: "", screedThicknessMm: "", slabAssessment: "" }] })
            }
            className="mb-4 text-[13px] font-semibold text-brand-deep underline"
          >
            + Add another drill hole
          </button>

          <Field label={DRILLING_REPAIR_QUESTION}>
            <select
              value={drilling.holeRepaired}
              onChange={(e) => onChange({ ...drilling, holeRepaired: e.target.value as DrillingCheck["holeRepaired"] })}
              className={SELECT}
            >
              <option value="">Select an answer</option>
              <option value="YES">YES</option>
              <option value="NO">NO</option>
            </select>
          </Field>
        </div>
      ) : null}
    </>
  );
}
